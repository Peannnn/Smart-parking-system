# Set up on a different computer

Follow these steps for each new computer. GitHub contains the source code, but it does not include your local environment, installed packages, or downloaded recognition models.

### 1. Install the tools

Install:

- [Visual Studio Code](https://code.visualstudio.com/).
- [Node.js](https://nodejs.org/) with npm: use Node 22.12+ or 24+.
- [Git](https://git-scm.com/downloads) if you want to clone and push changes. Downloading the repository as a ZIP does not require Git.
- [Python](https://www.python.org/downloads/): Python 3.12 is recommended for the recognition engine. You can skip it for manual plate entry.

On Windows, enable **Add Python to PATH** if the installer offers it. Restart VS Code after installing the tools so its terminal sees them.

Check Node and npm in **Terminal → New Terminal**:

```bash
node --version
npm --version
```

If using Git, also check `git --version`.

### 2. Download the project

In VS Code, open the Command Palette (**Command + Shift + P** on Mac; **Ctrl + Shift + P** on Windows), choose **Git: Clone**, and paste:

```text
https://github.com/Peannnn/Smart-parking-system.git
```

Choose a local destination and open the cloned folder. Sign in to GitHub if the repository requires it. Alternatively, download the repository ZIP, extract it, and use **File → Open Folder**.

You can also clone from a terminal:

```bash
git clone https://github.com/Peannnn/Smart-parking-system.git
cd Smart-parking-system
```

Open the VS Code terminal inside the folder containing `package.json`, then install dependencies:

```bash
npm install
```

Do not copy `node_modules`, `.venv`, or downloaded model files from another computer. Install them on the new machine using the instructions below. Run all remaining commands from the project folder.

### 3. Choose your Supabase database

| Your situation                                 | What to do                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another computer using the same parking system | Use the existing Supabase project URL and publishable key. Existing accounts, permits, lots, assignments, and parking history remain in that database. Do not create a second database or rerun its completed migrations. |
| A separate, independent parking system         | Create a new Supabase project, run all five SQL files below, and set up its first administrator.                                                                                                                          |

Each computer needs its own `.env.local` file. This file is excluded from GitHub, so cloning the repository does not bring it with you.

### 4. Create the local Supabase configuration

Create or open a project in the [Supabase dashboard](https://supabase.com/dashboard). Copy its **Project URL** and **publishable key** from the project's connection/API settings.

Create a file named `.env.local` beside `package.json`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Replace the example values with your project's values. Do not use a secret key or `service_role` key in the frontend.

In Supabase Authentication:

1. Enable email/password sign-in and new-user signups.
2. Configure email confirmation. The driver-linking and first-administrator setup expect confirmed accounts.
3. For local development, set the **Site URL** and an allowed **Redirect URL** to `http://localhost:5173`.

If the app starts on a different port, use its actual address. Restart the app after changing `.env.local`. For production email delivery, configure an appropriate SMTP service in Supabase.

### 5. Set up or update the database

For a **new Supabase project**, open **SQL Editor → New query** and run the complete contents of these files, one at a time, in this order:

| Order | File                                                                            | Purpose                                                                                 |
| ----- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1     | [parking.sql](../../supabase/parking.sql)                                       | Lots, accounts' lot roles, permits, sessions, and access rules                          |
| 2     | [002_self_service_spots.sql](../../supabase/002_self_service_spots.sql)         | Driver access and numbered parking spaces                                               |
| 3     | [003_user_home_reservations.sql](../../supabase/003_user_home_reservations.sql) | Normal-user home, reservations, and restricted lot creation                             |
| 4     | [004_permit_checker_edits.sql](../../supabase/004_permit_checker_edits.sql)     | Permit verification and replacement edits                                               |
| 5     | [005_assigned_parking.sql](../../supabase/005_assigned_parking.sql)             | Dedicated permit assignments, scan-based driver entry/exit, and removal of reservations |

For an **existing Supabase project**, apply only the migrations not yet installed, in order. Downloading the code onto another computer does not require rebuilding the same database. Do not rerun an older script by itself after newer migrations, because it can restore older functions and access rules.

### 6. Start the web app and sign in

To start with administrative work and manual staff entry:

```bash
npm run dev:web
```

Open the local URL printed in the terminal, usually **http://localhost:5173**.

- **Existing Supabase project:** sign in with your existing SmartPark account to keep the same lot access and role. You do not need to register again because you changed computers.
- **New Supabase project:** create an account and confirm its email, then set up the first administrator below.

GitHub/VS Code sign-in is separate from signing in to SmartPark.

**New accounts are normal users.** They see Check in / out and History. Until an administrator links their vehicle to a lot, those pages show connection instructions rather than lot creation.

#### Set up the first administrator

For a fresh database, the Supabase project owner must create the first lot and assign its administrator using the one-time SQL in [First administrator setup](../USER_ACCOUNTS.md#first-administrator-for-a-fresh-database). Create and confirm the intended administrator's account before running that setup.

For a lot that already exists:

1. Find the account under **Supabase → Authentication → Users** and copy its User UID.
2. In `parking_members`, edit or insert the row with the correct `lot_id` and `user_id`.
3. Set `role` to `admin`, then refresh the app.

Admin access is specific to a lot. Signup does not let users promote themselves. Existing administrators can create additional lots from **Settings**.

#### Give a driver parking access

As administrator, open **Vehicles & permits**, register or edit a vehicle, and fill in **Driver account email** with the driver's confirmed email. Set the permit expiry and status, select its Assigned parking spot, then save. Ask the driver to refresh their app.

### 7. Set up photo recognition (optional)

Stop the web app with **Control + C** before starting the combined app below.

#### macOS / Linux

With Python 3.12 installed:

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r backend/requirements.txt
npm run setup:models
npm run dev
```

If your compatible Python installation uses `python3` instead, use `python3 -m venv .venv` for the first command.

#### Windows — PowerShell

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm run setup:models
npm run dev
```

The setup command downloads the plate-detection and recognition models into `backend/models/` and verifies that they load. It requires internet access. After setup, recognition uses the downloaded files.

The app automatically uses the Python executable inside `.venv`; activating the environment is not required. If `.venv` already exists with another Python version, rename it before creating a replacement.

### 8. Verify the setup

Before using the system operationally:

1. Sign in and confirm that the expected user or administrator pages appear.
2. As administrator, check that the lot, capacity, and numbered spots are present.
3. Register/link a test vehicle if needed, then assign it a spot, then use a normal account to scan and confirm an entry and exit.
4. If you installed the recognition engine, upload a clear vehicle photo and review its detected plate.
5. Confirm that history shows the recorded visit and that checkout releases the spot.

An engine setup error does not prevent administrative work and manual staff entry through `npm run dev:web`; drivers need the engine to scan. Avoid testing with real parking activity until your database and account access are configured.

[Return to the README](../../README.md)
