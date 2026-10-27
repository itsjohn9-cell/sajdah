# Sijda store readiness

Publisher: **MJ.**
Public support/privacy/deletion email: **fehmatics@gmail.com**
Android package: `app.sijda.sijda`

## Required files and current state

| Item | Location | State |
|---|---|---|
| Public privacy-policy page | [web/privacy.html](../web/privacy.html) | Live on GitHub Pages; included in changes sent for review |
| Data safety preparation | [DATA_SAFETY.md](DATA_SAFETY.md) | Worksheet only; owner must verify live Console answers |
| Device tests and release gates | [test/README.md](../test/README.md) | Automated coverage; physical-device verification pending |
| Third-party runtime license and model notes | [attribution](../web/vendor/mediapipe/ATTRIBUTION.md) | Apache-2.0 runtime license included; official model-card license verified |
| Setup and feature limitations | [README](../README.md) | Includes model download/checksum instructions |
| Signed AAB | Local `build/app/outputs/bundle/release/app-release.aab` | 0.1.1/code 2 uploaded and saved; closed-test changes sent for review |
| Latest signed installable APK | Local `build/app/outputs/flutter-apk/app-release.apk` | Local testing output; rebuild after source changes; not committed |

## Privacy-policy hosting

The policy is a standalone HTML file and is copied into Flutter's web output on
the next web build. Publishing source to GitHub does **not** deploy a website.
Do not use a repository source-view URL as the final Play privacy-policy URL.
Deploy the policy to a stable, public HTTPS page (for example Firebase Hosting
or a correctly configured GitHub Pages site), verify it works signed out and
on mobile without authentication, then enter that URL in Play Console.

The app's About/privacy dialog and camera page link to
https://itsjohn9-cell.github.io/sijda/privacy.html. The
[Pages workflow](../.github/workflows/privacy-pages.yml) deploys only the policy,
not the app, model or feedback data. Confirm the deployment works before
shipping future builds. Version 2 includes the link; version 1 was removed
from the release.

The public policy at https://itsjohn9-cell.github.io/sijda/privacy.html was
verified over HTTPS. Its URL was saved on Play Console's Privacy policy page;
Console confirmed "Change saved. Send for review in Publishing overview."
Publishing overview subsequently showed 13 changes sent for review, with quick
checks running before Google's review. Approval and tester availability remain
unverified. Managed publishing was off. Production was not changed.

The closed Alpha release is `0.1.1 (2) - closed camera testing`. Tester lists
are Closed testers, Fam and Testers. Countries are Pakistan, United Arab
Emirates, United Kingdom and United States. Listing text, original icon/feature
graphic and two mobile-sized app screenshots were saved. Store support email
was corrected and saved as fehmatics@gmail.com.

## Before closed-test rollout

- Review the privacy policy against the exact release binary and backend.
- Test front-camera permissions, low-light behavior, counts, lifecycle and
  brightness restoration on physical devices.
- Retain the Apache-2.0 license and model attribution in distributed builds.
- Build the intended release with an appropriate unused version code; do not
  mistake the existing version-1 draft for the latest source.
- Finalize title, descriptions, icon, feature graphic, screenshots and support
  contact in the listing. Do not claim validated or all-lighting accuracy.
- Complete target audience, ads declaration, content rating, app access,
  Data safety and any applicable health/other declarations based on actual use.
  Do not guess or certify legal declarations on the owner's behalf.
- Review anonymous authentication against Play's account/deletion questions;
  document the email deletion route and any additional required URL or flow.
- Configure countries, review selected tester lists and confirm policy status.
- Resolve feedback-abuse controls before wider/public use; anonymous Auth is
  not sufficient anti-abuse protection.
- Review remaining development-tool dependency advisories.
- Get explicit owner approval before review submission or rollout. No paid
  services without approval.

The owner must keep the public contact monitored and fulfill deletion requests,
including removal from owner-controlled analysis exports.
