# Sijda validation and release gates

## Repeatable automated checks

### Mobile result visibility regression

- Rakat opens automatic counting on a dedicated viewport-height route, not a
  900px platform view inside Flutter's manual-counter scroll area.
- At 360x640 the route has no enclosing Flutter scroll view or manual counter;
  Back returns to the manual page without overflow.
- The camera page keeps totals and setup/active/paused/stopped state at the top
  while its one HTML document scrolls. Completed estimates remain visible after
  Stop; zero estimates are explicitly labeled.
- Before acquisition and after Stop/error, the video is hidden and a camera-off
  placeholder replaces native WebView video controls.
- The review shortcut opens the feedback details and offsets the anchor below
  sticky results. Android permits same-document fragments without allowing
  arbitrary navigation; its policy link opens externally.
- Verify on the affected Android phone that the results, history, restart/undo
  controls and feedback form are reachable with one-finger scrolling. Check
  small screens, landscape and enlarged text, and confirm Back releases camera.

```sh
../flutter-sdk/bin/flutter analyze
../flutter-sdk/bin/flutter test
node --experimental-vm-modules --test test/*_test.mjs
../flutter-sdk/bin/flutter build web
../flutter-sdk/bin/flutter build appbundle --release
```

The VM flag is required for the camera lifecycle harness. It supplies fake
camera tracks and model results; it never accesses a personal camera.

### Counter and pose classification cases

The strict counter retains its 600 ms dwell / 1000 ms unknown filters. The live
adaptive pipeline now uses 200 ms raised-posture and 400 ms sajdah filters, with
a 4000 ms unsupported-unknown timeout in every phase. Regression coverage in
`sensor_counting_test.mjs` and the real camera-module VM harness includes:

- Fast 2/3/4-rakat sequences, including 200 ms ruku/qaumah/jalsah and 400 ms sajdah.
- Exact 199/200 ms and 399/400 ms boundaries and short hand-sweep rejection.
- Tracking blips within a single long sajdah never produce another entry.
- Missing visual ruku/qaumah/jalsah produces a pair estimate, never full verification.
- Camera-only and native proximity-supported occlusions; FAR release needs an
  associated NEAR entry and must not contradict a continued visible sajdah.
- No sensor-only calibration/counting, no counting from a frozen camera,
  no inference from dark pixels, and no completion merely from Stop.
- Sensor capability/invalid-reading handling, explicit bridge/permission failure,
  accelerometer/gyro/angle-change recalibration and sensor shutdown on exit.
- Manual and automatic multi-person restart clears stale timestamps/partial
  detections and retains completed totals.
- Shared, standing-calibrated face scale and consistent mat-mode selection.

`npm run benchmark` now reuses the live fusion and adaptive counter on generated
landmarks, counts observed pauses and explicitly disclaims production readiness.
It still bypasses real camera/model recognition and is not an accuracy test.
Two historical tutorial replays intentionally remain incomplete: one has no
stable second-rakat separator, and one has only bow-like separator noise and a
5.4-second unknown interval.
The old permissive behavior counted through these gaps; regression tests now
require an incomplete result/pause rather than fabricated completion. Some
other tutorial tests still substitute posture labels during recitation cards;
they are continuity tests, not live-recognition validation.

Before releasing, collect consented, local-only flat-mat recordings with manually
labeled movements and compare actual versus detected phases, pair counts,
missed/extra sajdahs and pauses. Include fast/slow sequences, long prostration,
short sitting, 2/3/4 targets, reflections, hand/cloth occlusions, low light and
phones with missing sensors. Check native proximity on-change values remain
usable during long holds, continuous motion samples expire when stale, and
all sensor listeners stop with the camera. No physical-device accuracy is
established by generated landmarks, tutorial replays or compilation.

Deploy backward-compatible feedback rules to the existing project **before**
distributing v3 clients. `npm run test:rules` verifies both algorithm versions
in the demo emulator; no live writes are required.

Browser smoke validation at 390px width: the real bundled model on a synthetic
black camera stream stayed in setup with zero counts and a low-light warning.
With controlled frame timestamps and mocked pose results, the browser completed
two fast rakat estimates, labeled both full-sequence-observed, stopped camera
tracks at target and had no horizontal overflow. The inactive browser tab
throttled real timers to about 1 Hz, so controlled stepping was necessary; this
is wiring validation, not camera recognition or real-time performance evidence.

The following legacy table covers strict-order counter behavior:

| Case | Expected result |
|---|---|
| Standard standing/ruku/standing/two-sajdah sequence | One estimated rakat only after leaving second sajdah |
| Targets 2, 3 and 4 | Stop adding estimates at target |
| Direct standing after second sajdah | First standing of next rakat is retained |
| Sitting after second sajdah | Require standing before next ruku |
| Two low-head poses without ruku/standing | No rakat; unexpected stable order pauses |
| Sitting while descending to first sajdah | Allowed without counting it as sajdah |
| Repeated/long standing, ruku or sajdah | No duplicate counts |
| Dwell 599 ms versus 600 ms | No transition versus one stable transition |
| Unknown 999 ms versus 1000 ms | Hold versus pause |
| Brief unknown then same sajdah | No duplicate sajdah |
| Missing frames over 1500 ms | Pause; no guessed posture |
| Backwards/duplicate/negative/nonfinite timestamps | Explicit rejected input |
| Unexpected standing between sajdahs | Pause rather than stitch stale sequence |
| Restart partial rakat | Clear partials, retain completed estimates |
| Undo completed rakat with partial next one | Remove last estimate and partial detections |
| Empty undo | Safe, zero remains |
| Cropped/low-confidence/nonfinite landmarks | Unknown; no posture inferred |
| Invalid/zero/NaN calibration | Unknown |
| Moderate normalized scale/offset | Standing calibration works without fixed distance |
| Changed floor/ankle baseline | Unknown rather than assuming old framing |

### Camera lifecycle and failure cases

- No permission request before an explicit Start.
- Blank stream never counts and cannot pass calibration.
- Calibration immediately changes the summary to active when it completes.
- No initial video frames for more than 1500 ms show a calibration-on-hold
  warning. Recovery requires a fresh 1.5-second stable standing calibration.
- Frozen calibrated video pauses after more than 1500 ms, without new counts.
- Calibration gaps discard partial standing dwell; multiple detected people
  prevent calibration and pause an active session rather than choose a person.
- Stop releases tracks, closes detector and clears preview.
- Late model resolution after Stop closes the late detector.
- Late camera resolution after cancellation stops all late tracks.
- Permission denial releases detector and displays a visible error.
- Insecure contexts explicitly direct the tester to HTTPS/manual mode.
- Hidden page, parent navigation and pagehide release resources.
- Foreign-origin parent messages cannot operate the camera.
- Inference exceptions stop the camera and preserve a visible failure.
- Browser smoke checks additionally exercise the real bundled WASM/model.

### Low-light assistance cases

- Screen light is opt-in, disabled before camera acquisition, and never persisted.
- White background and compact preview do not replace pose-confidence checks.
- Browser users are explicitly told to adjust brightness manually.
- Android bridge requests and failures are covered in the JS lifecycle harness;
  actual window brightness restoration still requires a physical-device check.
- Stop, hidden page, pagehide, parent navigation, inference failure and feedback
  submission disable screen light and request brightness restoration.
- Black/dim frames, bright frames, RGB luminance weights, mostly-dark scenes,
  backlit patterns and exact heuristic boundaries are covered with synthetic pixels.
- Warning and recovery require two consecutive matching samples; sampling is
  limited to once per second. Normal-looking frames never certify body visibility.
- Preview-sampling failure is visible without stopping pose tracking.
- Browser smoke check at 390px width: real bundled model plus a synthetic black
  camera stream produced a low-light warning and zero counts; enabling screen
  light produced a white background, 120px preview, manual-brightness guidance
  and no horizontal overflow. Cleanup ended tracks and disabled screen light.
  The shared hidden tab needed synthetic frame timers; this is not physical
  lighting or native-brightness validation.

Physical-device matrix (not yet verified): repeat simulated 2/3/4-rakat sessions
in normal light, dim light, complete darkness and strong backlighting; compare
screen light off/on at under 1 m, 1–2 m and over 2 m. Include light/dark clothing
and each usable placement. Record expected versus detected counts, uncertain
pauses, device/WebView version, lighting and screen-light state. Do not treat
passing synthetic tests as recognition-accuracy evidence. Manual fallback is
expected when camera/sensor evidence cannot distinguish separate movements.
Check that haptic vibration does not itself trigger the phone-moved safeguard.

On Android, check brightness initially set to automatic, low manual and high
manual settings. After opting in, verify restoration on manual Stop, target
completion, background/foreground, navigation, feedback, permission/camera
failure and activity recreation. Verify screen light stays off on restarting,
and system brightness settings remain unchanged. In a browser, check compact
layout on small screens and manual brightness messaging. No flashing is used.

### Feedback cases

- Zero detected counts are valid for failed tests.
- Expected counts are entered by the tester, never inferred as religious rules.
- Correct verdict cannot coexist with mismatching counts.
- Sample feedback is visibly labeled and rejected by the upload validator.
- Placement, distance, lighting, device and notes are bounded/validated.
- Missing config, auth denial, malformed auth response and write denial fail explicitly.
- Successful submission uses anonymous auth and contains no images/raw landmarks.
- Local storage failure must not display success or attempt an upload.
- Upload failure retains the local copy and explains recovery.
- Export excludes the sample; submission never adjusts qaza or live counts.
- Native feedback export offers selectable JSON without uploads or downloads,
  including at the 100-report save limit. Browser export retains file download
  and also offers selectable JSON. Invalid stored feedback clears stale export
  text and shows an error without overwriting storage.
- On a physical Android device, check the review shortcut opens the form below
  the sticky header, the privacy link opens a browser, and long-press/select-all/
  copy preserves exported JSON. These native interactions are not established
  by the JS harness or an Android build.

Browser checks confirmed consent-off submission stayed local and a simulated
quota/storage failure displayed failure rather than success. The exact local
synthetic test report was removed without clearing other records.

The last three storage/UI cases require browser checks in addition to the pure
service tests. Five Firestore emulator tests exercise valid creates, denied
reads/lists/updates/deletes, missing identities, spoofed ownership, nonanonymous
identities, malformed reports and default-deny collections. Live checks also
verified authorized create and rejected unauthorized reads/writes/sample uploads,
then removed the exact temporary test records and user.

## Required real-device matrix before closed-test submission

Record each result through **Rakat → Report test results / placement feedback**.
Use non-prayer rehearsals first; do not rely on the estimates during worship.

| Dimension | Cases |
|---|---|
| Devices | Low/mid/high Android, older supported WebView, tablet; iPhone Safari web |
| Framing | Floor tilt, low stand, chair, shelf; under 1 m / 1–2 m / over 2 m |
| Light | Bright, normal, dim, backlit |
| Person | Different heights, loose clothing, head coverings; one person versus bystander |
| Sequence | 2/3/4 rakat, slow holds, quick transitions, long sitting, corrections |
| Loss | Head/feet cropped, occlusion, person exits/re-enters, second person enters |
| Interruptions | Screen lock, app switch, rotation, phone call, camera revoked |
| Recovery | Deny/retry permission, stop during setup, recalibrate, undo, new session |
| Device load | Thermal throttling, low battery, low frame rate, no network after install |
| Feedback | Correct/incorrect/unsure, consent off/on, offline failure, quota rejection |

For each trial record detected and actual rakat/sajdahs, missed/extra transitions,
placement, device/browser and lighting. Measure exact-session accuracy and
per-sajdah precision/recall separately. Do not equate synthetic-test success with
measured accuracy. Do not claim a reliability percentage until actual trials
provide a denominator and reproducible placements.

## Audit findings addressed

1. Stable out-of-order movements could previously bridge stale partial states:
   now they pause and require explicit restart.
2. Monotonic time was not enforced: duplicate/backwards observations now fail.
3. NaN/infinite calibration and out-of-range confidence could pass input checks:
   now they yield unknown.
4. A stalled video feed during calibration could contribute stale dwell time:
   now baseline and dwell restart after a frame gap.
5. Feedback did not exist: added a consent-based form, labeled sample, local
   recovery/export and a Firebase client with visible failures.
6. Android previously offered only manual mode: an embedded local camera page
   now has explicit runtime permission and teardown hooks. Debug and signed
   release compilation pass; physical-device behavior is still unverified.

## Remaining release blockers

- Real-device recognition accuracy is unverified.
- Native Android camera/permission/WebView behavior needs physical-device checks.
- Firebase project, anonymous Auth and Firestore rules are deployed and
  integration-tested; no paid services or billing were enabled.
- Anonymous create-only feedback is not a robust public anti-abuse mechanism.
  Add validated App Check or tester-only authorization before wider distribution.
- Dedicated release signing is configured and the AAB signature verified.
- Resolve separate pose model licensing before public distribution.
- Finalize privacy policy, retention/deletion contact, store screenshots, content
  rating, Data safety declarations and a closed-test tester list.
