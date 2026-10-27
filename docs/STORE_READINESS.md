# Sijda store readiness

Publisher: **MJ.**
Public support/privacy/deletion email: **fehmatics@gmail.com**
Android package: `app.sijda.sijda`

## Required files and current state

| Item | Location | State |
|---|---|---|
| Public privacy-policy page | [web/privacy.html](../web/privacy.html) | Written; stable public hosting and Play URL entry still pending |
| Data safety preparation | [DATA_SAFETY.md](DATA_SAFETY.md) | Worksheet only; owner must verify live Console answers |
| Device tests and release gates | [test/README.md](../test/README.md) | Automated coverage; physical-device verification pending |
| Third-party runtime license and model notes | [attribution](../web/vendor/mediapipe/ATTRIBUTION.md) | Runtime license included; model redistribution terms unresolved |
| Setup and feature limitations | [README](../README.md) | Includes model download/checksum instructions |
| Signed AAB | Local `build/app/outputs/bundle/release/app-release.aab` | Version 1 uploaded as a draft; predates low-light additions |
| Latest signed installable APK | Local `build/app/outputs/flutter-apk/app-release.apk` | Low-light build for device testing; not committed |

## Privacy-policy hosting

The policy is a standalone HTML file and is copied into Flutter's web output on
the next web build. Publishing source to GitHub does **not** deploy a website.
Do not use a repository source-view URL as the final Play privacy-policy URL.
Deploy the policy to a stable, public HTTPS page (for example Firebase Hosting
or a correctly configured GitHub Pages site), verify it works signed out and
on mobile without authentication, then enter that URL in Play Console.

The policy must also be reachable from the app/store listing. The current app
has privacy information but does not yet link to a final hosted policy.
Adding the hosted link requires a new build. Hosting, Console submission and
rollout are not performed by this documentation change.

## Before closed-test rollout

- Review the privacy policy against the exact release binary and backend.
- Test front-camera permissions, low-light behavior, counts, lifecycle and
  brightness restoration on physical devices.
- Confirm model redistribution rights before distributing bundled weights.
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
