-- Run AFTER parking.sql. Upgrade existing lots without deleting records.
begin;
alter table public.parking_members drop constraint if exists parking_members_role_check;
alter table public.parking_members add constraint parking_members_role_check check(role in ('admin','staff','driver'));
alter table public.parking_vehicles add column if not exists owner_user_id uuid references auth.users;
alter table public.parking_sessions add column if not exists driver_user_id uuid references auth.users;
alter table public.parking_sessions add column if not exists spot_label text;
create table if not exists public.parking_spots (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null references public.parking_lots on delete cascade,
 number integer not null check(number > 0), label text not null, active boolean not null default true,
 unique(lot_id,number), unique(lot_id,label), unique(lot_id,id)
);
alter table public.parking_sessions add column if not exists spot_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='parking_sessions_spot_lot_fk' and conrelid='public.parking_sessions'::regclass) then
  alter table public.parking_sessions add constraint parking_sessions_spot_lot_fk foreign key(lot_id,spot_id) references public.parking_spots(lot_id,id);
 end if;
end $$;
create unique index if not exists parking_one_vehicle_per_spot on public.parking_sessions(spot_id) where exit_at is null and spot_id is not null;

insert into public.parking_spots(lot_id,number,label)
select l.id,n,'P-' || case when n<1000 then lpad(n::text,3,'0') else n::text end
from public.parking_lots l cross join lateral generate_series(1,l.capacity) n on conflict(lot_id,number) do nothing;
-- Existing open sessions receive a unique spot. Physical assignments must be verified by staff.
do $$ declare s record; v_spot public.parking_spots%rowtype;
begin
 for s in select * from public.parking_sessions where exit_at is null and spot_id is null order by entry_at,id loop
  select p.* into v_spot from public.parking_spots p where p.lot_id=s.lot_id and p.active
   and not exists(select 1 from public.parking_sessions x where x.spot_id=p.id and x.exit_at is null) order by p.number limit 1;
  if v_spot.id is null then raise exception 'Not enough spots to migrate open sessions. Check lot capacity.'; end if;
  update public.parking_sessions set spot_id=v_spot.id,spot_label=v_spot.label where id=s.id;
 end loop;
end $$;

-- "Member" continues to mean an operator; drivers do not inherit staff powers.
create or replace function public.parking_is_member(p_lot uuid,p_admin boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.parking_members where lot_id=p_lot and user_id=auth.uid() and role in ('admin','staff') and (not p_admin or role='admin'));
$$;
create or replace function public.parking_has_access(p_lot uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.parking_members where lot_id=p_lot and user_id=auth.uid());
$$;
revoke all on function public.parking_has_access(uuid) from public,anon;
grant execute on function public.parking_has_access(uuid) to authenticated;
drop policy if exists parking_lots_read on public.parking_lots;
create policy parking_lots_read on public.parking_lots for select to authenticated using(public.parking_has_access(id));
drop policy if exists parking_members_read on public.parking_members;
create policy parking_members_read on public.parking_members for select to authenticated using(public.parking_is_member(lot_id) or user_id=auth.uid());
drop policy if exists parking_vehicles_read on public.parking_vehicles;
create policy parking_vehicles_read on public.parking_vehicles for select to authenticated using(public.parking_is_member(lot_id) or (owner_user_id=auth.uid() and public.parking_has_access(lot_id)));
drop policy if exists parking_sessions_read on public.parking_sessions;
create policy parking_sessions_read on public.parking_sessions for select to authenticated using(public.parking_is_member(lot_id) or (driver_user_id=auth.uid() and public.parking_has_access(lot_id)));
alter table public.parking_spots enable row level security;
drop policy if exists parking_spots_read on public.parking_spots;
create policy parking_spots_read on public.parking_spots for select to authenticated using(public.parking_has_access(lot_id));
revoke all on public.parking_spots from anon,authenticated;
grant select on public.parking_spots to authenticated;

create or replace function public.parking_create_lot(p_name text,p_capacity integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Log in first.'; end if;
 insert into public.parking_lots(name,capacity) values(trim(p_name),p_capacity) returning id into v_id;
 insert into public.parking_members values(v_id,auth.uid(),'admin');
 insert into public.parking_spots(lot_id,number,label)
 select v_id,n,'P-' || case when n<1000 then lpad(n::text,3,'0') else n::text end from generate_series(1,p_capacity) n;
 return v_id;
end; $$;

create or replace function public.parking_update_lot(p_lot uuid,p_name text,p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 if p_capacity < (select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null) then raise exception 'Capacity cannot be lower than current occupancy.'; end if;
 if exists(select 1 from public.parking_sessions s join public.parking_spots p on p.id=s.spot_id where s.lot_id=p_lot and s.exit_at is null and p.number>p_capacity) then raise exception 'An occupied spot would be removed. Check those vehicles out before reducing capacity.'; end if;
 update public.parking_lots set name=trim(p_name),capacity=p_capacity where id=p_lot;
 insert into public.parking_spots(lot_id,number,label)
 select p_lot,n,'P-' || case when n<1000 then lpad(n::text,3,'0') else n::text end from generate_series(1,p_capacity) n on conflict(lot_id,number) do update set active=true;
 update public.parking_spots set active=false where lot_id=p_lot and number>p_capacity;
end; $$;

-- One atomic save: administrators link a confirmed account to a plate; users cannot claim arbitrary plates.
create or replace function public.parking_save_vehicle_account(p_lot uuid,p_plate text,p_owner text,p_expires date,p_active boolean,p_email text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g'));
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 if nullif(trim(p_email),'') is not null then
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'Ask the driver to create and confirm an account first.'; end if;
 end if;
 -- Never transfer a vehicle while it is checked in under a different driver.
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_plate and exit_at is null and driver_user_id is distinct from v_user) then raise exception 'Check this vehicle out before changing its linked account.'; end if;
 perform public.parking_save_vehicle(p_lot,v_plate,p_owner,p_expires,p_active);
 update public.parking_vehicles set owner_user_id=v_user where lot_id=p_lot and plate=v_plate;
 if v_user is not null then insert into public.parking_members values(p_lot,v_user,'driver') on conflict do nothing; end if;
end; $$;

create or replace function public.parking_record_entry(p_lot uuid,p_plate text,p_spot uuid,p_visitor_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_capacity integer; v_vehicle public.parking_vehicles%rowtype;
 v_spot public.parking_spots%rowtype; v_staff boolean; v_permit boolean; v_id uuid;
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 v_staff := public.parking_is_member(p_lot);
 if v_plate is null or v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$' then raise exception 'Enter a valid plate (2–15 characters).'; end if;
 select capacity into v_capacity from public.parking_lots where id=p_lot for update;
 select * into v_vehicle from public.parking_vehicles where lot_id=p_lot and plate=v_plate;
 if not v_staff and (v_vehicle.id is null or v_vehicle.owner_user_id is distinct from auth.uid()) then raise exception 'This plate is not linked to your account. Contact the parking administrator.'; end if;
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_plate and exit_at is null) then raise exception 'This vehicle is already checked in.'; end if;
 if (select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null)>=v_capacity then raise exception 'The parking lot is full.'; end if;
 v_permit := coalesce(v_vehicle.active and v_vehicle.permit_expires >= (now() at time zone 'UTC')::date,false);
 if not v_permit then
  if not v_staff then raise exception 'A valid active permit is required. Contact staff for visitor approval.'; end if;
  if p_visitor_reason is null or length(trim(p_visitor_reason)) not between 3 and 200 then raise exception 'No valid permit. Approve a visitor and enter a reason, or deny entry.'; end if;
 end if;
 if p_spot is null then
  if not v_staff then raise exception 'Choose an available parking spot.'; end if;
  select p.* into v_spot from public.parking_spots p where p.lot_id=p_lot and p.active and not exists(select 1 from public.parking_sessions s where s.spot_id=p.id and s.exit_at is null) order by p.number limit 1;
 else
  select * into v_spot from public.parking_spots where lot_id=p_lot and id=p_spot and active;
 end if;
 if v_spot.id is null then raise exception 'Choose an available parking spot in this lot.'; end if;
 if exists(select 1 from public.parking_sessions where spot_id=v_spot.id and exit_at is null) then raise exception 'That spot was just taken. Refresh and choose another spot.'; end if;
 insert into public.parking_sessions(lot_id,plate,admission,visitor_reason,entered_by,driver_user_id,spot_id,spot_label)
 values(p_lot,v_plate,case when v_permit then 'permit' else 'visitor' end,case when not v_permit then trim(p_visitor_reason) end,auth.uid(),v_vehicle.owner_user_id,v_spot.id,v_spot.label) returning id into v_id;
 return v_id;
end; $$;

-- Backward compatible operator endpoint; still enforces spot allocation.
create or replace function public.parking_check_in(p_lot uuid,p_plate text,p_visitor_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot) then raise exception 'Staff access required.'; end if;
 return public.parking_record_entry(p_lot,p_plate,null,p_visitor_reason);
end; $$;
create or replace function public.parking_check_out(p_lot uuid,p_plate text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 update public.parking_sessions set exit_at=now(),exited_by=auth.uid()
 where lot_id=p_lot and plate=upper(regexp_replace(trim(p_plate),'\s+',' ','g')) and exit_at is null
 and (public.parking_is_member(p_lot) or driver_user_id=auth.uid()) returning id into v_id;
 if v_id is null then raise exception 'No open parking session found for your account and this plate.'; end if;
 return v_id;
end; $$;

create or replace function public.parking_list_spots(p_lot uuid)
returns table(id uuid,number integer,label text,active boolean,occupied boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 return query select p.id,p.number,p.label,p.active,exists(select 1 from public.parking_sessions s where s.spot_id=p.id and s.exit_at is null)
 from public.parking_spots p where p.lot_id=p_lot order by p.number;
end; $$;

create or replace function public.parking_add_staff(p_lot uuid,p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 select id into v_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if v_user is null then raise exception 'Ask this person to create and confirm an account first.'; end if;
 insert into public.parking_members values(p_lot,v_user,'staff') on conflict(lot_id,user_id) do update set role=case when public.parking_members.role='admin' then 'admin' else 'staff' end;
end; $$;
-- Revoking operator powers should preserve a linked driver's personal access.
create or replace function public.parking_remove_staff(p_lot uuid,p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 if exists(select 1 from public.parking_vehicles where lot_id=p_lot and owner_user_id=p_user)
    or exists(select 1 from public.parking_sessions where lot_id=p_lot and driver_user_id=p_user) then
  update public.parking_members set role='driver' where lot_id=p_lot and user_id=p_user and role='staff';
 else
  delete from public.parking_members where lot_id=p_lot and user_id=p_user and role='staff';
 end if;
end; $$;
revoke all on function public.parking_save_vehicle_account(uuid,text,text,date,boolean,text),public.parking_record_entry(uuid,text,uuid,text),public.parking_list_spots(uuid) from public,anon;
grant execute on function public.parking_save_vehicle_account(uuid,text,text,date,boolean,text),public.parking_record_entry(uuid,text,uuid,text),public.parking_list_spots(uuid) to authenticated;
commit;
