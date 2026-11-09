> **Current workflow:** Apply migration 005 after the earlier migrations. Drivers now have only Check in / out and History, with a spot assigned by the administrator on their permit. Reservation and driver spot-selection instructions below describe the earlier versions. See [Assigned parking](ASSIGNED_PARKING.md) for the current workflow.

> **Current account flow:** Normal users see **Park now**, **Reservations**, and **History**, including before a lot is assigned. Complete `003_user_home_reservations.sql` after the earlier migrations. Lot creation is restricted to existing administrators. See [User accounts and reservations](USER_ACCOUNTS.md) for current setup and first-administrator instructions.

> **Current version:** also run `supabase/002_self_service_spots.sql` after the original setup. See [Self-service setup](SELF_SERVICE_SETUP.md) for driver account linking, private histories and numbered parking spaces. Drivers now have their own My parking screen; operators retain the tools below.

# Connect the parking system to Supabase

Your existing login, `.env.local`, Python environment and local plate-recognition engine remain in place. The new dashboard shares parking records through your existing Supabase project.

## 1. Create the parking tables and access rules

1. Open your project in the Supabase dashboard.
2. Open **SQL Editor → New query**.
3. Open `supabase/parking.sql` in your editor, select all, and copy its contents.
4. Paste into the Supabase SQL Editor and choose **Run**. Then run the complete `supabase/002_self_service_spots.sql` upgrade.
5. Wait for success. These scripts are transactional and can be rerun in order. It creates only the new parking tables, functions, indexes and policies; it does not modify your existing auth users or todos.

Run the complete script, including the grants and policies. Use the project's SQL Editor, not a browser publishable key, to perform this administrator setup. No secret/service-role key belongs in the app.

## 2. Start the app

If dependencies have changed, run `npm install` first.

For login, the dashboard, permits, manual entry/exit and history:

```bash
npm run dev:web
```

For photo/camera recognition as well, after your Python environment and models are ready:

```bash
npm run dev
```

Open the local address shown in the terminal. Your existing `.env.local` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Restart Vite after changing those values.

## 3. Create your lot

An existing administrator can create an additional lot from Settings. For a fresh database, the project owner sets up the first lot and administrator in the SQL Editor as described in USER_ACCOUNTS.md. New accounts cannot see another person's lot unless an administrator grants them access.

The lot selector supports accounts that belong to more than one lot. There is no public list of lots and no self-service joining by lot ID.

## 4. Register a vehicle

Open **Vehicles & permits**. Enter a plate, resident/owner name, permit expiry and status. Save it. Use **Edit permit** to renew or deactivate it. Saving an existing plate updates its permit instead of adding another vehicle. Expiration includes the full expiry date in UTC.

Only administrators can edit permits, lot settings or staff access. Staff can view permits, approve visitors, operate entry and exit, and view/export history.

## 5. Record entries and exits

1. Open **Entry / Exit** and choose the direction.
2. Upload/capture a photo or type the plate manually.
3. Review the characters, then choose **Review parking action**.
4. Check the permit, select an available numbered spot for entry, and confirm check-in or check-out in the confirmation card above the scanner.
5. Without a valid permit, explicitly approve the visitor and enter a reason (3–200 characters), or deny entry.

Reading/reviewing a plate does not create a parking record. Denying entry creates no parking session. Duplicate check-ins and entries at capacity are rejected in the database, including when two staff members act at the same time. A lot row lock serializes the capacity check and insertion. Check-out closes an open session and releases capacity. An unmatched or repeated check-out produces an error.

## 6. Add staff

Ask each staff member to create and confirm an account in the app. In **Settings**, add their account email. Ask them to refresh their dashboard. You can remove staff access in Settings; historical sessions are preserved. Staff email addresses are listed only to administrators.

## 7. View records

The dashboard displays current occupancy, available spaces, visitors currently parked, and expired/inactive registered permits. It refreshes every 15 seconds, and after each recorded action. Use Refresh for an immediate update.

**History** shows 50 sessions per page, ordered by entry time. Use Previous/Next to read older records; **Export this page as CSV** exports the displayed page only. Entries include the admission type, approval reason for visitors, and entry/exit timestamps. The database also records the staff account responsible for each action.

## Data and operating limits

- Plates, owner names, permits, visitor reasons and parking sessions are stored in Supabase with membership-based read policies. Checked functions enforce all writes. Photos are not uploaded to Supabase.
- Old browser scan logs remain untouched in local storage. They are not imported as parking sessions because they do not establish entry or exit events.
- Parking availability assumes every entry and exit is recorded. It is not a count from physical space sensors and now identifies individual available spots from recorded sessions (not sensors).
- Staff must verify recognition before confirming. Plate recognition can be wrong. This version has no gate control, payments, reservations, public deployment for driver phones, or automatic continuous camera tracking.
- The Python service remains loopback-only and does not verify Supabase tokens. Keep it on the local computer; this is not a public recognition API deployment.
- Do not type sensitive personal information into visitor reasons. All staff assigned to a lot can read its operational history.
- Internet access to Supabase is needed to read or record parking operations. Errors do not silently fall back to device-only records.

## Troubleshooting

**Database setup required / table or function missing:** Run all of `supabase/parking.sql` in the same Supabase project used by `.env.local`, then Refresh.

**Empty lot selector:** Create a lot, or have its administrator add your confirmed account email and Refresh.

**Staff email not found:** Confirm the staff account's email first and check that both people are using the same Supabase project.

**Python certificate error on macOS:** For a python.org Python 3.14 installation, run `open "/Applications/Python 3.14/Install Certificates.command"`, wait for success, then retry `npm run setup:models`.

**Recognition engine not ready:** Manual entry still works. Complete the Python/model setup before scanning photos.

## Validation

`npm test` runs the existing scanner tests plus parking helper and PostgreSQL integration tests using PGlite (a development-only dependency). These verify SQL reruns, permit expiry, visitor approval, duplicate entries, full capacity, role checks, cross-account isolation, direct-write restrictions, checkout and staff removal. The integration tests emulate Supabase's auth roles locally; run the SQL and test your own authenticated accounts before using the system operationally.
