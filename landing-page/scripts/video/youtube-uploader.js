/**
 * youtube-uploader.js — Upload video to YouTube using Data API v3
 * Uses OAuth2 credentials (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN)
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
export async function uploadToYouTube({ videoPath, title, description, tags, unlisted = false, thumbnailPath = null }) {
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

  // Upload custom thumbnail if provided
  if (thumbnailPath) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          mimeType: 'image/png',
          body:     createReadStream(thumbnailPath),
        },
      });
      console.log(`  [YouTube] Thumbnail set → ${thumbnailPath}`);
    } catch (err) {
      // Thumbnail upload requires verified channel — log but don't fail pipeline
      console.warn(`  [YouTube] Thumbnail upload skipped: ${err.message}`);
    }
  }

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

Crown Media Group — AI-Powered Marketing for Business Owners
We help entrepreneurs grow with AI content, paid ads, and brand strategy.
🌐 crownmediagroup.co
📧 king@crownmediagroup.co
📅 Free strategy session: https://calendly.com/crownmediagroupco

#Marketing #AIMarketing #SmallBusiness #DigitalMarketing #Entrepreneur`;
}

/**
 * Get authenticated Google auth client using OAuth2 refresh token.
 */
function getAuth() {
  const clientId     = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:3001/callback');
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }

  throw new Error('YouTube OAuth credentials missing. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in .env');
}
