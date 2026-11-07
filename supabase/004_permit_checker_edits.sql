-- Run after 003_user_home_reservations.sql. No existing records are deleted by this migration.
begin;
create or replace function public.parking_check_permit(p_lot uuid,p_plate text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_plate text := upper(regexp_replace(trim(p_plate),'\s+',' ','g')); v_vehicle public.parking_vehicles%rowtype;
begin
 if not public.parking_is_member(p_lot) then raise exception 'Staff access required to check permits.'; end if;
 if v_plate is null or v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$' then raise exception 'Enter a valid plate (2–15 characters).'; end if;
 select * into v_vehicle from public.parking_vehicles where lot_id=p_lot and plate=v_plate;
 return jsonb_build_object('plate',v_plate,'status',case
  when v_vehicle.id is null then 'not_found'
  when not v_vehicle.active then 'inactive'
  when v_vehicle.permit_expires < (now() at time zone 'UTC')::date then 'expired'
  else 'valid' end,
  'owner_name',v_vehicle.owner_name,'permit_expires',v_vehicle.permit_expires,'checked_at',now());
end; $$;

-- Null vehicle ID registers a new permit. An edit must target the original ID.
create or replace function public.parking_save_permit(p_lot uuid,p_vehicle uuid,p_plate text,p_owner text,p_expires date,p_active boolean,p_email text default '')
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
 if nullif(trim(p_email),'') is not null then
  select id into v_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if v_user is null then raise exception 'Ask the driver to create and confirm an account first.'; end if;
 end if;
 if exists(select 1 from public.parking_vehicles where lot_id=p_lot and plate=v_plate and id is distinct from p_vehicle) then raise exception 'A permit for this plate already exists. Edit that permit instead.'; end if;
 if p_vehicle is not null and (v_old.plate is distinct from v_plate or v_old.owner_user_id is distinct from v_user)
   and exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_old.plate and exit_at is null) then
  raise exception 'Check this vehicle out before changing its plate or linked account.';
 end if;
 if p_vehicle is null then
  insert into public.parking_vehicles(lot_id,plate,owner_name,permit_expires,active,owner_user_id)
  values(p_lot,v_plate,trim(p_owner),p_expires,p_active,v_user) returning id into v_id;
 else
  update public.parking_vehicles set plate=v_plate,owner_name=trim(p_owner),permit_expires=p_expires,active=p_active,owner_user_id=v_user
  where lot_id=p_lot and id=p_vehicle returning id into v_id;
  -- Bookings must not continue to authorize an old plate/account or an invalidated permit.
  update public.parking_reservations set status='cancelled'
  where lot_id=p_lot and plate=v_old.plate and status='booked' and ends_at>now()
  and (v_old.plate is distinct from v_plate or v_old.owner_user_id is distinct from v_user
       or not p_active or ends_at>((p_expires+1)::timestamp at time zone 'UTC'));
 end if;
 if v_user is not null then insert into public.parking_members values(p_lot,v_user,'driver') on conflict do nothing; end if;
 return v_id;
end; $$;

create or replace function public.parking_delete_permit(p_lot uuid,p_vehicle uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_plate text;
begin
 if not public.parking_is_member(p_lot,true) then raise exception 'Administrator access required.'; end if;
 perform 1 from public.parking_lots where id=p_lot for update;
 select plate into v_plate from public.parking_vehicles where lot_id=p_lot and id=p_vehicle;
 if v_plate is null then raise exception 'This permit no longer exists in this lot. Refresh to update the list.'; end if;
 if exists(select 1 from public.parking_sessions where lot_id=p_lot and plate=v_plate and exit_at is null) then raise exception 'Check this vehicle out before deleting its permit.'; end if;
 update public.parking_reservations set status='cancelled' where lot_id=p_lot and plate=v_plate and status='booked' and ends_at>now();
 delete from public.parking_vehicles where lot_id=p_lot and id=p_vehicle;
end; $$;
revoke all on function public.parking_check_permit(uuid,text),public.parking_save_permit(uuid,uuid,text,text,date,boolean,text),public.parking_delete_permit(uuid,uuid) from public,anon;
grant execute on function public.parking_check_permit(uuid,text),public.parking_save_permit(uuid,uuid,text,text,date,boolean,text),public.parking_delete_permit(uuid,uuid) to authenticated;
commit;
