/**
 * youtube-uploader.js — Upload video to YouTube using Data API v3
 * Uses service account credentials stored as YOUTUBE_SERVICE_ACCOUNT_JSON (base64)
 * Crown Media Group
 */

import { createReadStream, statSync } from 'fs';
import { google } from 'googleapis';
import { loadEnv } from './utils.js';

loadEnv();

/**
 * Upload a video to YouTube.
 * @param {Object} opts
 * @param {string} opts.videoPath - Local path to MP4
 * @param {string} opts.title - Video title (max 100 chars)
 * @param {string} opts.description - Full video description
 * @param {string[]} opts.tags - Array of tags
 * @param {boolean} opts.unlisted - true = unlisted (for testing), false = public
 * @returns {Promise<string>} - YouTube video URL
 */
export async function uploadToYouTube({ videoPath, title, description, tags, unlisted = false }) {
  const auth = getAuth();
  const youtube = google.youtube({ version: 'v3', auth });

  const fileSize = statSync(videoPath).size;
  console.log(`  [YouTube] Uploading ${(fileSize / 1024 / 1024).toFixed(1)}MB...`);

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title:       title.slice(0, 100),
        description: description.slice(0, 5000),
        tags:        tags.slice(0, 30),
        categoryId:  '27', // Education
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus:           unlisted ? 'unlisted' : 'public',
        selfDeclaredMadeForKids: false,
        madeForKids:             false,
      },
    },
    media: {
      mimeType: 'video/mp4',
      body:     createReadStream(videoPath),
    },
  });

  const videoId  = response.data.id;
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`  [YouTube] Uploaded → ${videoUrl}`);
  return videoUrl;
}

/**
 * Build the YouTube video description from post metadata.
 */
export function buildDescription(title, excerpt, slug, segments) {
  const segmentSummary = segments.map((s, i) => `${i + 1}. ${s.text.slice(0, 80)}...`).join('\n').slice(0, 800);

  return `${excerpt}

In this video:
${segmentSummary}

📖 Read the full article: ${`https://crownmediagroup.co/blog/${slug}/`}

—

Crown Media Group — AI-Powered Marketing Agency
Based in Columbia, SC | Serving local businesses ready to grow.
🌐 crownmediagroup.co
📧 king@crownmediagroup.co
📅 Book a free strategy session: https://calendly.com/crownmediagroupco

#Marketing #ColumbiaScBusiness #AIMarketing #SmallBusiness #DigitalMarketing`;
}

/**
 * Get authenticated Google auth client.
 * Supports:
 * 1. YOUTUBE_SERVICE_ACCOUNT_JSON env var (base64 encoded JSON)
 * 2. YOUTUBE_CREDENTIALS_PATH env var (path to credentials.json)
 */
function getAuth() {
  const b64 = process.env.YOUTUBE_SERVICE_ACCOUNT_JSON;
  if (b64) {
    const creds = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const auth  = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
    });
    return auth;
  }

  const credPath = process.env.YOUTUBE_CREDENTIALS_PATH;
  if (credPath) {
    return new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
    });
  }

  throw new Error('YouTube credentials missing. Set YOUTUBE_SERVICE_ACCOUNT_JSON or YOUTUBE_CREDENTIALS_PATH in .env');
}
