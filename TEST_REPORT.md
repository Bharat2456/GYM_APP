# Test report

Date: 10 Nov 2026. Environment: Linux sandbox, Node 22, **no internet, no Android SDK, no device**.

## What was run and passed

Command: `node scripts/run-tests.cjs` (esbuild bundle, run on Node with `node:sqlite`)

| File | Tests | Result | Covers |
|---|---|---|---|
| `test/engine.test.ts` | 51 | pass | planner constraints (equipment, limits, pain), progression and deload, nutrition targets and food data, pose analyzers (rep counting, form cues, confidence gating, wrong view) on synthetic landmark sequences, coach rules |
| `test/db.test.ts` | 13 | pass | migrations, tenant isolation (cross-gym reads and writes rejected, silent filtering on unscoped lists), no moving records between owners, suspended-gym read-only, audit scoping, settings ownership |
| `test/services.test.ts` | 39 | pass | workout runner state machine, nutrition, payments and commission, gym join/approve/renew/refund, staff permissions, programmes and assignments, admin actions, backup/import/reset, session and role switching, coach answers from real data |
| `test/camera.test.ts` | 4 | pass | MoveNet-to-analyzer mapping, rotation and mirror math, smoothing, rep counts through the real mapping path (synthetic) |
| **Total** | **107** | **all pass** | |

Bugs these tests caught and that were fixed: customers could extend their own membership expiry, meal ids collided across users, an import path collision, a test-runner defect that silently skipped async tests, and coach keyword mismatches.

**Type check:** `tsc --noEmit` over `src/` was run against *hand-written stubs* for React, React Native and Expo modules, because the real packages could not be installed. It found and I fixed real errors (wrong prop usage, missing engine type fields, a nullable SQL parameter). It is a weaker check than the real one: component props from native libraries are not checked.

## Not verified (be sceptical of these until you run them)

| Item | Status |
|---|---|
| `npm install` resolving the pinned versions | **Not run** (no registry access) |
| `tsc` against real React Native / Expo typings | **Not run** |
| `expo prebuild` and the Gradle debug build | **Not run**. **No APK exists.** |
| GitHub Actions workflows | YAML parses; **never executed** |
| UI rendering, navigation, layout on any screen | **Never rendered** |
| Camera permission, Vision Camera, frame processor, TFLite model load | **Not run** |
| Pose detection accuracy on real people, orientation defaults, frame rate | **Not validated on a real device** |
| Pose-model download URLs in `scripts/fetch-model.sh` | **Not tested** |
| AI coach and meal-photo estimation against a live API | **Not run** |
| Local notifications scheduling on a device | **Not run** |
| QR scan and QR display | **Not run** |
| Release signing workflow | **Not run** |

## How to produce real evidence

1. Push to GitHub and read the *Android debug build* run: it performs install, model download, type check, tests, prebuild and Gradle build.
2. Install the APK on a phone, log in with each demo role, and walk through the flows.
3. For the camera, test each of the five movements side-on and front-on in good light and adjust Profile → Camera orientation if the skeleton is rotated or mirrored. Report the outcome before relying on rep counts.
