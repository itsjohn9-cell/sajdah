# Sajdah Project Guidelines & Automation Rules

## Core Directives

### 1. Go Live Directive
Whenever the user says **"go live"** (or asks to deploy/release the app):
- Always execute the full unified deployment pipeline:
  `npm run deploy` (or `npm run go-live`)
- The pipeline MUST ALWAYS publish to all three release targets:
  1. **Web App**: Built via Flutter Web and published to GitHub Pages (`https://itsjohn9-cell.github.io/sajdah/`).
  2. **Google Play Internal Testing (`internal`)**: Zero-delay instant distribution to internal testers without Google review wait times.
  3. **Google Play Closed Testing (`alpha`)**: Published to the closed testing group for review and rollout.
  4. **GitHub Releases**: Tagged release with standalone APKs (`sajdah-release.apk`).

### 2. Versioning & Quality Gates
- Every release must bump both the version name and build code in `pubspec.yaml` and `lib/src/app.dart`.
- The automated regression test suites (`npm test` and `flutter test`) must pass cleanly before any build artifact is published.
