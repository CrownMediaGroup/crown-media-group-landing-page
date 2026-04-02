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
 * Build a fully YouTube-optimized description from post metadata.
 * Structured for search, watch time, and channel growth.
 */
export function buildDescription(title, excerpt, slug, segments, tags = []) {
  // Hook — first 2 lines appear before "Show more" in mobile
  const hook = excerpt.length > 200 ? excerpt.slice(0, 197) + '...' : excerpt;

  // Timestamps — approximate based on segment count (~20s each)
  const timestamps = segments.map((s, i) => {
    const totalSec = i * 20;
    const min = Math.floor(totalSec / 60);
    const sec = String(totalSec % 60).padStart(2, '0');
    return `${min}:${sec} — ${s.text.slice(0, 60).replace(/\n/g, ' ')}...`;
  }).join('\n');

  // Keywords for search — pull from tags, add evergreen business terms
  const evergreen = ['small business marketing', 'marketing strategy', 'grow your business online', 'digital marketing tips', 'AI marketing tools'];
  const allKeywords = [...new Set([...tags.map(t => t.toLowerCase()), ...evergreen])].slice(0, 8);
  const keywordLine = allKeywords.join(' | ');

  // Hashtags — max 3 visible in feed, rest still indexed
  const hashtagBase = tags.slice(0, 5).map(t => '#' + t.replace(/\s+/g, '')).join(' ');
  const hashtagExtra = '#Marketing #AIMarketing #SmallBusiness #Entrepreneur #DigitalMarketing #BusinessGrowth #ContentMarketing #LocalBusiness';

  return `${hook}
📖 Read the full article → https://crownmediagroup.co/blog/${slug}/

⏱ CHAPTERS
${timestamps}

━━━━━━━━━━━━━━━━━━━━━━━━

WHAT YOU'LL LEARN:
• Why most small businesses are losing customers to competitors who use AI
• The exact systems Crown Media Group uses to get results in 30 days
• How to apply this to your business — starting today

━━━━━━━━━━━━━━━━━━━━━━━━
🚀 WORK WITH CROWN MEDIA GROUP
We build AI-powered marketing systems for business owners who are done wasting time on marketing that doesn't convert.

✅ Social media content — done for you
✅ Paid ads that actually generate ROI
✅ AI video content — like this video
✅ Full brand strategy + execution

📅 Book your FREE strategy session → https://calendly.com/crownmediagroupco
🌐 Website → https://crownmediagroup.co
📧 Email → king@crownmediagroup.co

━━━━━━━━━━━━━━━━━━━━━━━━
🔔 SUBSCRIBE for weekly videos on AI marketing, business growth, and building an agency from scratch — faith-driven, results-focused.

KEYWORDS: ${keywordLine}

${hashtagBase} ${hashtagExtra}`;
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
