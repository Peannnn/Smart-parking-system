-- Run once in the Supabase SQL Editor. Safe to rerun.
begin;
create table if not exists public.parking_lots (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 capacity integer not null check(capacity between 1 and 100000), created_at timestamptz not null default now()
);
create table if not exists public.parking_members (
 lot_id uuid not null references public.parking_lots on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 role text not null check(role in ('admin','staff')), primary key(lot_id,user_id)
);
create table if not exists public.parking_vehicles (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null references public.parking_lots on delete cascade,
 plate text not null check(plate ~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$'),
 owner_name text not null check(length(trim(owner_name)) between 1 and 100),
 permit_expires date not null, active boolean not null default true,
 unique(lot_id,plate)
);
create table if not exists public.parking_sessions (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null references public.parking_lots on delete cascade,
 plate text not null, entry_at timestamptz not null default now(), exit_at timestamptz,
 admission text not null check(admission in ('permit','visitor')),
 visitor_reason text, entered_by uuid references auth.users, exited_by uuid references auth.users,
 check(exit_at is null or exit_at >= entry_at)
);
create unique index if not exists parking_one_open_session on public.parking_sessions(lot_id,plate) where exit_at is null;
create index if not exists parking_session_history on public.parking_sessions(lot_id,entry_at desc);

create or replace function public.parking_is_member(p_lot uuid, p_admin boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.parking_members where lot_id=p_lot and user_id=auth.uid() and (not p_admin or role='admin'));
$$;
revoke all on function public.parking_is_member(uuid,boolean) from public, anon;
grant execute on function public.parking_is_member(uuid,boolean) to authenticated;

alter table public.parking_lots enable row level security;
alter table public.parking_members enable row level security;
alter table public.parking_vehicles enable row level security;
alter table public.parking_sessions enable row level security;
drop policy if exists parking_lots_read on public.parking_lots;
create policy parking_lots_read on public.parking_lots for select to authenticated using (public.parking_is_member(id));
drop policy if exists parking_members_read on public.parking_members;
create policy parking_members_read on public.parking_members for select to authenticated using (public.parking_is_member(lot_id));
drop policy if exists parking_vehicles_read on public.parking_vehicles;
create policy parking_vehicles_read on public.parking_vehicles for select to authenticated using (public.parking_is_member(lot_id));
drop policy if exists parking_sessions_read on public.parking_sessions;
create policy parking_sessions_read on public.parking_sessions for select to authenticated using (public.parking_is_member(lot_id));
-- All writes go through checked functions; clients cannot bypass capacity/role checks.
revoke all on public.parking_lots, public.parking_members, public.parking_vehicles, public.parking_sessions from anon, authenticated;
grant select on public.parking_lots, public.parking_members, public.parking_vehicles, public.parking_sessions to authenticated;

create or replace function public.parking_create_lot(p_name text, p_capacity integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'Log in first.'; end if;
 insert into public.parking_lots(name,capacity) values(trim(p_name),p_capacity) returning id into v_id;
 insert into public.parking_members values(v_id,auth.uid(),'admin');
 return v_id;
end; $$;

create or replace function public.parking_update_lot(p_lot uuid,p_name text,p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 if p_capacity < (select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null) then raise exception 'Capacity cannot be lower than current occupancy.'; end if;
 update public.parking_lots set name=trim(p_name),capacity=p_capacity where id=p_lot;
end; $$;

create or replace function public.parking_save_vehicle(p_lot uuid,p_plate text,p_owner text,p_expires date,p_active boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 insert into public.parking_vehicles(lot_id,plate,owner_name,permit_expires,active)
 values(p_lot,upper(regexp_replace(trim(p_plate),'\s+',' ','g')),trim(p_owner),p_expires,p_active)
 on conflict(lot_id,plate) do update set owner_name=excluded.owner_name,permit_expires=excluded.permit_expires,active=excluded.active;
end; $$;

create or replace function public.parking_check_in(p_lot uuid,p_plate text,p_visitor_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_capacity integer; v_permit boolean; v_id uuid;
begin
 if not public.parking_is_member(p_lot) then raise exception 'Staff access required.'; end if;
 if v_plate is null or v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$' then raise exception 'Enter a valid plate (2–15 characters).'; end if;
 select capacity into v_capacity from public.parking_lots where id=p_lot for update;
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_plate and exit_at is null) then raise exception 'This vehicle is already checked in.'; end if;
 if (select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null)>=v_capacity then raise exception 'The parking lot is full.'; end if;
 select exists(select 1 from public.parking_vehicles where lot_id=p_lot and plate=v_plate and active and permit_expires >= (now() at time zone 'UTC')::date) into v_permit;
 if not v_permit and (p_visitor_reason is null or length(trim(p_visitor_reason)) not between 3 and 200) then raise exception 'No valid permit. Approve a visitor and enter a reason, or deny entry.'; end if;
 insert into public.parking_sessions(lot_id,plate,admission,visitor_reason,entered_by)
 values(p_lot,v_plate,case when v_permit then 'permit' else 'visitor' end,case when not v_permit then trim(p_visitor_reason) end,auth.uid()) returning id into v_id;
 return v_id;
end; $$;

create or replace function public.parking_check_out(p_lot uuid,p_plate text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if not public.parking_is_member(p_lot) then raise exception 'Staff access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 update public.parking_sessions set exit_at=now(),exited_by=auth.uid()
 where lot_id=p_lot and plate=upper(regexp_replace(trim(p_plate),'\s+',' ','g')) and exit_at is null returning id into v_id;
 if v_id is null then raise exception 'No open parking session found for this plate.'; end if;
 return v_id;
end; $$;

create or replace function public.parking_add_staff(p_lot uuid,p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 select id into v_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if v_user is null then raise exception 'Ask this person to create and confirm an account first.'; end if;
 insert into public.parking_members values(p_lot,v_user,'staff') on conflict do nothing;
end; $$;

create or replace function public.parking_remove_staff(p_lot uuid,p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 delete from public.parking_members where lot_id=p_lot and user_id=p_user and role='staff';
end; $$;

create or replace function public.parking_list_members(p_lot uuid)
returns table(user_id uuid, role text, email text) language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot) then raise exception 'Staff access required.'; end if;
 return query select m.user_id, m.role, case when public.parking_is_member(p_lot,true) then u.email::text else null::text end
 from public.parking_members m join auth.users u on u.id=m.user_id where m.lot_id=p_lot;
end; $$;
revoke all on function public.parking_list_members(uuid) from public, anon;
grant execute on function public.parking_list_members(uuid) to authenticated;

revoke all on function public.parking_create_lot(text,integer), public.parking_update_lot(uuid,text,integer), public.parking_save_vehicle(uuid,text,text,date,boolean), public.parking_check_in(uuid,text,text), public.parking_check_out(uuid,text), public.parking_add_staff(uuid,text), public.parking_remove_staff(uuid,uuid) from public, anon;
grant execute on function public.parking_create_lot(text,integer), public.parking_update_lot(uuid,text,integer), public.parking_save_vehicle(uuid,text,text,date,boolean), public.parking_check_in(uuid,text,text), public.parking_check_out(uuid,text), public.parking_add_staff(uuid,text), public.parking_remove_staff(uuid,uuid) to authenticated;
commit;
