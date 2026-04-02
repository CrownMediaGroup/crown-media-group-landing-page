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
export async function assembleVideo(segments, framePaths, mp3Path, title, slug, audioDuration = null, mode = 'image') {
  const outPath = join(VIDEO_OUT, `${slug}-youtube.mp4`);
  if (existsSync(outPath)) {
    console.log(`  [Video] Cached: ${slug}-youtube.mp4`);
    return outPath;
  }

  console.log(`  [Video] Assembling ${segments.length} segments → 16:9 MP4 (${mode} mode)...`);

  const totalDur   = audioDuration || segments.reduce((acc, s) => acc + (s.duration || 20), 0);
  const perSegment = Math.ceil(totalDur / segments.length) + 2;

  const concatFile = join(VIDEO_OUT, `${slug}-concat.txt`);

  if (mode === 'video') {
    // Concat video clips directly — loop each clip to fill its segment duration
    const concatLines = framePaths.map(p =>
      `file '${p.replace(/\\/g, '/')}'`
    ).join('\n');
    writeFileSync(concatFile, concatLines);
  } else {
    // Image mode — hold each frame for its segment duration
    const concatLines = segments.map((seg, i) =>
      `file '${framePaths[i].replace(/\\/g, '/')}'\nduration ${perSegment}`
    ).join('\n');
    writeFileSync(concatFile, concatLines + `\nfile '${framePaths[framePaths.length - 1].replace(/\\/g, '/')}'`);
  }

  // Build SRT captions
  let timeOffset = 0;
  const srtLines = segments.map((seg, i) => {
    const start = timeOffset;
    const end   = timeOffset + (seg.duration || 20);
    timeOffset  = end;
    const fmt = s => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
    };
    const text = seg.text.replace(/</g, '').replace(/>/g, '').replace(/&/g, 'and').trim();
    return `${i + 1}\n${fmt(start)} --> ${fmt(end)}\n${text}`;
  });
  writeFileSync(join(VIDEO_OUT, `${slug}.srt`), srtLines.join('\n\n'));

  const cmd = [
    ffmpeg(), '-y',
    '-f', 'concat', '-safe', '0',
    ...(mode === 'video' ? [] : []),
    '-i', concatFile,
    '-i', mp3Path,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1',
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
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
