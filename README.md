# Sijda

An offline-first Islamic companion built with Flutter for Android, iOS and web.
This is the first functional foundation, not a complete religious reference or
a production-ready sensor tracker.

## Working now

- Tasbeeh with guided 34 Allahu Akbar, 33 Alhamdulillah, 33 SubhanAllah
  progression and independent free counting. Plum/orange header, pale circular
  counter, Arabic dhikr, a large tap area, Minus 1 and confirmed reset.
  Each mode persists separately, including the selected mode. Guided counting
  stops at 100; undo crosses stage boundaries. Reset affects only the active
  mode. Existing target-based records migrate to free counting without loss.
- Optional guided beeps after each stage (totals 34, 67, 100; enabled by
  default). Free-count beep settings: Off (default), Once at a chosen count,
  or Every chosen interval from 1 to 1,000,000. Settings persist locally.
  Beeps trigger only on successful forward count saves, never on loading,
  switching modes, undo, reset or settings changes. Undoing below a threshold
  and reaching it again beeps again. Once-at-count means that exact count,
  not a lifetime notification that stays consumed after undo/reset.
  An original generated 880 Hz WAV is bundled for offline playback. Sound
  depends on device volume, audio routing and browser permission; playback
  errors are shown without reverting the saved count.
- Independent user-entered qaza balances for five prayers and fasts, with
  validated editing and confirmed deductions. No age-based obligation calculator,
  women-specific settings or madhab settings.
- Manual rakat sessions with 2/3/4 targets, undo and confirmed reset. Sessions
  survive tab changes only; manual mode has no motion detection or automatic
  qaza deductions.
- Experimental **browser camera** rakat/sajdah tracker alongside the manual
  counter. A bundled MediaPipe pose model runs on-device, with front-camera
  preview, standing calibration, posture stability checks, per-rakat sajdah
  history, 2/3/4 targets, undo and partial-rakat restart. Camera sessions are
  separate from manual counts, are not persisted, and never deduct qaza.
- Optional steady white screen light and on-device dark/uneven-preview warnings.
  Android temporarily raises window brightness; browsers require manual brightness
  adjustment. Screen illumination has limited range, not all-lighting reliability.
- Responsive navigation, a remaining-balance overview and explicit storage errors.

The guided sequence is an optional counting aid, not a universal prescription.
Free counting has no session target (a technical limit of 1,000,000 applies).
The app does not judge
prayer validity or prescribe corrections for missed movements.

## Development

Use Flutter stable (scaffolded with Flutter 3.47.8 / Dart 3.13.7).
The locally installed SDK is at `../flutter-sdk`; alternatively use `flutter`
from your PATH.

The public repository excludes the pose model weights; download them locally
to avoid storing the binary in Git. Before running or building the app, download the pinned
model directly from Google and verify its checksum:

```sh
curl --fail --location \
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' \
  --output web/vendor/mediapipe/pose_landmarker_lite.task
echo '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a  web/vendor/mediapipe/pose_landmarker_lite.task' \
  | shasum -a 256 -c -
```

Stop if verification fails. Review the upstream model terms before use or
distribution; a matching checksum does not establish a license. The local model
is ignored by Git. See [asset attribution](web/vendor/mediapipe/ATTRIBUTION.md).

```sh
../flutter-sdk/bin/flutter pub get
../flutter-sdk/bin/flutter run -d chrome
../flutter-sdk/bin/flutter analyze
../flutter-sdk/bin/flutter test
node --test test/rakat_counter_test.mjs
../flutter-sdk/bin/flutter build web
```

Android builds use the existing Android SDK and Java 21 toolchain. iOS builds
require full Xcode, platform tooling and signing configuration. The confirmed
Android package identifier is `app.sijda.sijda`.

### Initial validation

- `flutter analyze`: no issues.
- `flutter test`: 23 model/widget tests covering persistence,
  failure recovery, input validation, manual sessions and large-text layout.
- `flutter build web`: successful.
- Browser smoke check: tasbeeh counting and persistence across reload; desktop
  and phone-sized layouts inspected.
- 67 Node regression tests cover counting, pose inputs, async camera lifecycle,
  low-light assistance, feedback validation and upload failures. Five Firestore emulator tests exercise
  server authorization. See [detailed cases and device matrix](test/README.md).
- Camera state-machine/landmark tests use synthetic observations, not real
  prayers. Android debug/release APKs and signed release AAB compile; real-device camera
  accuracy and iOS builds are not validated.
- Browser smoke checks loaded the real bundled model with a synthetic blank
  camera stream (no false counts), surfaced simulated permission denial, and
  verified video tracks ended on Stop and navigating away. No personal camera
  access was used during automated validation.
- A browser end-to-end check with mocked pose landmarks completed two rakat
  with two sajdahs each and stopped the camera at the target. This verifies
  wiring, not real-world pose recognition.

## Automatic rakat prototype

From Rakat, choose **Open automatic counter**. Automatic tracking uses a
dedicated full-height screen so it does not compete with the manual page's
scrolling. Live totals and camera/tracking state stay at the top; session
history and feedback are in the same scrollable page. An inactive camera shows
a text placeholder rather than a native video play control. Review/report
estimates before going Back, which ends the temporary automatic session.

Open Rakat in the **web app** and enable the camera explicitly. Mobile browsers
require an HTTPS deployment (a phone accessing a laptop's plain HTTP LAN address
will generally be blocked). `localhost` works for development on the same
device. Serve the entire web build including `rakat/` and `vendor/`.
The Android app embeds this same locally bundled camera pipeline in a WebView
served from a secure app-assets origin, with explicit Android camera permission,
an allowlisted resource loader and lifecycle teardown. No microphone permission
is requested. Android 7+ and a recent WebView are needed; physical-device
compatibility is not yet verified. Native iOS still shows manual fallback.

Stand upright and keep still for calibration. The camera must see one person
with head, shoulders, hips, knees and ankles visible, including during floor
postures. Position is flexible within those constraints, not arbitrary.
The heuristic uses normalized landmarks and a calibrated body height rather
than a fixed distance. It is not a trained prayer-posture classifier and cannot
guarantee accuracy from low/tilted views, loose clothing, occlusions, seated
prayer, all lighting conditions or all hardware.

### Low-light assistance

After enabling the camera, **Turn screen light on** opts into a steady white
background with a smaller preview. It is off by default, is not persisted, and
turns off on camera stop, completion, feedback submission, failure, navigation
or backgrounding. Android temporarily sets this window's brightness to maximum
and restores its previous override (including system-default brightness) on exit;
it never changes system brightness settings. Browser users must adjust their own
brightness. The light uses extra battery and may be uncomfortable; turn it off
if needed. It cannot reliably illuminate a whole body at typical tracking distances
and does not guarantee operation in darkness.

While the camera runs, a 32x24 preview sample is checked at most once per second
on-device. Two matching samples are required to show/clear a warning. A mostly
dark preview or a mix of dark areas and bright highlights prompts lighting or
placement changes. These are unvalidated pixel-luminance heuristics, not lux
measurements, person-specific exposure checks or accuracy certification. Warnings
never relax pose-confidence requirements or create counts. Sampling failures are
shown separately without disabling pose detection. No sample pixels or lighting
measurements are stored or uploaded. Include screen light on/off in feedback notes.

Stationary-phone motion/proximity sensors cannot replace missing full-body
camera observations. Infrared/depth hardware is not integrated or assumed.
Use room lighting or manual counting when visibility remains inadequate.

The required sequence is standing, ruku, standing, first sajdah, sitting,
second sajdah, then sitting/standing. Postures must remain stable for 600 ms.
A rakat estimate is committed only on leaving the second sajdah, not merely
seeing two low-head positions. It does not detect intention, recitation,
tashahhud or salam and does not determine religious validity.

Uncertain landmarks produce no inferred posture. Loss lasting one second or a
frame interruption pauses detection; the user must explicitly restart the
current partial rakat. Recalibration clears partial detections while preserving
completed estimates. Stop, page hiding, target completion or leaving the Rakat
screen releases the camera. Orientation/viewport changes require recalibration.
Use undo/new session to correct estimates. Reopening the screen loses the
automatic session; manual counts survive tab changes as before.

Browser accelerometers/gyroscopes track the stationary phone, not the praying
person. Proximity is not generally exposed to browsers, so no unreliable
"all sensors" fallback is advertised. Camera/secure-context/model failures
are shown explicitly and manual counting remains available. Keep the screen on;
there is no background tracking or wake-lock implementation.

Runtime/model assets are served locally with no frame upload or storage.
Optional consented testing feedback calls Firebase Auth/Firestore; the camera
page itself otherwise needs no external requests.
See [asset attribution](web/vendor/mediapipe/ATTRIBUTION.md).
The runtime's Apache-2.0 license is included. The official model card explicitly
lists Apache-2.0 for the BlazePose models; see the attribution for source evidence.

## Tester feedback and Firebase

Open **Rakat → Report test results / placement feedback**. Enter whether the
count was correct, actual rakat/sajdahs, mobile placement, approximate distance,
lighting, phone/browser and optional notes. Submitting stops the camera first.
A clearly labeled example demonstrates incorrect detection and never uploads.
Feedback does not change counters or automatically train a model.

Reports are saved locally; only checking the consent checkbox uploads to
`sijda-testing-20261027`. The free Firestore database is in `us-central1` (Iowa).
The owner chose retention until manual deletion. No paid services or billing
were enabled. Anonymous Auth permits create-only reports; client reads, lists,
updates, deletes, unauthenticated writes and sample uploads are denied.
The public Firebase API key in the client is configuration, not an admin secret.
Rules are in [firestore.rules](firestore.rules).

Live integration checks confirmed authorized create and rejected unauthorized
writes/reads/sample submissions. All integration-test records/users were removed.
The report contains count summaries and at most 500 coarse transition entries,
not images, videos or raw body landmarks. Device/browser details and optional
free text can still be sensitive; do not enter personal information.
Local JSON export downloads a file in browsers and also displays selectable
JSON. Android's embedded view displays the JSON for long-press/select-all/copy
to a private file; native file downloads are not implemented. Export never
uploads feedback. Upload errors retain
the local copy. No backend submission is claimed successful until acknowledged.

```sh
npm ci
npm test
# Requires Java 21+; uses a demo project, never the live database.
npm run test:rules
# Owner/admin only; keep the output private, outside the repository.
node scripts/feedback_report.mjs /absolute/private/path/sijda-feedback-report.json
```

The admin export groups reported errors by placement and lighting and retains
the underlying reports for review. It does not change model thresholds or train
automatically. It requires your own `gcloud auth login`, never embedded admin
credentials. Existing export files are not overwritten.

Firebase SDK/CLI dependencies are development-only validation/deployment tools;
the shipped feedback client uses HTTPS REST, not those npm packages. npm reports
transitive advisories in these development tools; no force-downgrade was applied.
Anonymous authentication alone is not public anti-abuse protection. App Check
or authenticated tester-only access is a gate before wider distribution.

## Android signing and Play status

Package ID: `app.sijda.sijda` (confirmed by the owner). Dedicated upload signing
files are outside the repository at `~/.config/sijda/`; back up that directory
privately. Never commit or share its files. Gradle reads `signing.properties`
there, or the file specified by `SIJDA_SIGNING_PROPERTIES`. Release builds fail
explicitly when signing is absent rather than silently using debug signing.

Sijda has been created in Play Console. Version `0.1.2` / code `3` fixes the
phone automatic-counter layout, pins totals/tracking status and retains
estimates after Stop. Publishing overview lists
`0.1.2 (3) - automatic counter UI fix` under **Changes in review** for closed
Alpha testing, with Google's quick checks running. Approval and tester
installation availability for this update are not yet verified.
A signed bundle is built at `build/app/outputs/bundle/release/app-release.aab`.
A directly installable, signature-verified release APK for physical-device testing
is at `build/app/outputs/flutter-apk/app-release.apk` (approximately 63.4 MB).
Production remains untouched. The update does not retain previous bundles.
The initial country selection was Pakistan, United Arab Emirates, United
Kingdom and United States; during this update Console displayed 178 countries.
No country settings were changed for this update; the owner should verify the
intended geography in Console. The layout fix still needs validation on the
affected physical phone.
Publisher: **MJ.**; public support/privacy/deletion contact:
**fehmatics@gmail.com**. The [privacy-policy HTML](web/privacy.html) is written;
the policy-only GitHub Pages deployment is configured by
[workflow](.github/workflows/privacy-pages.yml). The app links to
https://itsjohn9-cell.github.io/sijda/privacy.html. Verify deployment and the
Play Console policy URL before submission.
See the [store-readiness checklist](docs/STORE_READINESS.md) and
[Data safety worksheet](docs/DATA_SAFETY.md). Existing tester-list names supplied by the
owner map to the existing "Closed testers", "Fam" and "Testers" email lists,
which were selected and saved in Play Console. No tester email addresses were
copied into this repository.

## Data and privacy

Counters and balances are stored as a versioned local record using
`shared_preferences`. There is no required user account, advertising SDK or location
collection. Optional feedback uses anonymous Firebase authentication and a
Firestore backend. Optional camera tracking uses transient
on-device frames without recording/uploading. App/browser data clearing or uninstalling
can remove records; there is no export, backup or cross-device synchronization.
Optional consented feedback is uploaded as described above; counters and qaza
balances are not synced. Platform-managed backups may apply. This is lightweight local storage, not an
encrypted or guaranteed durable ledger. A failed write is shown visibly and
does not update the in-memory balance. Invalid saved data is reported rather
than silently replaced.

The web build may fetch Flutter rendering assets on its initial load. Native
counter flows do not need a connection; web offline cold-start support has not
been implemented or verified.

## Delivery roadmap

1. Validate manual flows on real Android/iOS devices; add export/restore and
   stronger structured persistence before more substantial records accumulate.
2. Validate and improve the experimental browser/Android rakat tracker before
   claiming reliability. Test real lighting,
   placement, clothing and device differences. Two detected sajdahs alone do
   not establish a completed rakat.
3. Add native tasbeeh widgets and accessible interaction options. Do not promise
   screen-off button handling across platforms.
4. Prayer times with explicit calculation conventions, location/manual-city
   selection and tested time-zone handling; optional reminders and a prayer log.
   No madhab settings are included in this initial version; calculation
   differences must be explained before prayer times ship.
5. Qibla with sensor capability checks and a map-based alternative; reviewed
   adhkar/duas; a properly licensed and attributed Quran reader.
6. Hijri calendar with date-variation notices and Ramadan tools. Later: zakat,
   mosque finder and 99 Names with verified sources.

English is the initial UI. Arabic/Urdu localization and right-to-left validation
are planned, not implemented. Review religious content with qualified reviewers
before publication. App-store/trademark availability for Sijda is not verified.
