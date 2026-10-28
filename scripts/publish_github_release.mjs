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

const releaseApk = path.join(apkDir, 'sijda-release.apk');
const versionedApk = path.join(apkDir, `sijda-${tag}.apk`);

fs.copyFileSync(apkSource, releaseApk);
fs.copyFileSync(apkSource, versionedApk);

console.log('====================================================');
console.log('       SIJDA - GITHUB RELEASES AUTO-PUBLISHER        ');
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

  if (exists) {
    console.log(`ℹ Release ${tag} exists. Uploading/overwriting assets...`);
    execSync(`gh release upload ${tag} "${releaseApk}" "${versionedApk}" --clobber`, { stdio: 'inherit' });
  } else {
    console.log(`🚀 Creating GitHub Release ${tag}...`);
    const notes = `### Sijda ${tag} (Build ${versionCode})
- Automated Release with signed Android APK assets.

### Direct Download Links:
- **[Download Latest APK (Direct Link)](https://github.com/itsjohn9-cell/sijda/releases/latest/download/sijda-release.apk)**
- **[Download Sijda ${tag} APK](https://github.com/itsjohn9-cell/sijda/releases/download/${tag}/sijda-${tag}.apk)**`;

    execSync(
      `gh release create ${tag} "${releaseApk}" "${versionedApk}" --title "Sijda ${tag} (Build ${versionCode})" --notes "${notes}" --latest`,
      { stdio: 'inherit' }
    );
  }

  console.log('====================================================');
  console.log('🎉 SUCCESSFULLY PUBLISHED TO GITHUB RELEASES!       ');
  console.log('====================================================');
  console.log(`🌐 Release Page : https://github.com/itsjohn9-cell/sijda/releases/tag/${tag}`);
  console.log(`⬇ Permanent Link: https://github.com/itsjohn9-cell/sijda/releases/latest/download/sijda-release.apk`);
  console.log(`⬇ Version Link  : https://github.com/itsjohn9-cell/sijda/releases/download/${tag}/sijda-${tag}.apk`);
  console.log('====================================================\n');
} catch (err) {
  console.error('❌ Failed to publish release to GitHub:', err.message);
  process.exit(1);
}
