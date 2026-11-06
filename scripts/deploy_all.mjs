#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

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

const flutterBin = process.env.FLUTTER_BIN || 'flutter';

console.log('========================================================');
console.log('       🚀 SAJDAH ONE-CLICK UNIFIED DEPLOYMENT           ');
console.log('========================================================');
console.log(`📦 App Version   : ${versionName} (Build Code ${versionCode})`);
console.log(`🔨 Flutter Binary : ${flutterBin}`);
console.log('========================================================\n');

try {
  const status = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
  }).trim();
  if (status) {
    throw new Error(
      'Release deployment requires a clean working tree. Commit or stash changes first.',
    );
  }
  const branch = execFileSync('git', ['branch', '--show-current'], {
    encoding: 'utf8',
  }).trim();
  if (branch !== 'main') {
    throw new Error(`Release deployment must run from main; current branch is ${branch || '(detached)'}.`);
  }

  // Step 1: Run Tests
  if (!skipTests) {
    console.log('🧪 [1/5] Running automated Node & Flutter regression tests...');
    execFileSync('npm', ['test'], { stdio: 'inherit' });
    execFileSync(flutterBin, ['test'], { stdio: 'inherit' });
    console.log('✔ All tests passed successfully!\n');
  } else {
    console.log('⏩ [1/5] Skipping tests (--skip-tests passed)...\n');
  }

  // Step 2: Build AAB, APK, and Web
  if (!skipBuild) {
    console.log('🔨 [2/5] Building Release App Bundle (AAB), APK & Web App...');
    console.log('   -> Building AAB...');
    execFileSync(
      flutterBin,
      ['build', 'appbundle', '--release', `--build-name=${versionName}`, `--build-number=${versionCode}`],
      { stdio: 'inherit' },
    );
    console.log('   -> Building APK...');
    execFileSync(
      flutterBin,
      ['build', 'apk', '--release', `--build-name=${versionName}`, `--build-number=${versionCode}`],
      { stdio: 'inherit' },
    );
    console.log('   -> Building ABI-specific APKs...');
    execFileSync(
      flutterBin,
      ['build', 'apk', '--release', '--split-per-abi', `--build-name=${versionName}`, `--build-number=${versionCode}`],
      { stdio: 'inherit' },
    );
    console.log('   -> Building Web App...');
    execFileSync(
      flutterBin,
      ['build', 'web', '--release', '--base-href', '/sajdah/'],
      { stdio: 'inherit' },
    );
    console.log('✔ Builds complete!\n');
  } else {
    console.log('⏩ [2/5] Skipping build step (--skip-build passed)...\n');
  }

  // Step 3: Push only already-committed source; triggers GitHub Pages web deployment.
  console.log('🌿 [3/5] Synchronizing latest project updates to GitHub main branch...');
  console.log('   -> Pushing committed changes to origin/main (deploys web app to GitHub Pages)...');
  execFileSync('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
  console.log('✔ GitHub main branch is completely up to date & Web deployment triggered!\n');

  // Step 4: Google Play Console Release (Closed Testing + Internal Testing)
  console.log('📱 [4/5] Uploading & Publishing to Google Play Console (Closed + Internal tracks)...');
  execFileSync('node', ['scripts/publish_play_console.mjs', '--tracks=alpha,internal'], { stdio: 'inherit' });
  console.log('✔ Published to Google Play Closed (Alpha) and Internal tracks!\n');

  // Step 5: GitHub Releases Upload
  console.log('🐙 [5/5] Uploading APK to GitHub Releases...');
  execFileSync('node', ['scripts/publish_github_release.mjs'], { stdio: 'inherit' });
  console.log('✔ Uploaded APKs to GitHub Releases!\n');

  console.log('========================================================');
  console.log('🎉 UNIFIED DEPLOYMENT COMPLETED SUCCESSFULLY!           ');
  console.log('========================================================');
  console.log('📲 Google Play Tracks:');
  console.log('   - Internal Testing (Instant): https://play.google.com/apps/testing/app.sijda.sijda');
  console.log('   - Closed Testing (Alpha)   : In review / rolled out to closed group');
  console.log('🌐 Web App (GitHub Pages)    : https://itsjohn9-cell.github.io/sajdah/');
  console.log(`🐙 GitHub Release            : https://github.com/itsjohn9-cell/sajdah/releases/tag/v${versionName}`);
  console.log('🌿 GitHub Main Code          : https://github.com/itsjohn9-cell/sajdah/tree/main');
  console.log('⬇️ PERMANENT DIRECT APK DOWNLOAD LINK:');
  console.log('   https://github.com/itsjohn9-cell/sajdah/releases/latest/download/sajdah-release.apk');
  console.log('========================================================\n');
} catch (error) {
  console.error('\n❌ Deployment interrupted:', error.message);
  process.exit(1);
}
