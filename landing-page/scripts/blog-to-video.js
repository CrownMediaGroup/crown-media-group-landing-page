#!/usr/bin/env node
/**
 * blog-to-video.js — Main orchestrator for Blog → YouTube + Shorts pipeline
 *
 * Converts a blog post into:
 *   1. Full 16:9 YouTube video (2-3 min) with voiceover + AI backgrounds + captions
 *   2. 60-second 9:16 Short for Instagram Reels, TikTok, X
 *
 * Usage:
 *   node scripts/blog-to-video.js                          # auto-picks newest unprocessed post
 *   node scripts/blog-to-video.js --file 2026-04-01-*.md   # specific post
 *   node scripts/blog-to-video.js --dry-run                # show plan, no API calls
 *   node scripts/blog-to-video.js --unlisted               # upload as unlisted (testing)
 *   node scripts/blog-to-video.js --skip-upload            # render video but don't upload
 *   node scripts/blog-to-video.js --skip-social            # don't post short clips
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY           - Claude for script generation
 *   ELEVENLABS_API_KEY          - TTS voiceover
 *   RECRAFT_API_KEY             - Background images (optional — uses gradient fallback)
 *   YOUTUBE_SERVICE_ACCOUNT_JSON - Base64-encoded YouTube service account JSON
 *
 * Optional env vars:
 *   YOUTUBE_CHANNEL_ID          - For playlist assignment
 *   RESEND_API_KEY              - Failure email notifications
 *
 * Crown Media Group
 */

import { mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

import {
  loadEnv, findPost, loadVideoLog, saveVideoLog,
  slugFromFilename, notifyFailure, VIDEO_OUT, CONTENT_DIR
} from './video/utils.js';

import { generateScript }              from './video/script-generator.js';
import { generateTTS }                 from './video/tts-generator.js';
import { generateClips }               from './video/clip-generator.js';
import { assembleVideo, assembleShort } from './video/video-assembler.js';
import { uploadToYouTube, buildDescription } from './video/youtube-uploader.js';
import { uploadShortToDrive }               from './video/drive-uploader.js';
import { generateThumbnail }               from './video/thumbnail-generator.js';

loadEnv();

const DRY_RUN     = process.argv.includes('--dry-run');
const UNLISTED    = process.argv.includes('--unlisted');
const SKIP_UPLOAD = process.argv.includes('--skip-upload');
const SKIP_SOCIAL = process.argv.includes('--skip-social');
const fileIdx     = process.argv.indexOf('--file');
const FILE_ARG    = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Crown Media Group — Blog to Video Pipeline ===\n');

  // Ensure output dir exists
  mkdirSync(VIDEO_OUT, { recursive: true });

  // Find post to process
  const post = findPost(FILE_ARG);
  if (!post) {
    console.log('All posts already processed. Nothing to do.');
    return;
  }

  const { filename, path: postPath } = post;
  const slug = slugFromFilename(filename);
  console.log(`Processing: ${filename}`);
  console.log(`Slug: ${slug}\n`);

  // Parse frontmatter
  const raw    = readFileSync(postPath, 'utf8');
  const fm     = parseFrontmatter(raw);
  const title  = fm.title  || 'Marketing Tips for Columbia SC Businesses';
  const body   = fm._body  || raw;
  const category = fm.category || 'Marketing';
  const tags   = (fm.tags  || 'marketing,columbia sc,small business').split(',').map(t => t.trim());

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would generate video for: ${title}`);
    console.log(`Tags: ${tags.join(', ')}`);
    console.log(`Category: ${category}`);
    return;
  }

  const log = loadVideoLog();
  if (log[slug]?.youtube) {
    console.log(`Already processed: ${log[slug].youtube}`);
    return;
  }

  // ── Step 1: Generate voiceover script ────────────────────────────────────────
  console.log('Step 1/6: Generating voiceover script...');
  let script;
  try {
    script = await generateScript(title, body, category);
    console.log(`  Script: ${script.segments.length} segments, ~${script.estimatedDuration}s`);
  } catch (err) {
    await notifyFailure('script-generator', err);
    throw err;
  }

  // ── Step 2: Generate TTS audio ───────────────────────────────────────────────
  console.log('Step 2/6: Generating voiceover audio (ElevenLabs)...');
  let tts;
  try {
    tts = await generateTTS(script.fullText, slug);
    console.log(`  Audio: ${tts.duration.toFixed(1)}s`);
  } catch (err) {
    await notifyFailure('tts-generator', err);
    throw err;
  }

  // ── Step 3: Generate video clips or background frames ───────────────────────
  const falKey = process.env.FAL_KEY;
  const stepLabel = falKey ? 'motion video clips (Fal.ai)' : 'background images (Recraft)';
  console.log(`Step 3/6: Generating ${stepLabel}...`);
  let clips16x9, clipMode;
  try {
    const result = await generateClips(script.segments, slug, '16:9');
    clips16x9 = result.paths;
    clipMode  = result.mode;
  } catch (err) {
    await notifyFailure('clip-generator', err);
    throw err;
  }

  // ── Step 4: Assemble full YouTube video ──────────────────────────────────────
  console.log('Step 4/6: Assembling 16:9 YouTube video (FFmpeg)...');
  let fullVideoPath;
  try {
    fullVideoPath = await assembleVideo(script.segments, clips16x9, tts.mp3Path, title, slug, tts.duration, clipMode);
  } catch (err) {
    await notifyFailure('video-assembler-16x9', err);
    throw err;
  }

  // ── Step 5: Assemble 9:16 Short ──────────────────────────────────────────────
  console.log('Step 5/6: Creating 60-second Short (9:16)...');
  let shortPath;
  try {
    shortPath = await assembleShort(fullVideoPath, slug);
  } catch (err) {
    await notifyFailure('video-assembler-short', err);
    throw err;
  }

  // ── Step 6: Generate thumbnail + Upload to YouTube ───────────────────────────
  let youtubeUrl = null;
  if (!SKIP_UPLOAD) {
    console.log('Step 6/6: Generating thumbnail + uploading to YouTube...');
    try {
      const videoTitle  = script.suggestedTitle || title;
      const description = buildDescription(videoTitle, fm._excerpt || '', slug, script.segments, script.suggestedTags || tags);
      const ytTags      = [...(script.suggestedTags || tags), 'small business', 'marketing agency', 'Crown Media Group', 'AI marketing', 'entrepreneur'];
      console.log(`  Title: "${videoTitle}"`);
      console.log(`  Search angle: ${script.searchAngle || 'n/a'}`);

      // Generate branded thumbnail
      let thumbnailPath = null;
      try {
        const subtitle = script.searchAngle || script.suggestedTags?.[0] || '';
        thumbnailPath = await generateThumbnail(videoTitle, slug, category, subtitle);
      } catch (thumbErr) {
        console.warn(`  [Thumbnail] Generation failed: ${thumbErr.message} — uploading without custom thumbnail`);
      }

      youtubeUrl = await uploadToYouTube({
        videoPath:   fullVideoPath,
        title:       videoTitle,
        description,
        tags:        ytTags,
        unlisted:    UNLISTED,
        thumbnailPath,
      });
    } catch (err) {
      await notifyFailure('youtube-uploader', err);
      console.warn(`  [YouTube] Upload failed: ${err.message} — video saved locally at ${fullVideoPath}`);
    }
  } else {
    console.log('Step 6/6: Skipping upload (--skip-upload)');
  }

  // ── Step 7: Upload Short to Google Drive (ready-to-post folder) ─────────────
  // Social auto-posting disabled — King uploads manually from Google Drive
  const socialResults = {};
  let driveUrl = null;
  if (shortPath) {
    console.log('\nStep 7: Uploading Short to Google Drive (ready-to-post)...');
    try {
      driveUrl = await uploadShortToDrive(shortPath, title, slug);
      socialResults.googleDrive = driveUrl;
      console.log(`  [Drive] Uploaded → ${driveUrl}`);
    } catch (err) {
      console.warn(`  [Drive] Upload failed: ${err.message} — Short saved locally at ${shortPath}`);
      socialResults.googleDrive = 'error: ' + err.message;
    }
  }

  // ── Save log ──────────────────────────────────────────────────────────────────
  const updatedLog = loadVideoLog();
  updatedLog[slug] = {
    youtube:       youtubeUrl || null,
    fullVideo:     fullVideoPath,
    short:         shortPath,
    socialPosted:  socialResults,
    processedAt:   new Date().toISOString(),
    title,
  };
  saveVideoLog(updatedLog);

  console.log('\n=== Pipeline Complete ===');
  if (youtubeUrl)  console.log(`YouTube:     ${youtubeUrl}`);
  if (driveUrl)    console.log(`Drive Short: ${driveUrl}  ← upload to IG/TikTok/Reels`);
  console.log(`Full video:  ${fullVideoPath}`);
  console.log(`Short:       ${shortPath}`);
}

// ── Inline parseFrontmatter (avoids circular import) ─────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  match[1].split('\n').forEach(line => {
    const eq = line.indexOf(':');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    fm[key] = val;
  });
  const body = content.slice(match[0].length).trim();
  fm._body    = body;
  fm._excerpt = body.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && l.length > 40) || '';
  return fm;
}

function buildSocialCaption(title, youtubeUrl, tags) {
  const tag1 = '#ColumbiaScBusiness';
  const tag2 = '#AIMarketing';
  const ytLine = youtubeUrl ? `\nWatch the full video → ${youtubeUrl}` : '';
  return `${title}${ytLine}\n\n${tag1} ${tag2} #CrownMediaGroup`;
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
