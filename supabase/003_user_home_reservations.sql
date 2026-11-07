-- Run after 002_self_service_spots.sql. Normal accounts never gain administration from signup.
begin;
create or replace function public.parking_create_lot(p_name text,p_capacity integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.parking_members where user_id=auth.uid() and role='admin') then
  raise exception 'Administrator access required to create a parking lot.';
 end if;
 insert into public.parking_lots(name,capacity) values(trim(p_name),p_capacity) returning id into v_id;
 insert into public.parking_members values(v_id,auth.uid(),'admin');
 insert into public.parking_spots(lot_id,number,label)
 select v_id,n,'P-' || case when n<1000 then lpad(n::text,3,'0') else n::text end from generate_series(1,p_capacity) n;
 return v_id;
end; $$;

create table if not exists public.parking_reservations (
 id uuid primary key default gen_random_uuid(), lot_id uuid not null references public.parking_lots on delete cascade,
 user_id uuid not null references auth.users, plate text not null,
 spot_id uuid not null, spot_label text not null,
 starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'booked' check(status in ('booked','cancelled','checked_in')),
 created_at timestamptz not null default now(), check(ends_at>starts_at),
 foreign key(lot_id,spot_id) references public.parking_spots(lot_id,id)
);
create index if not exists parking_reservations_schedule on public.parking_reservations(lot_id,spot_id,starts_at,ends_at) where status='booked';
alter table public.parking_sessions add column if not exists expected_exit_at timestamptz;
alter table public.parking_sessions add column if not exists reservation_id uuid references public.parking_reservations;
create unique index if not exists parking_reservation_one_session on public.parking_sessions(reservation_id) where reservation_id is not null;
alter table public.parking_reservations enable row level security;
drop policy if exists parking_reservations_read on public.parking_reservations;
create policy parking_reservations_read on public.parking_reservations for select to authenticated using(public.parking_is_member(lot_id) or (user_id=auth.uid() and public.parking_has_access(lot_id)));
revoke all on public.parking_reservations from anon,authenticated;
grant select on public.parking_reservations to authenticated;

-- Every reservation write and admission locks the lot row, serializing conflicts.
create or replace function public.parking_reserve(p_lot uuid,p_plate text,p_spot uuid,p_start timestamptz,p_end timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_vehicle public.parking_vehicles%rowtype; v_spot public.parking_spots%rowtype; v_id uuid;
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 if p_start is null or p_end is null or p_start<now() or p_end<=p_start then raise exception 'Choose a future arrival time and a later departure time.'; end if;
 select * into v_vehicle from public.parking_vehicles where lot_id=p_lot and plate=v_plate and owner_user_id=auth.uid();
 if v_vehicle.id is null then raise exception 'Only a vehicle linked to your account can be reserved.'; end if;
 if not v_vehicle.active or p_end>((v_vehicle.permit_expires+1)::timestamp at time zone 'UTC') then raise exception 'A valid permit covering the whole reservation is required.'; end if;
 select * into v_spot from public.parking_spots where lot_id=p_lot and id=p_spot and active;
 if v_spot.id is null then raise exception 'Choose an active spot in this lot.'; end if;
 if exists(select 1 from public.parking_reservations where lot_id=p_lot and status='booked' and starts_at<p_end and ends_at>p_start and (spot_id=p_spot or plate=v_plate)) then raise exception 'This spot or vehicle already has a reservation during that time.'; end if;
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and exit_at is null and (spot_id=p_spot or plate=v_plate) and (expected_exit_at is null or expected_exit_at>p_start)) then raise exception 'This spot or vehicle is currently parked during the requested time.'; end if;
 insert into public.parking_reservations(lot_id,user_id,plate,spot_id,spot_label,starts_at,ends_at)
 values(p_lot,auth.uid(),v_plate,p_spot,v_spot.label,p_start,p_end) returning id into v_id;
 return v_id;
end; $$;

create or replace function public.parking_cancel_reservation(p_reservation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_lot uuid;
begin
 select lot_id into v_lot from public.parking_reservations where id=p_reservation;
 if v_lot is null or not public.parking_has_access(v_lot) then raise exception 'Reservation not available.'; end if;
 perform 1 from public.parking_lots where id=v_lot for update;
 update public.parking_reservations set status='cancelled' where id=p_reservation and status='booked' and (user_id=auth.uid() or public.parking_is_member(v_lot));
 if not found then raise exception 'Only your own unclaimed reservation can be cancelled.'; end if;
end; $$;

create or replace function public.parking_reservation_spots(p_lot uuid,p_start timestamptz,p_end timestamptz)
returns table(id uuid,number integer,label text) language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 if p_start is null or p_end is null or p_start<now() or p_end<=p_start then raise exception 'Choose a future arrival time and a later departure time.'; end if;
 return query select p.id,p.number,p.label from public.parking_spots p where p.lot_id=p_lot and p.active
 and not exists(select 1 from public.parking_reservations r where r.spot_id=p.id and r.status='booked' and r.starts_at<p_end and r.ends_at>p_start)
 and not exists(select 1 from public.parking_sessions s where s.spot_id=p.id and s.exit_at is null and (s.expected_exit_at is null or s.expected_exit_at>p_start)) order by p.number;
end; $$;

-- Internal admission routine: called only by the checked public entry functions.
create or replace function public.parking_admit_vehicle(p_lot uuid,p_plate text,p_spot uuid,p_visitor_reason text,p_until timestamptz,p_reservation uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_capacity integer; v_vehicle public.parking_vehicles%rowtype;
 v_spot public.parking_spots%rowtype; v_staff boolean; v_permit boolean; v_id uuid; v_booking public.parking_reservations%rowtype;
begin
 if not public.parking_has_access(p_lot) then raise exception 'Parking access required.'; end if;
 v_staff := public.parking_is_member(p_lot);
 if v_plate is null or v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$' then raise exception 'Enter a valid plate (2–15 characters).'; end if;
 select capacity into v_capacity from public.parking_lots where id=p_lot for update;
 if p_until is not null and p_until<=now() then raise exception 'Expected departure must be in the future.'; end if;
 select * into v_vehicle from public.parking_vehicles where lot_id=p_lot and plate=v_plate;
 if not v_staff and (v_vehicle.id is null or v_vehicle.owner_user_id is distinct from auth.uid()) then raise exception 'This plate is not linked to your account. Contact the parking administrator.'; end if;
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_plate and exit_at is null) then raise exception 'This vehicle is already checked in.'; end if;
 if (select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null)>=v_capacity then raise exception 'The parking lot is full.'; end if;
 v_permit := coalesce(v_vehicle.active and v_vehicle.permit_expires >= (now() at time zone 'UTC')::date,false);
 if not v_permit then
  if not v_staff then raise exception 'A valid active permit is required. Contact staff for visitor approval.'; end if;
  if p_visitor_reason is null or length(trim(p_visitor_reason)) not between 3 and 200 then raise exception 'No valid permit. Approve a visitor and enter a reason, or deny entry.'; end if;
 end if;
 if p_reservation is not null then
  select * into v_booking from public.parking_reservations where id=p_reservation and lot_id=p_lot and status='booked';
  if v_booking.id is null or (not v_staff and v_booking.user_id is distinct from auth.uid()) or v_booking.plate<>v_plate or v_booking.spot_id is distinct from p_spot then raise exception 'This reservation does not match your account, plate and spot.'; end if;
  if v_booking.starts_at>now() or v_booking.ends_at<=now() then raise exception 'You can check in only during the reservation time.'; end if;
  if p_until is null or p_until>v_booking.ends_at then raise exception 'Departure must be within the reserved time.'; end if;
 end if;
 if p_spot is null then
  if not v_staff then raise exception 'Choose an available parking spot.'; end if;
  select p.* into v_spot from public.parking_spots p where p.lot_id=p_lot and p.active
  and not exists(select 1 from public.parking_sessions s where s.spot_id=p.id and s.exit_at is null)
  and not exists(select 1 from public.parking_reservations r where r.spot_id=p.id and r.status='booked' and r.ends_at>now() and (p_until is null or r.starts_at<p_until)) order by p.number limit 1;
 else select * into v_spot from public.parking_spots where lot_id=p_lot and id=p_spot and active;
 end if;
 if v_spot.id is null then raise exception 'Choose an available parking spot in this lot.'; end if;
 if exists(select 1 from public.parking_sessions where spot_id=v_spot.id and exit_at is null) then raise exception 'That spot was just taken. Refresh and choose another spot.'; end if;
 if exists(select 1 from public.parking_reservations where lot_id=p_lot and status='booked' and ends_at>now() and (p_until is null or starts_at<p_until) and id is distinct from p_reservation and (spot_id=v_spot.id or plate=v_plate)) then raise exception 'This spot or vehicle has a reservation during your stay. Choose another spot or departure time, or check in using your reservation.'; end if;
 insert into public.parking_sessions(lot_id,plate,admission,visitor_reason,entered_by,driver_user_id,spot_id,spot_label,expected_exit_at,reservation_id)
 values(p_lot,v_plate,case when v_permit then 'permit' else 'visitor' end,case when not v_permit then trim(p_visitor_reason) end,auth.uid(),v_vehicle.owner_user_id,v_spot.id,v_spot.label,p_until,p_reservation) returning id into v_id;
 if p_reservation is not null then update public.parking_reservations set status='checked_in' where id=p_reservation; end if;
 return v_id;
end; $$;
revoke all on function public.parking_admit_vehicle(uuid,text,uuid,text,timestamptz,uuid) from public,anon,authenticated;

create or replace function public.parking_record_entry(p_lot uuid,p_plate text,p_spot uuid,p_visitor_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin return public.parking_admit_vehicle(p_lot,p_plate,p_spot,p_visitor_reason,null,null); end; $$;

create or replace function public.parking_start_visit(p_lot uuid,p_plate text,p_spot uuid,p_until timestamptz,p_reservation uuid default null,p_visitor_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
 if p_until is null then raise exception 'Choose an expected departure time.'; end if;
 return public.parking_admit_vehicle(p_lot,p_plate,p_spot,p_visitor_reason,p_until,p_reservation);
end; $$;

-- Capacity cannot retire a space with an upcoming booking.
-- The underlying v2 capacity logic is reproduced so old endpoints remain protected.
create or replace function public.parking_update_lot(p_lot uuid,p_name text,p_capacity integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 if p_capacity < (select count(*) from public.parking_sessions where lot_id=p_lot and exit_at is null) then raise exception 'Capacity cannot be lower than current occupancy.'; end if;
 if exists(select 1 from public.parking_sessions s join public.parking_spots p on p.id=s.spot_id where s.lot_id=p_lot and s.exit_at is null and p.number>p_capacity) then raise exception 'An occupied spot would be removed. Check those vehicles out before reducing capacity.'; end if;
 if exists(select 1 from public.parking_reservations r join public.parking_spots p on p.id=r.spot_id where r.lot_id=p_lot and r.status='booked' and r.ends_at>now() and p.number>p_capacity) then raise exception 'A spot has upcoming reservations. Cancel those bookings before reducing capacity.'; end if;
 update public.parking_lots set name=trim(p_name),capacity=p_capacity where id=p_lot;
 insert into public.parking_spots(lot_id,number,label)
 select p_lot,n,'P-' || case when n<1000 then lpad(n::text,3,'0') else n::text end from generate_series(1,p_capacity) n on conflict(lot_id,number) do update set active=true;
 update public.parking_spots set active=false where lot_id=p_lot and number>p_capacity;
end; $$;
revoke all on function public.parking_reserve(uuid,text,uuid,timestamptz,timestamptz),public.parking_cancel_reservation(uuid),public.parking_reservation_spots(uuid,timestamptz,timestamptz),public.parking_start_visit(uuid,text,uuid,timestamptz,uuid,text) from public,anon;
grant execute on function public.parking_reserve(uuid,text,uuid,timestamptz,timestamptz),public.parking_cancel_reservation(uuid),public.parking_reservation_spots(uuid,timestamptz,timestamptz),public.parking_start_visit(uuid,text,uuid,timestamptz,uuid,text) to authenticated;
commit;
