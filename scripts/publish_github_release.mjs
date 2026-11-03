#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

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

const splitSources = new Map(
  ['arm64-v8a', 'armeabi-v7a', 'x86_64'].flatMap(abi => {
    const source = path.join(apkDir, `app-${abi}-release.apk`);
    return fs.existsSync(source) ? [[abi, source]] : [];
  }),
);
const defaultApkSource = splitSources.get('arm64-v8a') || apkSource;
const sajdahReleaseApk = path.join(apkDir, 'sajdah-release.apk');
const sajdahVersionedApk = path.join(apkDir, `sajdah-${tag}.apk`);
const universalReleaseApk = path.join(apkDir, 'sajdah-universal-release.apk');
const universalVersionedApk = path.join(apkDir, `sajdah-universal-${tag}.apk`);
const legacySijdaApk = path.join(apkDir, 'sijda-release.apk');

fs.copyFileSync(defaultApkSource, sajdahReleaseApk);
fs.copyFileSync(defaultApkSource, sajdahVersionedApk);
fs.copyFileSync(apkSource, universalReleaseApk);
fs.copyFileSync(apkSource, universalVersionedApk);
fs.copyFileSync(apkSource, legacySijdaApk);
const splitAssets = [];
for (const abi of ['arm64-v8a', 'armeabi-v7a', 'x86_64']) {
  const splitSource = splitSources.get(abi);
  if (!splitSource) continue;
  const splitAsset = path.join(apkDir, `sajdah-${tag}-${abi}.apk`);
  fs.copyFileSync(splitSource, splitAsset);
  splitAssets.push(splitAsset);
}

console.log('====================================================');
console.log('       SAJDAH - GITHUB RELEASES AUTO-PUBLISHER      ');
console.log('====================================================');
console.log(`📦 Tag Name     : ${tag}`);
console.log(`🔢 Version Name : ${versionName} (Build ${versionCode})`);
console.log(`📁 Default APK  : ${defaultApkSource}`);
console.log(`📁 Universal APK: ${apkSource}`);

try {
  // Check if release already exists
  let exists = false;
  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
    exists = true;
  } catch (_) {
    exists = false;
  }

  const assets = [sajdahReleaseApk, sajdahVersionedApk, legacySijdaApk, ...splitAssets];
  assets.push(universalReleaseApk, universalVersionedApk);

  if (exists) {
    console.log(`ℹ Release ${tag} exists. Uploading/overwriting assets...`);
    execFileSync('gh', ['release', 'upload', tag, ...assets, '--clobber'], { stdio: 'inherit' });
  } else {
    console.log(`🚀 Creating GitHub Release ${tag}...`);
    const splitLinks = splitAssets.map(asset => {
      const name = path.basename(asset);
      return `- [${name}](https://github.com/itsjohn9-cell/sajdah/releases/download/${tag}/${name})`;
    }).join('\n');
    const notes = `### Sajdah ${tag} (Build ${versionCode})
- Automated Release with signed Android APK assets.
- Experimental camera-required counting with available proximity, light, orientation, accelerometer and gyroscope assistance.
- Short recognition filters (200 ms raised posture; 400 ms sajdah), distinct sajdah release detection, and corrected restart handling.
- Results distinguish visually observed sequences from pair-based estimates and list unverified phases.
- Privacy/permission, backup-validation and concurrent-save safeguards.
- **Real-phone flat-mat counting accuracy is not yet verified. Review estimates and use manual counting when uncertain.**
- The default download is the smaller arm64 APK when available; other ABI-specific builds are listed below.

### Direct Download Links:
- **[Download Latest Sajdah APK (Direct Link)](https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sajdah-release.apk)**
- **[Download Sajdah ${tag} APK](https://github.com/itsjohn9-cell/sajdah/releases/download/${tag}/sajdah-${tag}.apk)**
- [Download universal APK](https://github.com/itsjohn9-cell/sajdah/releases/download/${tag}/sajdah-universal-${tag}.apk)
- ABI-specific APKs (smaller downloads):
${splitLinks || '- Not available for this release.'}
- *(Legacy download link: [sijda-release.apk](https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sijda-release.apk))*`;

    execFileSync(
      'gh',
      ['release', 'create', tag, ...assets, '--target', 'main', '--title', `Sajdah ${tag} (Build ${versionCode}) - Experimental counting`, '--notes', notes, '--latest'],
      { stdio: 'inherit' },
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
