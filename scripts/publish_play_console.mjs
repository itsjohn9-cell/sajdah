#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

const PACKAGE_NAME = 'app.sijda.sijda';
const DEFAULT_AAB_PATH = path.resolve('build/app/outputs/bundle/release/app-release.aab');

const POSSIBLE_KEY_PATHS = [
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY,
  path.resolve(process.env.HOME || '', '.config/sijda/play-service-account.json'),
  path.resolve(process.env.HOME || '', '.karachi-runner-keys/play-service-account.json'),
  path.resolve('play-service-account.json'),
  path.resolve('.play-service-account.json')
].filter(Boolean);

const args = process.argv.slice(2);
let tracks = ['alpha'];
let isDraft = false;
let aabPath = DEFAULT_AAB_PATH;

args.forEach(arg => {
  if (arg.startsWith('--tracks=')) tracks = arg.split('=')[1].split(',').map(t => t.trim()).filter(Boolean);
  else if (arg.startsWith('--track=')) tracks = arg.split('=')[1].split(',').map(t => t.trim()).filter(Boolean);
  else if (arg === '--draft') isDraft = true;
  else if (arg.startsWith('--aab=')) aabPath = path.resolve(arg.split('=')[1]);
});

console.log('====================================================');
console.log('       SIJDA - GOOGLE PLAY AUTO-PUBLISHER           ');
console.log('====================================================');
console.log(`📦 Package ID   : ${PACKAGE_NAME}`);
console.log(`🎯 Target Tracks: ${tracks.join(', ')} (${isDraft ? 'Draft' : 'Rollout Completed'})`);
console.log(`📁 Bundle Path  : ${aabPath}`);

let authClient = null;
let keyFileFound = null;

for (const candidate of POSSIBLE_KEY_PATHS) {
  if (fs.existsSync(candidate)) {
    keyFileFound = candidate;
    break;
  }
}

if (!keyFileFound && process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
  try {
    const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    const jsonStr = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const credentials = JSON.parse(jsonStr);
    authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher']
    });
    console.log('🔑 Authentication: Using GOOGLE_PLAY_SERVICE_ACCOUNT_JSON environment variable.');
  } catch (err) {
    console.error('❌ Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:', err.message);
  }
} else if (keyFileFound) {
  console.log(`🔑 Authentication: Using Service Account key from:\n   ${keyFileFound}`);
  authClient = new google.auth.GoogleAuth({
    keyFile: keyFileFound,
    scopes: ['https://www.googleapis.com/auth/androidpublisher']
  });
}

if (!authClient) {
  console.error('\n❌ Service Account key not found!');
  process.exit(1);
}

if (!fs.existsSync(aabPath)) {
  console.error(`\n❌ Android App Bundle (.aab) not found at:\n   ${aabPath}`);
  console.error('Run "flutter build appbundle --release" first to compile and sign the release bundle.\n');
  process.exit(1);
}

const fileSizeMb = (fs.statSync(aabPath).size / (1024 * 1024)).toFixed(2);
console.log(`📊 AAB File Size: ${fileSizeMb} MB`);

async function publish() {
  try {
    const play = google.androidpublisher({ version: 'v3', auth: authClient });

    console.log('\n🚀 [1/5] Starting Play Console Edit transaction...');
    const editRes = await play.edits.insert({
      packageName: PACKAGE_NAME
    });
    const editId = editRes.data.id;
    console.log(`✔ Edit Session Created: [${editId}]`);

    console.log(`🚀 [2/5] Uploading ${fileSizeMb} MB App Bundle to Play Console...`);
    const uploadRes = await play.edits.bundles.upload({
      packageName: PACKAGE_NAME,
      editId,
      media: {
        mimeType: 'application/octet-stream',
        body: fs.createReadStream(aabPath)
      }
    });

    const versionCode = uploadRes.data.versionCode;
    console.log(`✔ Upload complete! Version Code registered: ${versionCode}`);

    // Parse version from pubspec.yaml
    const pubspec = fs.readFileSync(path.resolve('pubspec.yaml'), 'utf8');
    const versionMatch = pubspec.match(/version:\s*([^\s+]+)/);
    const versionName = versionMatch ? versionMatch[1] : '0.1.3';

    console.log(`🚀 [3/5] Assigning Version Code ${versionCode} (${versionName}) to tracks: [${tracks.join(', ')}]...`);
    const releaseStatus = isDraft ? 'draft' : 'completed';
    const releaseNotes = [
      {
        language: 'en-US',
        text: 'Enhanced prostration tracking and prayer cycle resilience: recognizes close proximity and optical occlusion at the prostration spot, handles 2/3/4 rakat sequences and middle/final tashahhud smoothly, and eliminates false pauses during prayer.'
      }
    ];

    for (const t of tracks) {
      await play.edits.tracks.update({
        packageName: PACKAGE_NAME,
        editId,
        track: t,
        requestBody: {
          track: t,
          releases: [
            {
              name: `${versionName} (${versionCode})`,
              versionCodes: [versionCode.toString()],
              status: releaseStatus,
              releaseNotes
            }
          ]
        }
      });
      console.log(`✔ Release assigned to [${t}] track with status: ${releaseStatus}`);
    }

    console.log('🚀 [4/5] Validating Edit transaction with Google Play...');
    await play.edits.validate({
      packageName: PACKAGE_NAME,
      editId
    });
    console.log('✔ Play Console validation passed! Zero errors.');

    console.log('🚀 [5/5] Committing release to Google Play...');
    await play.edits.commit({
      packageName: PACKAGE_NAME,
      editId
    });

    console.log('====================================================');
    console.log('🎉 SUCCESSFULLY PUBLISHED TO GOOGLE PLAY CONSOLE!   ');
    console.log('====================================================');
    console.log(`App Name    : Sijda`);
    console.log(`Package ID  : ${PACKAGE_NAME}`);
    console.log(`Track       : ${tracks.join(', ').toUpperCase()}`);
    console.log(`Status      : ${releaseStatus.toUpperCase()}`);
    console.log(`Console URL : https://play.google.com/console/u/0/developers/app/releases/overview?appId=${PACKAGE_NAME}`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ Google Play Publish Failed:');
    const errObj = error.response?.data?.error || error;
    if (error.response?.data?.error) {
      console.error(JSON.stringify(error.response.data.error, null, 2));
    } else {
      console.error(error.message || error);
    }

    const msg = String(errObj.message || '');
    if (errObj.code === 403 || errObj.status === 'PERMISSION_DENIED') {
      console.log('\n💡 [Service Account Permission Needed for Sijda]:');
      console.log('The service account is authenticated, but needs app permissions for "Sijda" in Play Console:');
      console.log('1. Open: https://play.google.com/console');
      console.log('2. In the left sidebar, click "Users and permissions".');
      console.log('3. Find or click on: play-publisher@nimble-button-394.iam.gserviceaccount.com');
      console.log('4. Under "App permissions", click "Add app" and choose "Sijda" (app.sijda.sijda).');
      console.log('5. Check permissions for Releases (e.g. "Manage testing tracks", "Create and edit releases").');
      console.log('6. Click "Apply" and "Save changes".');
      console.log('7. Re-run: npm run publish:play\n');
    }
    process.exit(1);
  }
}

publish();

