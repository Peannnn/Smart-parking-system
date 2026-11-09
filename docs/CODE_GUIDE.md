# Beginner code guide

SmartPark has three parts: a React screen in your browser, a Supabase database for accounts and parking records, and a Python service on your computer that reads plate photos.

## Start reading here

1. `src/main.jsx` starts React and loads the styles.
2. `src/features/auth/AuthScreen.jsx` shows login/signup or the signed-in workspace.
3. `src/features/auth/hooks/useAuthentication.js` restores the session and handles account actions.
4. `src/features/parking/ParkingWorkspace.jsx` chooses the visible page for the user's lot role.
5. `src/features/parking/hooks/useParkingWorkspace.js` loads the selected lot and coordinates changes.
6. Open the matching file in `src/features/parking/pages/` to read that page's layout.

A **component** is a function that draws part of a screen. Its `.jsx` file contains HTML-like markup. A **hook**, named `useSomething`, keeps state or connects a component to outside data. A **service** handles communication or storage. An **action** handles a particular user operation, such as uploading a photo.

## Where each job lives

| Change                                          | Start here                                           |
| ----------------------------------------------- | ---------------------------------------------------- |
| Login or signup screens                         | `src/features/auth/AuthScreen.jsx`                   |
| Sign-in, signup, sign-out, session restoration  | `src/features/auth/hooks/useAuthentication.js`       |
| User/admin navigation                           | `src/features/parking/navigation.js`                 |
| Workspace header and lot selector               | `src/features/parking/components/`                   |
| Dashboard counts                                | `src/features/parking/pages/DashboardPage.jsx`       |
| Staff entries and exits                         | `src/features/parking/pages/EntryExitPage.jsx`       |
| Driver scanning and confirmation                | `src/features/driver/DriverParking.jsx`              |
| Permit form, table, checker, deletion dialog    | `src/features/permits/`                              |
| Lot settings and staff forms                    | `src/features/settings/`                             |
| History loading, paging, and CSV download       | `src/features/parking/hooks/useParkingHistory.js`    |
| Fetching all vehicles, visits, and spots        | `src/features/parking/services/parkingRepository.js` |
| Scanner screen                                  | `src/features/scanner/PlateScanner.jsx`              |
| Scanner state and cleanup                       | `src/features/scanner/hooks/usePlateScanner.js`      |
| Upload, camera, recognition, and save actions   | `src/features/scanner/actions/`                      |
| Sending a photo to the Python API               | `src/features/scanner/services/recognitionApi.js`    |
| Optional browser-only scanner history           | `src/features/scanner/services/localHistory.js`      |
| Supabase connection                             | `src/services/supabase.js`                           |
| Plate, date, duration, and CSV helpers          | `src/shared/parkingFormatters.js`                    |
| Colors, layout, and mobile rules                | `src/styles/`                                        |
| Python API routes and local access restrictions | `backend/app.py`                                     |
| Photo validation and decoding                   | `backend/image_decoder.py`                           |
| Turning model predictions into plate results    | `backend/recognition.py`                             |
| Loading or downloading recognition models       | `backend/models.py` and `backend/setup_models.py`    |
| Database permissions and parking rules          | `supabase/`                                          |

The controller hooks keep form state in the same place as before. Moving between pages therefore retains drafts; changing lots resets the same fields as before. Page components receive the data and callbacks they need as **props** (function inputs).

## Follow a driver's check-in

1. `DriverParking.jsx` shows the driver's linked permits and assigned spots.
2. `PlateScanner.jsx` combines `CapturePanel.jsx` and `ReviewPanel.jsx`.
3. Upload or camera actions prepare a photo. Recognition calls `/api/recognize` through the relative local API address.
4. `backend/app.py` accepts the request. `image_decoder.py` checks and decodes the image; `recognition.py` formats the model's predictions.
5. The driver reviews the plate and confirms check-in.
6. The browser calls the existing Supabase `parking_check_in_assigned` function. The database checks permissions and uses the permit's assigned spot.
7. The workspace refreshes. The admin sees the new occupancy; history shows the visit.

A permit lookup uses `PermitChecker.jsx` and does not create a visit. Checking out ends the visit while keeping the spot assigned to the permit.

## Styling

`src/styles/index.css` imports every stylesheet in a deliberate order. Shared rules come first, followed by feature rules and their existing responsive overrides. Keep that order when editing: a later CSS rule can override an earlier one.

Styles use the same class names and values as before. Mobile rules live in files named `responsive.css`, plus the spot-specific mobile rules in `parking/spots.css`.

## Database migrations are history

Run the SQL files in the order described in the [setup guide](setup/NEW_COMPUTER.md). Older migrations mention reservations and older entry functions because existing installations need those upgrade steps. Migration 005 disables reservations and installs assigned parking. Do not delete earlier migrations or rerun only an older migration after upgrading.

Database regression tests check both historical upgrades and the current rules. They run locally and do not change your real Supabase data.

The scanner's optional standalone mode still supports its existing local history and legacy todo display. Normal parking pages provide an `onRecord` callback, so they use parking confirmation instead.

## Keep files readable

- Give a file one clear responsibility, such as rendering a permit form or decoding an image.
- Keep related files in their feature folder. Put genuinely shared utilities in `src/shared/`.
- Use readable formatting instead of compressing several statements onto one line.
- Split a file before it exceeds 300 lines. `npm run check:files` checks handwritten code, styles, guides, and SQL. ESLint also checks JavaScript file lengths.
- Keep npm's generated `package-lock.json` intact. It records exact dependency versions and is exempt from the handwritten-file limit, as are installed dependencies, downloaded models, and build output.
- Preserve database access checks when reorganizing screens. Hiding a button does not replace database permissions.

## Verify a change

```bash
npm test
npm run lint
npm run check:files
npm run build
```

After installing Python dependencies:

```bash
npm run test:api
```

Run the app with the same commands as before: `npm run dev` for the web app and local recognition engine, or `npm run dev:web` for the frontend alone. This reorganization does not require a database migration or a new `.env.local` file.
