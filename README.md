# Kinetic Coach — AI-assisted fitness app (prototype)

Mobile-first, single-file vanilla JS app. No server, no login. All data stays on the device (IndexedDB, with localStorage/memory fallbacks).

## Open and use
- **Artifact (hosted by Claude):** onboarding → plan → workouts, nutrition, coach, progress, gym workspace, Simulation Lab all work. **Live camera does not work there** (the frame refuses camera access).
- **Standalone (for real camera):** unzip `fitness-app-standalone.zip`, push the `standalone/` files to a GitHub repo, enable Pages (Settings → Pages → deploy from branch). Open the https URL on your phone/laptop. Locally: `python3 -m http.server` inside the folder, open `http://localhost:8000`.
- First launch walks through onboarding; "Load example history" on Profile fills charts with clearly marked sample data.

## Architecture
`src/data.js` exercises + foods · `src/core.js` pure logic (planner, adaptation, nutrition, progress, coach rules, gym/tenant/referral) · `src/pose.js` pose analyzers (squat, push-up, curl, press, lunge) as rep state machines on 33 MediaPipe-style landmarks · `src/app1-5.js` UI, storage, camera, nutrition/coach/progress, profile/gym · `build.js` concatenates to `dist/artifact.html` and `dist/standalone/` (PWA: sw.js, manifest, icons).
Camera path: getUserMedia → `@mediapipe/tasks-vision` pose_landmarker_lite (loaded from CDN) → analyzer → skeleton overlay + cues. Metrics only; no video is stored or sent.

## Feature status
| Feature | Status |
|---|---|
| Onboarding, profile, safety acknowledgement, editing | IMPLEMENTED AND TESTED |
| Planner + adaptation (missed, easy/hard, fatigue, pain, equipment) | IMPLEMENTED AND TESTED (unit tests) |
| Workout runner, history, swap, reschedule | IMPLEMENTED AND TESTED |
| Exercise library (37), search, filters, detail | IMPLEMENTED AND TESTED |
| Animated stick-figure demonstrations | PARTIALLY IMPLEMENTED (schematic, not video) |
| Nutrition (≈50 Indian/international foods), correction, custom food | IMPLEMENTED AND TESTED |
| Meal photo estimate (Claude vision) | IMPLEMENTED BUT NOT FULLY TESTED |
| Coach: local rules engine, safety path | IMPLEMENTED AND TESTED |
| Coach: Claude conversation | IMPLEMENTED BUT NOT FULLY TESTED |
| Progress, charts, weekly report | IMPLEMENTED AND TESTED |
| Pose analyzers on simulated landmarks (5 exercises) | IMPLEMENTED AND TESTED |
| Simulation Lab (labelled, never saved) | IMPLEMENTED AND TESTED |
| Camera stream, indicator, graceful model-load failure | IMPLEMENTED AND TESTED (Chrome fake camera) |
| Real pose model on live video | IMPLEMENTED BUT NOT FULLY TESTED (no internet where built) |
| Gym registration, branding A/B, invites, referrals, isolation | IMPLEMENTED AND TESTED (logical isolation on one device, not server security) |
| Trainers (unverified), consent sharing | PARTIALLY IMPLEMENTED |
| Billing / commission | PARTIALLY IMPLEMENTED (TEST mode only, no real money) |
| Export / import / delete / reset | IMPLEMENTED AND TESTED |
| Service worker / offline | IMPLEMENTED BUT NOT FULLY TESTED |
| Native apps, wearables | NOT IMPLEMENTED |

## Test report
- `node test/engine.test.js`: **51/51 pass** (planner, adaptation, nutrition, progress, coach safety, gym/tenant/referral, pose on simulated sequences incl. low confidence, wrong view, portrait; a 100-run noise sweep had 0 false flags).
- `node test/e2e.js` (headless Chromium, 390×844, fake camera): **27 of 28 checks pass**; the 1 non-pass is #12, real landmark detection, **BLOCKED** (the sandbox cannot download the model). Covered: onboarding, persistence after reload, plan, workout completion + history, library search/filters, nutrition log + correction, progress numbers vs stored data, coach safety reply, camera permission, model-load failure handling, simulation + low confidence, gym create/branding/referral/conversion/isolation, export → delete → import, example data, no horizontal overflow at 320–1280 px, dark/light screenshots.
- Bugs found and fixed during testing: coach Send button stayed disabled after a reply; import could race the reload (KV writes not awaited); several generator/threshold issues in pose tests.
- **Not performed:** real-person pose accuracy, Claude-backed coach/photo calls, service-worker offline run, real devices (iOS/Android), accessibility audit with a screen reader.

## Known limitations
Pose estimates are 2D and approximate, not a validated form assessment. Coach/calorie numbers are general guidance, not medical advice. Gym "security" is app logic on one device; a real launch needs a backend with accounts. Trainer profiles are not verified. Payments are test-mode only.
