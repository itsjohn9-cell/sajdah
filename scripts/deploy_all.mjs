#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const skipTests = args.includes('--skip-tests');

const pubspecPath = path.resolve('pubspec.yaml');
const pubspecContent = fs.readFileSync(pubspecPath, 'utf8');
const versionMatch = pubspecContent.match(/version:\s*([^\s+]+)(?:\+(\d+))?/);

if (!versionMatch) {
  console.error('❌ Could not parse version from pubspec.yaml');
  process.exit(1);
}

const versionName = versionMatch[1];
const versionCode = versionMatch[2] || '1';

const flutterCandidates = [
  process.env.FLUTTER_BIN,
  '/Users/mohammadjhone/Projects/flutter-sdk/bin/flutter',
  path.resolve(process.env.HOME || '', 'Projects/flutter-sdk/bin/flutter'),
  'flutter'
].filter(Boolean);

let flutterBin = 'flutter';
for (const cand of flutterCandidates) {
  if (fs.existsSync(cand)) {
    flutterBin = cand;
    break;
  }
}

console.log('========================================================');
console.log('       🚀 SAJDAH ONE-CLICK UNIFIED DEPLOYMENT           ');
console.log('========================================================');
console.log(`📦 App Version   : ${versionName} (Build Code ${versionCode})`);
console.log(`🔨 Flutter Binary : ${flutterBin}`);
console.log('========================================================\n');

try {
  // Step 1: Run Tests
  if (!skipTests) {
    console.log('🧪 [1/4] Running automated Node & Flutter regression tests...');
    execSync('npm test', { stdio: 'inherit' });
    execSync(`${flutterBin} test`, { stdio: 'inherit' });
    console.log('✔ All tests passed successfully!\n');
  } else {
    console.log('⏩ [1/4] Skipping tests (--skip-tests passed)...\n');
  }

  // Step 2: Build AAB and APK
  if (!skipBuild) {
    console.log('🔨 [2/4] Building Release App Bundle (AAB) & APK...');
    console.log('   -> Building AAB...');
    execSync(`${flutterBin} build appbundle --release --build-name=${versionName} --build-number=${versionCode}`, { stdio: 'inherit' });
    console.log('   -> Building APK...');
    execSync(`${flutterBin} build apk --release --build-name=${versionName} --build-number=${versionCode}`, { stdio: 'inherit' });
    console.log('✔ Builds complete!\n');
  } else {
    console.log('⏩ [2/4] Skipping build step (--skip-build passed)...\n');
  }

  // Step 3: Google Play Console Release
  console.log('📱 [3/4] Uploading & Publishing to Google Play Console...');
  execSync('node scripts/publish_play_console.mjs', { stdio: 'inherit' });
  console.log('✔ Published to Google Play!\n');

  // Step 4: GitHub Releases Upload
  console.log('🐙 [4/4] Uploading APK to GitHub Releases...');
  execSync('node scripts/publish_github_release.mjs', { stdio: 'inherit' });

  console.log('\n========================================================');
  console.log('🎉 UNIFIED DEPLOYMENT COMPLETED SUCCESSFULLY!           ');
  console.log('========================================================');
  console.log('📲 Google Play Track: Closed Testing (Alpha)');
  console.log(`🐙 GitHub Release   : https://github.com/itsjohn9-cell/sajdah/releases/tag/v${versionName}`);
  console.log('⬇️ PERMANENT DIRECT APK DOWNLOAD LINK:');
  console.log('   https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sajdah-release.apk');
  console.log('========================================================\n');
} catch (error) {
  console.error('\n❌ Deployment interrupted:', error.message);
  process.exit(1);
}
