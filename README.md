# SmartPark — Smart Parking Management System

SmartPark is a parking management prototype that combines license-plate recognition, vehicle permits, dedicated parking spot assignments, and occupancy tracking. Drivers can record their own arrivals and departures, while administrators manage the lot and check whether a vehicle has a valid permit.

The web app uses React and Supabase. Photo recognition runs through a Python engine on the same computer.

## Features

### Drivers

Normal accounts have two pages:

- **Check in / out:** scan and review a linked license plate, then confirm arrival or departure. The permit determines the assigned spot; drivers cannot choose another space.
- **History:** view personal parking records, including entry/exit times and spot IDs, and export a page as CSV.

### Administrators

- View occupancy, available spaces, and currently parked vehicles.
- Manage lot capacity and staff access.
- Register, edit, deactivate, or delete vehicle permits and assign each one a dedicated spot.
- Link a vehicle to a driver's confirmed account email.
- Use **Check permit** to scan or enter a plate and see whether its permit is valid, expired, inactive, or missing.
- Record entries/exits and view lot-wide parking history, assigned spaces, and occupancy.

Staff can operate entries/exits and view operational records, but cannot edit permits, change capacity, or manage account access.

Each parking space has a label such as **P-001**. The database prevents duplicate check-ins, duplicate permit assignments, and vehicles occupying spaces outside their assignments. Permit edits replace the original record, including when its plate changes; past parking history is preserved.

## Requirements

- **Node.js 22.12+ or 24+**, with npm.
- A **Supabase project** for accounts and parking data.
- **Python 3.12 recommended** for the local recognition engine.
- Internet access for package installation, initial model downloads, and Supabase access.
- A camera-enabled browser if you want to capture photos. Uploaded images and manual plate entry are also supported.

Python is optional for administrative dashboard, permit management, and manual staff operations. Driver check-in/out requires the recognition engine because the driver interface requires a scan. A GPU is not required for the included recognition engine.

## Set up on a different computer

Follow the complete [new computer setup guide](docs/setup/NEW_COMPUTER.md). It includes Windows and macOS instructions, Supabase configuration, database setup, administrator access, and model installation.

## Running the app again

After setup, open the project in VS Code and run:

```bash
npm run dev
```

This starts the React frontend and the local Python API together. Keep the terminal running while using the app. Press **Control + C** to stop it.

For the frontend with manual plate entry only, use:

```bash
npm run dev:web
```

To run the recognition API separately in another terminal:

```bash
npm run api
```

## Typical parking workflow

1. An administrator registers a vehicle, links its driver's confirmed account email, grants a valid permit, and assigns a dedicated spot such as P-001.
2. The driver opens **Check in / out**, uploads/captures a plate photo, and reviews the detected characters.
3. The driver confirms check-in. The server automatically uses the permit's assigned spot; there is no spot picker or reservation option.
4. On departure, the driver scans again and confirms checkout. The spot becomes vacant but remains assigned to that permit.
5. The administrator's dashboard shows occupied, vacant and assigned spaces based on the recorded visits.

Administrators use **Check permit** for verification without creating a parking visit. To update a permit or change its spot, choose **Edit permit → Save changes** on its row. Check the vehicle out before changing its plate, account or assignment. Use **Delete permit** for an obsolete permit; its assigned space is then released. Past visit history is preserved.

**Existing installations:** migration 005 leaves existing permits unassigned for admin review and cancels old unclaimed reservations. Before a driver's next check-in, edit their permit to assign the actual space. See [Assigned parking](docs/ASSIGNED_PARKING.md).

## How it works

| Component                | Technology / responsibility                                    |
| ------------------------ | -------------------------------------------------------------- |
| Frontend                 | React, Vite, HTML/CSS                                          |
| Accounts and storage     | Supabase Authentication and PostgreSQL                         |
| Data access              | Row-level security and checked database functions              |
| Local recognition API    | Python and FastAPI                                             |
| Plate recognition        | FastALPR, ONNX Runtime, Open Image Models, Fast Plate OCR      |
| Automated database tests | PGlite, running locally without changing your Supabase project |

Images go from the browser to the local Python service through `/api/recognize`. The browser normalizes uploads and strips image metadata before sending them. The included API binds to `127.0.0.1:8000` and processes photos in memory. Photos are not stored in Supabase.

Supported uploads are JPG, PNG, and WebP, up to **15 MB** and **24 megapixels**. When several plates are detected, the user selects and reviews one. Camera access requires localhost or HTTPS and browser permission.

Supabase stores account-linked permits with dedicated spot assignments, parking sessions, and lot memberships. Drivers can read their own records; administrators and staff have operational access to their assigned lots. Permit expiry dates use UTC, while visit times are displayed in the device's local time zone.

## Project structure

```text
src/main.jsx            Starts React
src/features/auth/      Login, signup, and account sessions
src/features/parking/   Workspace, page navigation, data loading, and parking pages
src/features/driver/    Driver check-in and checkout
src/features/permits/   Permit forms, checking, editing, and deletion
src/features/settings/ Lot capacity and staff management
src/features/scanner/  Photo upload, camera, and plate recognition
src/services/          Shared Supabase connection
src/shared/            Plate, date, and CSV formatting helpers
src/styles/            Styles grouped by feature
backend/               Local Python API, image validation, recognition, and models
supabase/              Database migrations, in installation order
scripts/               Development commands and file-size check
tests/                 Frontend helper and database regression tests
docs/                  Setup, operations, and beginner code guide
```

Start with the [beginner code guide](docs/CODE_GUIDE.md) to follow the app from login to a recorded visit. Each handwritten file is limited to 300 lines; npm's generated `package-lock.json` stays intact so installs remain reproducible.

## Checks

```bash
npm test
npm run lint
npm run check:files
npm run build
```

After installing the Python dependencies, the recognition API tests can be run with:

```bash
npm run test:api
```

The automated tests cover account isolation, roles, permits, spot assignments, entry/exit handling, disabled legacy booking endpoints, and permit replacement. Earlier migrations also have regression tests for their original behavior. They do not establish recognition accuracy for every plate style or lighting condition. Verify your own Supabase setup and actual parking workflows before operational use.

## Troubleshooting

| Problem                        | What to check                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| Python environment missing     | Create `.venv` using the commands for your operating system.                                      |
| `No module named ...`          | Install `backend/requirements.txt` using the Python executable inside `.venv`.                    |
| `python3.12` or `py` not found | Install Python or use the correct command for your installed version. `py` is a Windows launcher. |
| Local engine needs setup       | Run `npm run setup:models`, then restart the API/app. Manual entry still works.                   |
| Supabase is not configured     | Check `.env.local` names and values, then restart Vite.                                           |
| Table/function missing         | Apply the required SQL migrations to the Supabase project used by `.env.local`.                   |
| No parking lot linked          | Ask an administrator to link the confirmed account email to a vehicle permit, then Refresh.       |
| Confirmation email missing     | Check spam and your Supabase email/SMTP settings.                                                 |
| Camera unavailable             | Use localhost or HTTPS, allow browser permission, or upload a photo instead.                      |

For a certificate verification error with a python.org Python 3.14 installation on macOS, run its certificate installer, wait for success, then retry model setup:

```bash
open "/Applications/Python 3.14/Install Certificates.command"
```

For another Python version, use its matching folder in Applications.

## Current limitations

- Availability is based on recorded entries and exits, not physical occupancy sensors. Users must choose the correct spot and check out when leaving.
- Checkout must be recorded by the driver or staff. A scan does not prove that a vehicle physically occupies its assigned spot.
- Recognition can misread a plate. Always review the characters before confirming an action.
- This is a local-development prototype. Pushing to GitHub does not host the app or make the Python engine available to users' phones.
- The local recognition API has no Supabase token authentication. A public deployment needs an appropriately secured recognition service or on-device recognition; do not expose the included API directly.
- Automatic gate control, payments, and continuous camera monitoring are not included.

## Optional: configure Git commits in VS Code

You can run the app without configuring a Git author. To commit and push changes from this computer, set your name and an email associated with GitHub in the VS Code terminal:

```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

Use your GitHub no-reply email if you prefer to keep your personal email private. These values identify commit authors; you may still need to sign in to GitHub for push access.

## GitHub and local files

Commit the source code, SQL migrations, dependency files, and documentation. The included `.gitignore` excludes `.env.local`, `.venv`, `node_modules`, downloaded models, and build output. Do not commit passwords or secret/service-role keys.

A new computer needs its own environment file, dependencies, and local model setup. Using the same Supabase project keeps the existing accounts and parking data available, subject to each account's permissions.

## Detailed guides

- [Assigned parking — current setup and operations](docs/ASSIGNED_PARKING.md)
- [Earlier parking setup guide](docs/PARKING_SETUP.md)
- [Self-service parking and spot IDs](docs/SELF_SERVICE_SETUP.md)
- [User accounts, administrator setup, and reservations](docs/USER_ACCOUNTS.md)
- [Permit checking and replacement edits](docs/PERMIT_MANAGEMENT.md)
