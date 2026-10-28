#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const pubspecPath = path.resolve('pubspec.yaml');
const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
const versionMatch = pubspecContent.match(/version:\s*([^\s+]+)(?:\+(\d+))?/);

if (!versionMatch) {
  console.error('❌ Could not parse version from pubspec.yaml');
  process.exit(1);
}

const versionName = versionMatch[1];
const versionCode = versionMatch[2] || '1';
const tag = `v${versionName}`;
const apkSource = path.resolve('build/app/outputs/flutter-apk/app-release.apk');
const apkDir = path.dirname(apkSource);

if (!fs.existsSync(apkSource)) {
  console.error(`❌ APK not found at: ${apkSource}\nRun 'flutter build apk --release' first.`);
  process.exit(1);
}

const sajdahReleaseApk = path.join(apkDir, 'sajdah-release.apk');
const sajdahVersionedApk = path.join(apkDir, `sajdah-${tag}.apk`);
const legacySijdaApk = path.join(apkDir, 'sijda-release.apk');

fs.copyFileSync(apkSource, sajdahReleaseApk);
fs.copyFileSync(apkSource, sajdahVersionedApk);
fs.copyFileSync(apkSource, legacySijdaApk);

console.log('====================================================');
console.log('       SAJDAH - GITHUB RELEASES AUTO-PUBLISHER      ');
console.log('====================================================');
console.log(`📦 Tag Name     : ${tag}`);
console.log(`🔢 Version Name : ${versionName} (Build ${versionCode})`);
console.log(`📁 Source APK   : ${apkSource}`);

try {
  // Check if release already exists
  let exists = false;
  try {
    execSync(`gh release view ${tag}`, { stdio: 'ignore' });
    exists = true;
  } catch (_) {
    exists = false;
  }

  const assets = `"${sajdahReleaseApk}" "${sajdahVersionedApk}" "${legacySijdaApk}"`;

  if (exists) {
    console.log(`ℹ Release ${tag} exists. Uploading/overwriting assets...`);
    execSync(`gh release upload ${tag} ${assets} --clobber`, { stdio: 'inherit' });
  } else {
    console.log(`🚀 Creating GitHub Release ${tag}...`);
    const notes = `### Sajdah ${tag} (Build ${versionCode})
- Automated Release with signed Android APK assets.
- Modernized Islamic theme, streamlined prostration detection & prayer progression flow.

### Direct Download Links:
- **[Download Latest Sajdah APK (Direct Link)](https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sajdah-release.apk)**
- **[Download Sajdah ${tag} APK](https://github.com/itsjohn9-cell/sajdah/releases/download/${tag}/sajdah-${tag}.apk)**
- *(Legacy download link: [sijda-release.apk](https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sijda-release.apk))*`;

    execSync(
      `gh release create ${tag} ${assets} --title "Sajdah ${tag} (Build ${versionCode})" --notes "${notes}" --latest`,
      { stdio: 'inherit' }
    );
  }

  console.log('====================================================');
  console.log('🎉 SUCCESSFULLY PUBLISHED TO GITHUB RELEASES!       ');
  console.log('====================================================');
  console.log(`🌐 Release Page : https://github.com/itsjohn9-cell/sajdah/releases/tag/${tag}`);
  console.log(`⬇ Permanent Link: https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sajdah-release.apk`);
  console.log(`⬇ Version Link  : https://github.com/itsjohn9-cell/sajdah/releases/download/${tag}/sajdah-${tag}.apk`);
  console.log('====================================================\n');
} catch (err) {
  console.error('❌ Failed to publish release to GitHub:', err.message);
  process.exit(1);
}
