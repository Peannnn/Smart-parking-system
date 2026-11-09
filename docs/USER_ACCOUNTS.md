> **Current workflow:** Apply migration 005 after the earlier migrations. Drivers now have only Check in / out and History, with a spot assigned by the administrator on their permit. Reservation and driver spot-selection instructions below describe the earlier versions. See [Assigned parking](ASSIGNED_PARKING.md) for the current workflow.

> **Administrator update:** Admin accounts use **Check permit** instead of Park now. Run migration 004 after the migrations below. See [Permit management](PERMIT_MANAGEMENT.md) for current checker and edit behavior. Normal-user navigation is unchanged.

# Normal-user home, administrator access and reservations

## Apply this update

For an existing installation with the self-service update already applied, run **only** `supabase/003_user_home_reservations.sql` in your Supabase SQL Editor, then restart/refresh the app.

For a fresh database, run the scripts in order:

1. `supabase/parking.sql`
2. `supabase/002_self_service_spots.sql`
3. `supabase/003_user_home_reservations.sql`

The scripts preserve existing records. Later migrations replace earlier rules, so do not rerun an older script by itself after installing the newer ones. Each latest upgrade can safely be rerun.

## What new users see

Every newly signed-up account opens **Park now**, with exactly three navigation items:

- **Park now** — review their linked plate, choose a spot, enter expected departure, and confirm entry/exit. Spot availability is included here.
- **Reservations** — choose their vehicle, arrival and departure, find an available spot, confirm or cancel a booking, and check in during its time window.
- **History** — their own recorded entries, exits, durations and spot IDs.

An account without an assigned lot sees the same three tabs and an explanation of how to connect its vehicle. It never sees the create-lot form. An administrator links the confirmed account email to a vehicle permit; the user then chooses Refresh. Users cannot discover or join arbitrary private lots.

## How administrator access works

Roles come from database-controlled `parking_members` records. Signup does not offer a role choice and user-editable metadata is not used to grant privileges.

Existing administrators and staff retain their roles and management navigation. Administrators can create additional lots under Settings. The database also rejects `parking_create_lot` calls from accounts that do not already administer a lot, so hiding the form is not the only restriction.

If an account previously created a lot, it is already an administrator for that lot and keeps its access. To test a normal user, use a new account or a driver account. Do not automatically demote existing administrators, because they may be the only people managing the lot.

### First administrator for a fresh database

This is a trusted setup action in the Supabase SQL Editor, not part of normal signup. If you already have an administrator, skip it.

1. Create and confirm the intended administrator's account through the app.
2. Run the SQL below in Supabase, replacing the example email and lot details. The email must belong to that confirmed account.

```sql
do $$
declare
  account_id uuid;
  lot_id uuid;
  lot_capacity integer := 50;
begin
  select id into account_id from auth.users
  where lower(email) = lower('replace-with-your-admin-email@example.com')
    and email_confirmed_at is not null;
  if account_id is null then
    raise exception 'Create and confirm the administrator account first.';
  end if;
  insert into public.parking_lots(name, capacity)
  values ('Your parking lot', lot_capacity) returning id into lot_id;
  insert into public.parking_members(lot_id, user_id, role)
  values (lot_id, account_id, 'admin');
  insert into public.parking_spots(lot_id, number, label)
  select lot_id, n, 'P-' || lpad(n::text, 3, '0')
  from generate_series(1, lot_capacity) n;
end $$;
```

Run this once, then refresh the administrator's app. It creates the first lot; it is not a migration to rerun. For an existing lot, a trusted project owner can instead assign an account to that lot in `parking_members` through the Supabase dashboard. Do not expose database-owner credentials to the frontend.

## Reservation behavior

Reservations require a vehicle linked to the signed-in user, with an active permit covering the whole booking. Times are entered and displayed in the device's local time zone and stored as absolute timestamps in Supabase.

Conflicting bookings for the same spot or the same vehicle are rejected. One reservation can end exactly when another starts. Reservation creation, cancellation and entry all lock the lot row, preventing two simultaneous operations from allocating conflicting visits. Drivers can read/cancel only their own bookings; staff can view/cancel bookings for their lot.

During the booking window, choose **Check in reservation**. Review the plate, reserved spot and departure before confirming entry. A booking can be used only once. Reserving a spot does not itself record a vehicle entry, and an expired booking does not create a visit.

Walk-in entries now ask for an expected departure. The database checks that their stay does not overlap a booked time. Older entry endpoints remain checked; without a departure time, they conservatively reject spots or vehicles with future bookings rather than assuming when the visit ends.

Expected departures do **not** check vehicles out automatically. A person who overstays continues occupying the spot in the system, and a reserved arrival cannot displace that open session. Staff must resolve overstays. Booking a future time after an existing driver's planned departure is allowed, subject to the driver actually checking out.

You cannot reduce capacity if it would retire a spot with an open session or an upcoming reservation. Cancel/reassign the booking or close the visit first.

## Verification

`npm test` covers default-user navigation, administrator restrictions, booking conflicts, adjacent time windows, private reservation visibility, cancellation, reserved check-in, old-endpoint protections, and existing parking functionality. Tests run in local PostgreSQL through the project's development-only PGlite runtime. Browser checks use synthetic accounts and data. Run the migration and test your own Supabase accounts before operational use.
