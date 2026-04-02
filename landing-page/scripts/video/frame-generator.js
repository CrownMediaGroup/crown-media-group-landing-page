/**
 * video/frame-generator.js — Generate background images via Recraft AI
 * Creates 16:9 and 9:16 cinematic backgrounds for each video segment.
 * Crown Media Group
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { loadEnv, VIDEO_OUT } from './utils.js';

loadEnv();

const RECRAFT_URL   = 'https://external.api.recraft.ai/v1/images/generations';
const STYLE_SUFFIX  = 'cinematic heavenly aesthetic, ethereal divine light rays, volumetric god rays breaking through clouds, golden warm glow, deep royal navy and gold color palette, photorealistic 8K, shallow depth of field, cinematic color grade, no text, no watermark, faith-inspired visual, angelic atmosphere, luminous particles, spiritual elevation, aspirational and transcendent mood';

/**
 * Generate background images for each segment.
 * @param {Array<{id, visualCue, duration}>} segments - Script segments
 * @param {string} slug - Post slug
 * @param {string} aspectRatio - '16:9' or '9:16'
 * @returns {Promise<string[]>} - Array of local image file paths
 */
export async function generateFrames(segments, slug, aspectRatio = '16:9') {
  const apiKey = process.env.RECRAFT_API_KEY;
  const suffix  = aspectRatio === '9:16' ? '-short' : '';
  const size    = aspectRatio === '9:16' ? '1024x1820' : '1820x1024';

  const framePaths = [];

  for (let i = 0; i < segments.length; i++) {
    const seg      = segments[i];
    const filename = `${slug}-frame-${i + 1}${suffix}.png`;
    const outPath  = join(VIDEO_OUT, filename);

    // Skip if cached
    if (existsSync(outPath)) {
      console.log(`  [Frames] Cached: ${filename}`);
      framePaths.push(outPath);
      continue;
    }

    const prompt = `${seg.visualCue}, entrepreneur, business owner, marketing agency, ${STYLE_SUFFIX}`;

    if (apiKey) {
      try {
        console.log(`  [Frames] Generating ${aspectRatio} frame ${i + 1}/${segments.length}...`);
        const response = await axios.post(
          RECRAFT_URL,
          { prompt, style: 'realistic_image', size, n: 1 },
          { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        const imageUrl = response.data?.data?.[0]?.url;
        if (imageUrl) {
          const imgResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
          writeFileSync(outPath, imgResponse.data);
          framePaths.push(outPath);
          continue;
        }
      } catch (err) {
        console.warn(`  [Frames] Recraft failed for segment ${i + 1}: ${err.message} — using gradient fallback`);
      }
    }

    // Fallback: create a solid branded gradient PNG using raw pixel data
    const fallbackPath = await createGradientFrame(outPath, aspectRatio);
    framePaths.push(fallbackPath);
  }

  return framePaths;
}

/**
 * Create a branded gradient PNG as fallback when Recraft is unavailable.
 * Uses a minimal PPM-to-PNG conversion via FFmpeg.
 */
async function createGradientFrame(outPath, aspectRatio) {
  const { execSync } = await import('child_process');
  const ffmpeg = getFfmpegPath();
  const w = aspectRatio === '9:16' ? 1080 : 1920;
  const h = aspectRatio === '9:16' ? 1920 : 1080;

  try {
    execSync(
      `"${ffmpeg}" -y -f lavfi -i "color=c=0x1A1A3E:s=${w}x${h}" -frames:v 1 "${outPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    // Last resort: create minimal valid PNG (1x1 navy pixel, scaled by FFmpeg during assembly)
    execSync(`"${ffmpeg}" -y -f lavfi -i "color=c=#1A1A3E:s=2x2" -frames:v 1 "${outPath}"`, { stdio: 'pipe' });
  }
  return outPath;
}

function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (process.platform === 'linux') return 'ffmpeg';
  const winPath = 'C:\\Users\\ldavi\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe';
  return existsSync(winPath) ? winPath : 'ffmpeg';
}
