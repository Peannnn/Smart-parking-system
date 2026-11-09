-- Run after 004_permit_checker_edits.sql. Visits are preserved; bookings are retired.
begin;
alter table public.parking_vehicles add column if not exists assigned_spot_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='parking_vehicles_assigned_spot_lot_fk' and conrelid='public.parking_vehicles'::regclass) then
  alter table public.parking_vehicles add constraint parking_vehicles_assigned_spot_lot_fk foreign key(lot_id,assigned_spot_id) references public.parking_spots(lot_id,id);
 end if;
end $$;
create unique index if not exists parking_one_permit_per_assigned_spot on public.parking_vehicles(assigned_spot_id) where assigned_spot_id is not null;
-- Do not invent permanent assignments for existing permits. Admins choose them explicitly.
update public.parking_reservations set status='cancelled' where status='booked';

create or replace function public.parking_save_permit_assigned(p_lot uuid,p_vehicle uuid,p_plate text,p_owner text,p_expires date,p_active boolean,p_email text,p_spot uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_old public.parking_vehicles%rowtype; v_user uuid; v_id uuid;
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 if v_plate is null or v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$' then raise exception 'Enter a valid plate (2–15 characters).'; end if;
 if p_vehicle is not null then
  select * into v_old from public.parking_vehicles where lot_id=p_lot and id=p_vehicle;
  if v_old.id is null then raise exception 'This permit no longer exists in this lot. Refresh before editing.'; end if;
 end if;
 if p_spot is null or not exists(select 1 from public.parking_spots where lot_id=p_lot and id=p_spot and active) then raise exception 'Assign an active parking spot in this lot.'; end if;
 if exists(select 1 from public.parking_vehicles where assigned_spot_id=p_spot and id is distinct from p_vehicle) then raise exception 'This spot is already assigned to another permit.'; end if;
 if nullif(trim(p_email),'') is not null then
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'Ask the driver to create and confirm an account first.'; end if;
 end if;
 if exists(select 1 from public.parking_vehicles where lot_id=p_lot and plate=v_plate and id is distinct from p_vehicle) then raise exception 'A permit for this plate already exists. Edit that permit instead.'; end if;
 if p_vehicle is not null and exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_old.plate and exit_at is null
   and (v_old.plate is distinct from v_plate or v_old.owner_user_id is distinct from v_user or spot_id is distinct from p_spot)) then
  raise exception 'Check this vehicle out before changing its plate, linked account or parking spot.';
 end if;
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and spot_id=p_spot and exit_at is null and plate<>v_plate) then raise exception 'Another vehicle is parked in this spot. Check it out before assigning the spot.'; end if;
 if p_vehicle is null then
  insert into public.parking_vehicles(lot_id,plate,owner_name,permit_expires,active,owner_user_id,assigned_spot_id)
  values(p_lot,v_plate,trim(p_owner),p_expires,p_active,v_user,p_spot) returning id into v_id;
 else
  update public.parking_vehicles set plate=v_plate,owner_name=trim(p_owner),permit_expires=p_expires,active=p_active,owner_user_id=v_user,assigned_spot_id=p_spot
  where lot_id=p_lot and id=p_vehicle returning id into v_id;
 end if;
 if v_user is not null then insert into public.parking_members values(p_lot,v_user,'driver') on conflict do nothing; end if;
 return v_id;
end; $$;
revoke all on function public.parking_save_permit_assigned(uuid,uuid,text,text,date,boolean,text,uuid) from public,anon;
grant execute on function public.parking_save_permit_assigned(uuid,uuid,text,text,date,boolean,text,uuid) to authenticated;
-- Old editors cannot create or update permits without assigning a spot.
revoke all on function public.parking_save_permit(uuid,uuid,text,text,date,boolean,text),public.parking_save_vehicle(uuid,text,text,date,boolean),public.parking_save_vehicle_account(uuid,text,text,date,boolean,text) from public,anon,authenticated;

create or replace function public.parking_admit_vehicle(p_lot uuid,p_plate text,p_spot uuid,p_visitor_reason text,p_until timestamptz,p_reservation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_vehicle public.parking_vehicles%rowtype; v_spot public.parking_spots%rowtype; v_capacity integer; v_id uuid;
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 if p_reservation is not null then raise exception 'Reservations are no longer available. Use your assigned spot.'; end if;
 if v_plate is null or v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$' then raise exception 'Enter a valid plate (2–15 characters).'; end if;
 select capacity into v_capacity from public.parking_lots where id=p_lot for update;
 select * into v_vehicle from public.parking_vehicles where lot_id=p_lot and plate=v_plate;
 if v_vehicle.id is null or (not public.parking_is_member(p_lot) and v_vehicle.owner_user_id is distinct from auth.uid()) then raise exception 'This plate is not linked to your account or has no registered permit.'; end if;
 if not v_vehicle.active or v_vehicle.permit_expires<(now() at time zone 'UTC')::date then raise exception 'A valid active permit is required. Contact the parking administrator.'; end if;
 select * into v_spot from public.parking_spots where id=v_vehicle.assigned_spot_id and lot_id=p_lot and active;
 if v_spot.id is null then raise exception 'No parking spot is assigned to this permit. Contact the parking administrator.'; end if;
 if p_spot is not null and p_spot is distinct from v_spot.id then raise exception 'You may only check in to the spot assigned to your permit.'; end if;
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_plate and exit_at is null) then raise exception 'This vehicle is already checked in.'; end if;
 if exists(select 1 from public.parking_sessions where spot_id=v_spot.id and exit_at is null) then raise exception 'Your assigned spot is occupied. Contact staff before checking in.'; end if;
 if (select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null)>=v_capacity then raise exception 'The parking lot is full.'; end if;
 insert into public.parking_sessions(lot_id,plate,admission,entered_by,driver_user_id,spot_id,spot_label)
 values(p_lot,v_plate,'permit',auth.uid(),v_vehicle.owner_user_id,v_spot.id,v_spot.label) returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.parking_admit_vehicle(uuid,text,uuid,text,timestamptz,uuid) from public,anon,authenticated;
create or replace function public.parking_check_in_assigned(p_lot uuid,p_plate text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin return public.parking_admit_vehicle(p_lot,p_plate,null,null,null,null); end; $$;
revoke all on function public.parking_check_in_assigned(uuid,text) from public,anon;
grant execute on function public.parking_check_in_assigned(uuid,text) to authenticated;
-- Legacy entry RPCs still delegate to parking_admit_vehicle, so they cannot bypass assignments.

create or replace function public.parking_reserve(p_lot uuid,p_plate text,p_spot uuid,p_start timestamptz,p_end timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
begin raise exception 'Reservations are no longer available. Use your assigned spot.'; end; $$;
create or replace function public.parking_reservation_spots(p_lot uuid,p_start timestamptz,p_end timestamptz)
returns table(id uuid,number integer,label text) language plpgsql stable security definer set search_path = '' as $$
begin raise exception 'Reservations are no longer available. Use your assigned spot.'; end; $$;
create or replace function public.parking_cancel_reservation(p_reservation uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin raise exception 'Reservations are no longer available. Existing bookings have been cancelled.'; end; $$;
revoke all on public.parking_reservations from anon,authenticated;

-- Drivers can read only their assigned spots and any legacy spot they are still parked in.
drop policy if exists parking_spots_read on public.parking_spots;
create policy parking_spots_read on public.parking_spots for select to authenticated using(public.parking_is_member(lot_id) or (
 public.parking_has_access(lot_id) and (
 exists(select 1 from public.parking_vehicles v where v.assigned_spot_id=parking_spots.id and v.owner_user_id=auth.uid())
 or exists(select 1 from public.parking_sessions s where s.spot_id=parking_spots.id and s.driver_user_id=auth.uid() and s.exit_at is null))));
create or replace function public.parking_spot_overview(p_lot uuid)
returns table(id uuid,number integer,label text,active boolean,occupied boolean,assigned_vehicle_id uuid,assigned_plate text)
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 return query select p.id,p.number,p.label,p.active,exists(select 1 from public.parking_sessions s where s.spot_id=p.id and s.exit_at is null),
 case when public.parking_is_member(p_lot) or v.owner_user_id=auth.uid() then v.id end,
 case when public.parking_is_member(p_lot) or v.owner_user_id=auth.uid() then v.plate end
 from public.parking_spots p left join public.parking_vehicles v on v.assigned_spot_id=p.id
 where p.lot_id=p_lot and (public.parking_is_member(p_lot) or v.owner_user_id=auth.uid()
 or exists(select 1 from public.parking_sessions s where s.spot_id=p.id and s.driver_user_id=auth.uid() and s.exit_at is null)) order by p.number;
end; $$;
revoke all on function public.parking_spot_overview(uuid) from public,anon;
grant execute on function public.parking_spot_overview(uuid) to authenticated;
create or replace function public.parking_list_spots(p_lot uuid)
returns table(id uuid,number integer,label text,active boolean,occupied boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
 return query select p.id,p.number,p.label,p.active,p.occupied from public.parking_spot_overview(p_lot) p;
end; $$;

create or replace function public.parking_check_permit(p_lot uuid,p_plate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_vehicle public.parking_vehicles%rowtype; v_spot public.parking_spots%rowtype;
begin
 if not public.parking_is_member(p_lot) then raise exception 'Staff access required to check permits.'; end if;
 if v_plate is null or v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$' then raise exception 'Enter a valid plate (2–15 characters).'; end if;
 select * into v_vehicle from public.parking_vehicles where lot_id=p_lot and plate=v_plate;
 select * into v_spot from public.parking_spots where id=v_vehicle.assigned_spot_id and lot_id=p_lot and active;
 return jsonb_build_object('plate',v_plate,'status',case when v_vehicle.id is null then 'not_found' when not v_vehicle.active then 'inactive'
  when v_vehicle.permit_expires<(now() at time zone 'UTC')::date then 'expired' when v_spot.id is null then 'unassigned' else 'valid' end,
  'owner_name',v_vehicle.owner_name,'permit_expires',v_vehicle.permit_expires,'assigned_spot_label',v_spot.label,'checked_at',now());
end; $$;

create or replace function public.parking_update_lot(p_lot uuid,p_name text,p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 if p_capacity<(select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null) then raise exception 'Capacity cannot be lower than current occupancy.'; end if;
 if exists(select 1 from public.parking_sessions s join public.parking_spots p on p.id=s.spot_id where s.lot_id=p_lot and s.exit_at is null and p.number>p_capacity) then raise exception 'An occupied spot would be removed. Check those vehicles out first.'; end if;
 if exists(select 1 from public.parking_vehicles v join public.parking_spots p on p.id=v.assigned_spot_id where v.lot_id=p_lot and p.number>p_capacity) then raise exception 'A spot is assigned to a permit. Reassign or delete that permit before reducing capacity.'; end if;
 update public.parking_lots set name=trim(p_name),capacity=p_capacity where id=p_lot;
 insert into public.parking_spots(lot_id,number,label) select p_lot,n,'P-'||case when n<1000 then lpad(n::text,3,'0') else n::text end from generate_series(1,p_capacity) n
 on conflict(lot_id,number) do update set active=true;
 update public.parking_spots set active=false where lot_id=p_lot and number>p_capacity;
end; $$;
commit;
