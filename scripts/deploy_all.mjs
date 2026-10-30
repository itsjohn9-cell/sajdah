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
    console.log('🧪 [1/5] Running automated Node & Flutter regression tests...');
    execSync('npm test', { stdio: 'inherit' });
    execSync(`${flutterBin} test`, { stdio: 'inherit' });
    console.log('✔ All tests passed successfully!\n');
  } else {
    console.log('⏩ [1/5] Skipping tests (--skip-tests passed)...\n');
  }

  // Step 2: Build AAB and APK
  if (!skipBuild) {
    console.log('🔨 [2/5] Building Release App Bundle (AAB) & APK...');
    console.log('   -> Building AAB...');
    execSync(`${flutterBin} build appbundle --release --build-name=${versionName} --build-number=${versionCode}`, { stdio: 'inherit' });
    console.log('   -> Building APK...');
    execSync(`${flutterBin} build apk --release --build-name=${versionName} --build-number=${versionCode}`, { stdio: 'inherit' });
    console.log('✔ Builds complete!\n');
  } else {
    console.log('⏩ [2/5] Skipping build step (--skip-build passed)...\n');
  }

  // Step 3: Git Commit & Push to GitHub main branch
  console.log('🌿 [3/5] Synchronizing latest project updates to GitHub main branch...');
  try {
    const status = execSync('git status --porcelain').toString().trim();
    if (status) {
      console.log('   -> Staging and committing pending project changes...');
      execSync('git add -A', { stdio: 'inherit' });
      execSync(`git commit -m "release: Sajdah v${versionName} (Build ${versionCode})"`, { stdio: 'inherit' });
    }
    console.log('   -> Pushing to origin main...');
    execSync('git push origin main', { stdio: 'inherit' });
    console.log('✔ GitHub main branch is completely up to date!\n');
  } catch (gitErr) {
    console.warn('⚠️ Git push to main warning:', gitErr.message);
  }

  // Step 4: Google Play Console Release
  console.log('📱 [4/5] Uploading & Publishing to Google Play Console...');
  execSync('node scripts/publish_play_console.mjs', { stdio: 'inherit' });
  console.log('✔ Published to Google Play!\n');

  // Step 5: GitHub Releases Upload
  console.log('🐙 [5/5] Uploading APK to GitHub Releases...');
  execSync('node scripts/publish_github_release.mjs', { stdio: 'inherit' });
  console.log('✔ Uploaded APKs to GitHub Releases!\n');

  console.log('========================================================');
  console.log('🎉 UNIFIED DEPLOYMENT COMPLETED SUCCESSFULLY!           ');
  console.log('========================================================');
  console.log('📲 Google Play Track: Closed Testing (Alpha)');
  console.log(`🐙 GitHub Release   : https://github.com/itsjohn9-cell/sajdah/releases/tag/v${versionName}`);
  console.log('🌿 GitHub Main Code : https://github.com/itsjohn9-cell/sajdah/tree/main');
  console.log('⬇️ PERMANENT DIRECT APK DOWNLOAD LINK:');
  console.log('   https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sajdah-release.apk');
  console.log('========================================================\n');
} catch (error) {
  console.error('\n❌ Deployment interrupted:', error.message);
  process.exit(1);
}
