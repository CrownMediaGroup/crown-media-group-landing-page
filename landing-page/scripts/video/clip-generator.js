/**
 * clip-generator.js — Generate real motion video clips via Fal.ai (Kling)
 * Replaces still-image frame-generator with actual motion video per segment.
 * Falls back to Recraft still images if FAL_KEY is not set.
 * Crown Media Group
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createWriteStream } from 'fs';
import https from 'https';
import http from 'http';
import { loadEnv, VIDEO_OUT } from './utils.js';

loadEnv();

// Models ranked by quality/cost — first one with available key wins
const FAL_MODELS = {
  kling:   'fal-ai/kling-video/v1.6/standard/text-to-video',
  minimax: 'fal-ai/minimax/video-01-live',
  pika:    'fal-ai/pika/v2.2/text-to-video',
};

/**
 * Generate motion video clips for each segment.
 * @param {Array<{id, text, visualCue, duration}>} segments
 * @param {string} slug
 * @param {string} aspectRatio - '16:9' or '9:16'
 * @returns {Promise<{ paths: string[], mode: 'video'|'image' }>}
 */
export async function generateClips(segments, slug, aspectRatio = '16:9') {
  const falKey = process.env.FAL_KEY;
  const suffix = aspectRatio === '9:16' ? '-short' : '';

  if (!falKey) {
    console.log('  [Clips] FAL_KEY not set — falling back to Recraft still images');
    const { generateFrames } = await import('./frame-generator.js');
    const paths = await generateFrames(segments, slug, aspectRatio);
    return { paths, mode: 'image' };
  }

  const { fal } = await import('@fal-ai/client');
  fal.config({ credentials: falKey });

  const model = process.env.FAL_MODEL || FAL_MODELS.kling;
  const falAspect = aspectRatio === '9:16' ? '9:16' : '16:9';

  console.log(`  [Clips] Using ${model.split('/')[1]} via Fal.ai — ${aspectRatio}`);

  const clipPaths = [];

  for (let i = 0; i < segments.length; i++) {
    const seg      = segments[i];
    const filename = `${slug}-clip-${i + 1}${suffix}.mp4`;
    const outPath  = join(VIDEO_OUT, filename);

    if (existsSync(outPath)) {
      console.log(`  [Clips] Cached: ${filename}`);
      clipPaths.push(outPath);
      continue;
    }

    const prompt = buildPrompt(seg.visualCue, seg.text);
    console.log(`  [Clips] Generating clip ${i + 1}/${segments.length}: "${prompt.slice(0, 60)}..."`);

    try {
      const result = await fal.subscribe(model, {
        input: {
          prompt,
          aspect_ratio: falAspect,
          duration:     '5',
        },
        logs: false,
        onQueueUpdate: (update) => {
          if (update.status === 'IN_PROGRESS') process.stdout.write('.');
        },
      });
      process.stdout.write('\n');

      const videoUrl = result?.data?.video?.url || result?.data?.videos?.[0]?.url;
      if (!videoUrl) throw new Error('No video URL in Fal.ai response');

      await downloadFile(videoUrl, outPath);
      console.log(`  [Clips] Clip ${i + 1} saved`);
      clipPaths.push(outPath);

    } catch (err) {
      console.warn(`  [Clips] Fal.ai failed for segment ${i + 1}: ${err.message} — using gradient fallback`);
      const { createGradientClip } = await import('./frame-generator.js');
      const fallback = await makeFallbackClip(outPath, aspectRatio, seg.duration || 5);
      clipPaths.push(fallback);
    }
  }

  return { paths: clipPaths, mode: 'video' };
}

/**
 * Build a cinematic, business-focused prompt from the segment's visual cue.
 */
function buildPrompt(visualCue, text) {
  const businessContext = 'professional business setting, entrepreneur, marketing agency, dynamic motion, cinematic quality, no text overlay, no watermark, photorealistic';
  return `${visualCue}, ${businessContext}. Camera movement: slow push-in or pan. Mood: confident, modern, aspirational.`;
}

/**
 * Download a file from URL to local path.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file     = createWriteStream(destPath);
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

/**
 * Create a short video fallback clip using FFmpeg gradient when Fal.ai fails.
 */
async function makeFallbackClip(outPath, aspectRatio, duration = 5) {
  const { execSync } = await import('child_process');
  const w = aspectRatio === '9:16' ? 1080 : 1920;
  const h = aspectRatio === '9:16' ? 1920 : 1080;
  const ffmpegPath = getFfmpegPath();

  try {
    execSync(
      `"${ffmpegPath}" -y -f lavfi -i "color=c=0x1A1A3E:s=${w}x${h}:r=24" -t ${duration} -c:v libx264 -preset fast "${outPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // absolute last resort
    writeFileSync(outPath, Buffer.alloc(0));
  }
  return outPath;
}

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (process.platform === 'linux') return 'ffmpeg';
  const winPath = 'C:\\Users\\ldavi\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe';
  return existsSync(winPath) ? winPath : 'ffmpeg';
}
