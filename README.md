# Kinetic Coach

A native Android fitness and gym-management **demo** built with React Native (Expo SDK 52), TypeScript and SQLite. It runs fully offline on the phone. There is no WebView, PWA or single-file web app.

> **DEMO MODE.** Payments are simulated, authentication is local, and data lives only in the phone's SQLite database. Do not use it with real money or sensitive data. See [Limitations](#limitations).

## What it does

| Area | What is in the app |
|---|---|
| Roles | **User**, **Gym** (owner/staff), **Platform admin**. Role-selection login, local sign-up, persistent *DEMO MODE* banner, admin "view as" role switching with a one-tap way back. |
| Workouts | Deterministic planner (profile, equipment, limits, pain flags), pause/resume, skip, replace, suggested weights, history-driven adaptation, plan versions and change log. |
| Camera coach | Live on-device pose estimation (MoveNet Lightning via TFLite) feeding rep counters and form checks for squat, push-up, curl, overhead press and lunge. Confidence gating, privacy indicator, nothing stored except rep/form summaries. A clearly labelled **simulation** mode replays synthetic motion. |
| Nutrition | Indian and packaged foods with fibre, editable servings, custom foods, daily targets (editable within safe limits), optional photo estimate through *your own* AI key (stored in the Android keystore, never in code). |
| Coach | Rules-based answers from your own data (works offline), optional LLM wording clearly tagged "AI". Safety and pain cases never go to the LLM. |
| Library | Instructions, safety notes, animated schematic guide, search and filters. |
| Gym management | Profile and branding, packages, join codes and QR (display and scan), join requests, approve/reject/renew, walk-in customers, staff roles and permissions, programmes and assignments, announcements, challenges, referrals, reports, demo revenue, activity history. |
| Admin | Platform stats, gyms (approve/suspend/reactivate), accounts (suspend, reset password, delete, view as), content (exercises on/off and edit, categories, templates, plans, commission, branding, defaults), payments, referrals, audit, health diagnostics, export/import/reset. |
| Payments | `PaymentProvider` interface with a `DemoProvider`. A real gateway (for example FitnessPay) can be added later by implementing one interface. |
| Notifications | Local only (`expo-notifications`): workout, meal and membership reminders; gym announcements shown while the app is open. |
| Backup | Per-user export/import/delete and a full platform export/import/reset. |

## Demo accounts

| Role | Username | Password |
|---|---|---|
| Platform admin | `admin` | `admin123` |
| Gym owner | `gym` | `gym123` |
| User | `user` | `user123` |

Seed data also contains a second isolated gym (`gym2`-style owner) and more customers so tenant isolation can be seen. These credentials are public demo values.

## Architecture

```
index.ts                 registerRootComponent
src/App.tsx              boot (SQLite, migrations, seed), theme + gym branding, toast, confirm dialog, DemoBanner, role tabs
src/app/                 context (repo/session/theme), tiny stack+tab navigator, native wrappers (platform.ts)
src/engine/              plain TypeScript logic: exercise library, planner, pose analyzers, nutrition, coach rules
src/db/                  DB adapter interface, expo-sqlite adapter, versioned migrations, Repo (policy + tenant isolation), seed
src/services/            workouts, nutrition, gym, admin, payments, coach, notifications, backup, session
src/screens/             auth, user (home/train/runner/nutrition/coach/progress/profile/gym), gym, admin
src/camera/              MoveNet mapping (pure, tested), PoseCamera (Vision Camera + fast-tflite), QR scanner, camera screens
test/                    engine, database, services, camera-mapping tests (run on Node with node:sqlite)
.github/workflows/       debug APK build, optional signed release
```

**Data layer.** Every read and write goes through `Repo`, which checks a per-collection policy for the acting account. Customers only see their own rows, gym staff only their gyms' rows (and a member's progress only if the member opted in), suspended gyms are read-only, and records cannot be moved between owners or gyms. Controlled escalations (for example resolving a join code) use an audited `SYSTEM` actor. The schema is versioned (`src/db/schema.ts`) and migrated at boot.

**Pose pipeline.** Vision Camera frame (15 fps) → resize to 192×192 → MoveNet Lightning (int8 TFLite, bundled) → 17 keypoints mapped to the 33-point layout the analyzers use → smoothing → analyzer (rep counting, form cues, confidence states `nobody / lowconf / settling / wrongview / positioning / ok`) → skeleton overlay. Frames are never saved or uploaded.

## Run it

Requirements: Node 22, JDK 17, Android SDK (or just use GitHub Actions).

```bash
npm install
npm run fetch-model       # downloads the pose model (needs internet) into assets/models/
npm run verify            # type check + tests
npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

The camera and TFLite modules are native, so **Expo Go will not work**. Use a development build (`npx expo run:android` with a phone or emulator attached) or the APK.

## Get an APK with GitHub Actions (no Android Studio)

1. Create an empty repository on GitHub, then in this folder:
   ```bash
   git init && git add . && git commit -m "Kinetic Coach"
   git branch -M main
   git remote add origin https://github.com/<you>/kinetic-coach.git
   git push -u origin main
   ```
2. Open the repository's **Actions** tab. The *Android debug build* workflow starts on every push to `main`, on pull requests, and manually (**Run workflow**).
3. When it finishes, open the run and download the **kinetic-coach-debug-apk** artifact (a zip containing the `.apk`).
4. On the phone, allow installs from your file manager or browser, then open the APK.

For a signed release APK, add the four secrets listed at the top of `.github/workflows/android-release.yml` and run *Android signed release* manually.

## Troubleshooting

- **Workflow fails at "Download pose model".** The model host may have changed. Download any MoveNet *SinglePose Lightning* `.tflite` and commit it as `assets/models/movenet_lightning.tflite` (remove that line from `.gitignore`), or fix the URL in `scripts/fetch-model.sh`.
- **Workflow fails at "Type check".** The type check could not be run against the real React Native typings in the authoring environment. Open the failing step's log; the errors are normally one-line fixes.
- **`npm install` peer-dependency errors.** Dependency versions are pinned for Expo SDK 52 but were not resolved against the registry when written. Run `npx expo install --fix` locally and commit the updated `package.json` and the generated `package-lock.json`.
- **Skeleton rotated or mirrored.** Profile → Camera orientation (0/90/180/270 and Mirror).
- **Camera is black or the model will not load.** System tab → Health shows the pose-model status.
- **Reminders do not fire.** Allow notifications for the app, then Profile → Apply reminders. Some phone brands restrict background alarms.

## Limitations

- **Not built or run on a device in this environment.** The authoring sandbox had no internet and no Android SDK, so no APK was produced and the UI was never rendered. Logic was tested; native UI and camera were not. See `TEST_REPORT.md`.
- **Pose detection is unvalidated on real hardware.** The mapping and analyzers are tested on synthetic landmark data only. Accuracy, orientation defaults and speed on real phones are unknown. Counts and form notes are estimates, not medical or coaching advice.
- **No lockfile and unresolved dependency versions** (could not reach the npm registry).
- **Authentication is a prototype**: salted iterated SHA-256 in pure JavaScript, local only. Production needs a server and a proper password KDF.
- **Demo payments only.** No real money moves.
- **AI features** (coach wording, meal-photo estimates) are optional, were not exercised against a live service, and send data to the provider you configure.
- **Notifications are local**; there is no push service.
- Nutrition values are approximate typical figures, not lab data.

## Postponed (by design)

Trainer marketplace, real payment gateway, production authentication, wearables, iOS.
