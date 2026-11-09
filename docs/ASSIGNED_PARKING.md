# Assigned parking: current setup and behavior

## Apply the upgrade

Run `supabase/005_assigned_parking.sql` in the Supabase SQL Editor after migrations 001–004, then refresh/restart the app. Existing installations need only migration 005 if the earlier scripts are already applied. Fresh installations must run all SQL scripts in order, starting with `parking.sql`.

The upgrade:

- Adds a permanent spot assignment to each permit.
- Keeps existing permits and all recorded entries/exits.
- Cancels all old unclaimed reservations and disables reservation functions. Used/cancelled booking records remain stored for the project owner, but reservations are no longer shown or available through the app.
- Disables older permit-writing functions that could bypass spot assignment.
- Leaves existing permits unassigned until an administrator chooses their actual spot. No location is guessed automatically.

Apply only the newest migrations not yet installed. Do not rerun an older migration alone after 005.

## Administrator: create or edit a permit

1. Open **Vehicles & permits**.
2. Enter the plate, owner, expiry, status and the driver's confirmed account email.
3. Choose **Assigned parking spot**.
4. Save the permit. When editing, choose **Edit permit → Save changes** on the original row.

Each permit has one assigned space. A driver may have multiple vehicle permits, each with its own space. Assignment labels such as P-001 are unique within a lot; the underlying spot IDs are globally unique.

A spot can be assigned to only one permit, including if that permit is inactive or expired. Assignment stays in place until the administrator reassigns or deletes the permit. This prevents another driver taking a resident's dedicated space while it is vacant.

The assignment picker excludes spaces assigned to other permits and spaces occupied by another vehicle. The database enforces these rules again when saving, including simultaneous administrator actions. New permits and edited permits must have an active assignment in the same lot.

Check the vehicle out before changing its plate, account ownership or assigned space. For a legacy open visit, the administrator may align its permit with the spot already recorded for that same vehicle, without moving the visit. Previous visits always retain the spot and plate recorded at entry.

A lot cannot be reduced in capacity if that would remove an assigned or occupied space. Reassign/delete those permits and close affected sessions first.

## Driver: scan to check in or check out

Drivers have only two pages:

- **Check in / out**
- **History**

They cannot select a spot, browse other drivers' spaces, make reservations, or manage permits.

To record a visit:

1. Choose **Check in** or **Check out**.
2. Upload/capture a vehicle photo and wait for plate detection.
3. Review the detected plate; correct recognition errors if necessary.
4. Choose **Review parking action**, then confirm the entry or exit shown above.

The scan is required in the driver interface. Manual-only typing is disabled until at least one plate is detected. Admins/staff retain manual operational entry and permit-check options.

Check-in sends only the lot and plate to the server. The database looks up the current permit and its assigned spot; the driver does not supply or choose a spot ID. It requires the driver's ownership, a valid active permit, an active assignment, and a vacant assigned spot. Duplicate check-ins are rejected.

If the assigned spot is occupied, contact staff; the app does not move the driver to another space. Checkout records the actual exit and makes the space vacant while keeping its assignment. Expiry or deactivation does not prevent closing an existing session. No expected-departure field or automatic checkout is used.

A newly created account without a linked permit still sees the two driver pages and instructions to contact the administrator. An older permit without an assignment must be updated by an administrator before its next check-in. Existing open sessions can still be checked out after the upgrade.

## Administrator occupancy

The dashboard shows:

- **Currently parked:** count of open sessions.
- **Vacant spaces:** capacity minus the current parked count.
- **Assigned spaces:** count of spaces held by permits.
- **Permits needing attention:** expired, inactive or unassigned permits.

The **Parking spots** page distinguishes Occupied, Assigned · vacant and Unassigned · vacant. Occupancy updates after operations and during the regular 15-second refresh. A vacant dedicated space is not an invitation for another driver to park there.

**Check permit** now includes the assigned spot and flags a missing assignment. Administrator entry/exit tools use the permit's assigned spot too. No temporary visitor override can occupy someone else's space; create a valid permit and assignment before admitting a vehicle.

## Data and verification limits

Spot occupancy still comes from recorded check-ins/checkouts, not physical sensors. Label the physical spaces to match the app and verify users park in their assignments. Scanning assists plate input; it does not prove the vehicle's physical location. Database rules enforce account access and assignments, independently of the browser interface.

Driver scanning still depends on the local Python recognition engine. `npm run dev:web` is useful for administrative work, but scan-based driver entry/exit requires the recognition service. A public/phone deployment needs an appropriately secured, reachable recognition service or on-device recognition.

Historical reservation tables and earlier migration tests remain in the repository so upgrades can be verified. They are not active features in the current interface. The assigned-parking integration tests apply every migration and verify that booking and free-choice endpoints can no longer bypass assignments.
