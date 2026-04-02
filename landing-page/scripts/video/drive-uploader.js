/**
 * drive-uploader.js — Upload Shorts to Google Drive "Ready to Post" folder
 * Uses existing OAuth2 credentials (same ones used for YouTube).
 * Uploads to a shared folder so King can download + post to IG/TikTok/Reels manually.
 * Crown Media Group
 */

import { createReadStream, statSync } from 'fs';
import { google } from 'googleapis';
import { loadEnv } from './utils.js';

loadEnv();

const FOLDER_NAME = 'Crown Media — Ready to Post';

/**
 * Upload a Short video to Google Drive.
 * @param {string} videoPath - Local path to the Short MP4
 * @param {string} title - Video title
 * @param {string} slug - Post slug (used as filename)
 * @returns {Promise<string>} - Google Drive shareable link
 */
export async function uploadShortToDrive(videoPath, title, slug) {
  const auth  = getAuth();
  const drive = google.drive({ version: 'v3', auth });

  // Get or create the "Ready to Post" folder
  const folderId = await getOrCreateFolder(drive, FOLDER_NAME);

  const fileSize = statSync(videoPath).size;
  console.log(`  [Drive] Uploading ${(fileSize / 1024 / 1024).toFixed(1)}MB to "${FOLDER_NAME}"...`);

  const response = await drive.files.create({
    requestBody: {
      name:    `${slug}-short.mp4`,
      parents: [folderId],
      description: `${title} — Crown Media Group Short. Upload to IG Reels, TikTok, YouTube Shorts.`,
    },
    media: {
      mimeType: 'video/mp4',
      body:     createReadStream(videoPath),
    },
    fields: 'id, webViewLink',
  });

  const fileId  = response.data.id;
  const viewUrl = response.data.webViewLink;

  // Make it shareable with "anyone with link can view"
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return viewUrl;
}

/**
 * Get existing folder by name or create it if it doesn't exist.
 */
async function getOrCreateFolder(drive, name) {
  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  console.log(`  [Drive] Created folder: "${name}"`);
  return folder.data.id;
}

function getAuth() {
  const b64 = process.env.YOUTUBE_SERVICE_ACCOUNT_JSON;
  if (!b64) throw new Error('YOUTUBE_SERVICE_ACCOUNT_JSON not set');
  const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}
