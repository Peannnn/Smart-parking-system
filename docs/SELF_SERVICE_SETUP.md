> **Current account flow:** Normal users see **Park now**, **Reservations**, and **History**, including before a lot is assigned. Complete `003_user_home_reservations.sql` after the earlier migrations. Lot creation is restricted to existing administrators. See [User accounts and reservations](USER_ACCOUNTS.md) for current setup and first-administrator instructions.

# Self-service parking and spot IDs

## Upgrade your Supabase project

1. If the original parking system has not been installed, run `supabase/parking.sql` first.
2. In **Supabase → SQL Editor → New query**, run the complete contents of `supabase/002_self_service_spots.sql`.
3. Refresh the app. You do not need new environment variables or credentials.

The upgrade adds driver accounts and parking spots without deleting existing permits or sessions. It is transactional and safe to rerun. For an existing system, run only the new upgrade; do not rerun the original script by itself afterwards, because the original functions/policies describe the older staff-only workflow. For a fresh installation run both scripts in order.

**Existing open sessions:** the upgrade gives each one a free numbered spot in entry order. These are initial software assignments, not observations of the physical lot. Staff must verify the actual locations before relying on the map. Previously closed sessions keep their history and show “Legacy / unassigned” for their spot; locations are not invented retroactively.

## Give a driver access

1. The driver creates an account and confirms their email.
2. As administrator, open **Vehicles & permits**, then create or edit their vehicle.
3. Fill in **Driver account email** with the exact confirmed account email. Set a valid permit expiry and save.
4. Ask the driver to log in or refresh. They will land on **Park now**.

Drivers cannot claim arbitrary plates by scanning them. An administrator links the plate to an account. Each vehicle has one linked account; an account can have multiple vehicles. An administrator can clear the email to unlink it or change it to transfer the vehicle after checkout. Driver account linking and permit changes save together in one database transaction. Changing account ownership while a vehicle is parked is blocked.

Staff accounts can also have linked vehicles and use My parking. Removing staff powers preserves personal driver access when that account has linked vehicles or historical parking sessions. Unlinking a vehicle preserves its previous driver's own historical sessions; it does not expose those visits to the new owner.

## Driver arrival

1. Open **Park now → My arrival**.
2. Upload a vehicle photo, use the camera, or enter the plate manually.
3. Review the recognized plate and choose **Review parking action**.
4. Select an available spot by its displayed ID, such as **P-002**.
5. Choose **Confirm my entry**. The entry time, plate, driver account and spot ID are saved together.

Drivers need an active, unexpired permit. They cannot approve their own visitor entry. For an expired or missing permit, staff must renew it or record an approved visitor entry. When staff records entry for a linked vehicle, its driver can still see and close that session.

## Driver departure

Open **Park now → My departure**, scan/review the plate, and select **Confirm my exit**. Alternatively choose **Review checkout** on the current session card, then confirm. The app records the exit time and releases that spot. Permit expiry does not prevent a driver from closing their own existing session.

## Spot IDs

- Spaces are generated from lot capacity: **P-001**, **P-002**, and so on. Each has a permanent database UUID as well as a label unique within its lot.
- **Parking spots** shows occupied and available spaces. Drivers see availability without other drivers' plates or identities; staff can see the parked plates.
- Every new staff or driver entry receives a spot. An occupied spot cannot be claimed by another session; database transactions serialize admission, and a unique index enforces one open session per spot.
- Increasing capacity creates additional spaces. Reducing it retires the highest numbered spaces, preserving their IDs and history; it is blocked if any retiring space is occupied. Increasing capacity again restores the same spaces and IDs.
- Label physical spaces to match the IDs shown in the app. Selecting a spot records the user's declaration, not a sensor-confirmed location. Photos identify plates, not physical parking spaces.
- Spot status refreshes every 15 seconds. If another driver takes a space while you are choosing it, confirmation fails and asks you to refresh and choose another.

## Privacy and history

Drivers see only their linked vehicle permits and their own sessions. They cannot read the lot roster, other residents' permits or another driver's parking history. They can see general spot availability. Administrator and staff permissions retain operational access to their own lot.

History and its CSV export now include the recorded spot label. Original records without a spot are explicitly shown as legacy/unassigned. Entry/exit timestamps come from the database; they are not editable by drivers. Recognition photographs remain local and are not saved to Supabase.

## Running on a phone

The existing Python recognition engine still runs on your computer. The default development server is local to that computer. This change adds self-service accounts and database rules, but does not publish the app or expose the recognition engine to phones. Phone camera use requires an HTTPS deployment and a reachable, authenticated recognition service (or on-device recognition). Manual entry works without the local engine wherever the frontend is served and can reach Supabase.

For local testing use `npm run dev` with the configured engine, or `npm run dev:web` for manual plate entry. Deployment for personal phones is a separate step.
