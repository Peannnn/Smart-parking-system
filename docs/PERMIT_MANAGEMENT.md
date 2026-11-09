> **Current workflow:** Apply migration 005 after the earlier migrations. Drivers now have only Check in / out and History, with a spot assigned by the administrator on their permit. Reservation and driver spot-selection instructions below describe the earlier versions. See [Assigned parking](ASSIGNED_PARKING.md) for the current workflow.

# Administrator permit checks and replacement edits

## Apply the update

If migrations 001–003 are already installed, run **only** `supabase/004_permit_checker_edits.sql` in your Supabase SQL Editor, then refresh the app. For a new installation, run `parking.sql`, then 002, 003 and 004 in order. Do not rerun older migrations alone after a newer one.

This migration adds checked functions without deleting any existing permits, sessions or bookings. It is safe to rerun.

## Administrator: Check permit

The administrator's **Park now** tab is replaced with **Check permit**. Upload/capture a plate photo or enter the plate manually, review the characters, and choose **Check permit**.

The result is fetched from the current database state for the selected lot and shows:

- **Valid permit** — active and not expired (expiry dates include the whole date in UTC).
- **Permit expired** — the expiry date has passed.
- **Permit inactive** — the permit has been deactivated.
- **No permit found** — the plate has no registered permit in that lot.

The result includes the plate, owner, expiry when present, and the time checked. Checking does not open/close a parking session, reserve a spot, modify availability or save a photo. Staff entry/exit tools remain available separately. Drivers retain Park now, Reservations and History.

## Edit a permit without leaving the old one

1. Open **Vehicles & permits**.
2. Choose **Edit permit** on the row you want to replace.
3. Change the plate, owner, expiry, status or linked account email.
4. Choose **Save changes**.

The update targets the original permit's permanent ID. Even if the plate changes, it updates the same row rather than inserting a new one. The previous plate no longer has that permit, and the driver sees the updated vehicle after refresh. A newly registered permit for an already-registered plate is rejected; choose Edit permit instead.

An edit cannot overwrite another existing permit's plate or move a record from a different lot. If the record has already been deleted, saving fails instead of recreating it. Invalid account emails fail the entire save; no partial replacement is left behind.

Changing the plate or linked account while the vehicle is checked in is blocked: check it out first. Expiry/status can still be updated while parked, and the driver can close the original session.

Affected upcoming bookings are cancelled when a plate or linked account changes, when the permit is deactivated, or when a shorter expiry no longer covers the booking. Name-only edits and valid renewals preserve bookings. Previous visits and completed bookings keep their original recorded details; these are history, not extra current permits.

## Remove duplicates already created

For an obsolete row, choose **Delete permit**, review the plate and owner, then confirm. This removes the current permit and cancels its upcoming bookings. It keeps recorded parking history. A parked vehicle must be checked out before its permit can be deleted.

Existing rows are not automatically merged by owner email: one driver can legitimately own several vehicles. Delete only the obsolete rows you recognize. New edits no longer create the old-plate duplicate.

Only administrators can save or delete permits. The database checks the administrator's access to the selected lot. The checker allows authorized operators in that lot, and normal drivers cannot use it to inspect other people's permits.
