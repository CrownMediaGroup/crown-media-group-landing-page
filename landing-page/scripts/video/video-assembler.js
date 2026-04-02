/**
 * video-assembler.js — Assemble segments into full MP4 + 60s Short using FFmpeg
 * Pass A: 16:9 full YouTube video (1920x1080)
 * Pass B: 9:16 60-second Short (1080x1920)
 * Crown Media Group
 */

import { spawnSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VIDEO_OUT } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_PATH = join(__dirname, '..', '..', '..', 'assets', 'fonts', 'Inter-Bold.ttf');
const LOGO_PATH = join(__dirname, '..', '..', 'logo.png');

function ffmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (process.platform === 'linux') return 'ffmpeg';
  const winPath = 'C:\\Users\\ldavi\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe';
  return existsSync(winPath) ? winPath : 'ffmpeg';
}

/**
 * Assemble the full 16:9 YouTube video.
 * @param {Array<{id, text, visualCue, duration}>} segments
 * @param {string[]} framePaths - background image paths per segment
 * @param {string} mp3Path - voiceover audio
 * @param {string} title - video title for intro card
 * @param {string} slug
 * @returns {Promise<string>} - path to output MP4
 */
export async function assembleVideo(segments, framePaths, mp3Path, title, slug) {
  const outPath = join(VIDEO_OUT, `${slug}-youtube.mp4`);
  if (existsSync(outPath)) {
    console.log(`  [Video] Cached: ${slug}-youtube.mp4`);
    return outPath;
  }

  console.log(`  [Video] Assembling ${segments.length} segments → 16:9 MP4...`);

  // Build concat file — each image held for its segment duration
  const concatLines = segments.map((seg, i) => {
    const dur = seg.duration || 20;
    return `file '${framePaths[i].replace(/\\/g, '/')}'\nduration ${dur}`;
  }).join('\n');
  // Add last frame once more (FFmpeg concat demuxer quirk)
  const concatContent = concatLines + `\nfile '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'`;
  const concatFile = join(VIDEO_OUT, `${slug}-concat.txt`);
  writeFileSync(concatFile, concatContent);

  // Build subtitle/drawtext filter — one drawtext per segment with time offsets
  let timeOffset = 0;
  const drawtextFilters = segments.map((seg, i) => {
    const start = timeOffset;
    const end   = timeOffset + (seg.duration || 20);
    timeOffset   = end;

    // Escape special characters for FFmpeg drawtext
    const text = seg.text
      .replace(/'/g, "\u2019")    // smart apostrophe
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .slice(0, 120);             // cap length

    // Word-wrap manually at ~40 chars
    const words   = text.split(' ');
    const lines   = [];
    let current   = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > 42) { lines.push(current.trim()); current = word; }
      else current = (current + ' ' + word).trim();
    }
    if (current) lines.push(current);
    const wrapped = lines.slice(0, 3).join('\n'); // max 3 lines

    const fontArg = existsSync(FONT_PATH) ? `:fontfile='${FONT_PATH.replace(/\\/g, '/').replace(/:/g, '\\:')}'` : '';

    return `drawtext=text='${wrapped}'${fontArg}:fontsize=44:fontcolor=white:` +
      `box=1:boxcolor=black@0.55:boxborderw=12:` +
      `x=(w-text_w)/2:y=h-text_h-80:` +
      `enable='between(t,${start},${end})':` +
      `alpha='if(lt(t,${start + 0.3}),(t-${start})/0.3,if(gt(t,${end - 0.3}),(${end}-t)/0.3,1))'`;
  }).join(',');

  // Crown Media Group watermark (bottom-right, low opacity)
  const watermarkFilter = existsSync(LOGO_PATH)
    ? `[base][wm]overlay=W-w-20:H-h-20:format=auto,`
    : '';

  // Full filter chain
  let filterChain;
  if (existsSync(LOGO_PATH)) {
    filterChain = `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1[base];` +
      `[1:v]scale=120:-1,format=rgba,colorchannelmixer=aa=0.25[wm];` +
      `${watermarkFilter}${drawtextFilters}[v]`;
  } else {
    filterChain = `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,${drawtextFilters}[v]`;
  }

  const inputs  = existsSync(LOGO_PATH) ? ['-i', LOGO_PATH] : [];
  const mapVideo = existsSync(LOGO_PATH) ? ['-map', '[v]'] : ['-map', '[v]'];

  const cmd = [
    ffmpeg(), '-y',
    '-f', 'concat', '-safe', '0', '-i', concatFile,
    ...inputs,
    '-i', mp3Path,
    '-filter_complex', filterChain,
    ...mapVideo,
    '-map', `${existsSync(LOGO_PATH) ? 2 : 1}:a`,
    '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
    '-profile:v', 'high', '-level', '4.1',
    '-c:a', 'aac', '-ar', '44100', '-b:a', '128k',
    '-movflags', '+faststart',
    '-shortest',
    outPath,
  ];

  console.log(`  [Video] Running FFmpeg (16:9)...`);
  const result = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed (16:9): ${result.stderr?.slice(-500) || 'unknown error'}`);
  }

  console.log(`  [Video] 16:9 done → ${outPath}`);
  return outPath;
}

/**
 * Create 60-second 9:16 Short by cropping and trimming the full video.
 */
export async function assembleShort(fullVideoPath, slug) {
  const shortPath = join(VIDEO_OUT, `${slug}-short.mp4`);
  if (existsSync(shortPath)) {
    console.log(`  [Video] Cached: ${slug}-short.mp4`);
    return shortPath;
  }

  console.log(`  [Video] Creating 9:16 Short (60s)...`);

  // Crop center column to 9:16 (1080x1920 from 1920x1080 source)
  // Then trim to 60 seconds
  const cmd = [
    ffmpeg(), '-y',
    '-i', fullVideoPath,
    '-t', '60',
    '-vf', 'crop=608:1080:656:0,scale=1080:1920,setsar=1',
    '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
    '-c:a', 'aac', '-ar', '44100', '-b:a', '128k',
    '-movflags', '+faststart',
    shortPath,
  ];

  const result = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`FFmpeg failed (Short): ${result.stderr?.slice(-500) || 'unknown error'}`);
  }

  console.log(`  [Video] Short done → ${shortPath}`);
  return shortPath;
}
