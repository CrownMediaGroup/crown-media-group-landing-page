/**
 * video/tts-generator.js — Convert voiceover script to MP3 using ElevenLabs
 * Uses Turbo v2.5 model — best quality/speed/cost balance for YouTube narration.
 * Crown Media Group
 */

import { ElevenLabsClient } from 'elevenlabs';
import { createWriteStream, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { loadEnv, VIDEO_OUT } from './utils.js';
import { Readable } from 'stream';

loadEnv();

// Brian — Deep, Resonant, Comforting — faith-aligned male voice
const VOICE_ID  = 'nPczCjzI2devNBz1zQrb';
const MODEL_ID  = 'eleven_turbo_v2_5';

/**
 * Generate MP3 from script text using ElevenLabs.
 * @param {string} text - Full voiceover text
 * @param {string} slug - Post slug (used for filename)
 * @returns {Promise<{mp3Path: string, duration: number}>}
 */
export async function generateTTS(text, slug) {
  const mp3Path = join(VIDEO_OUT, `${slug}-voiceover.mp3`);

  // Skip if already generated (resume capability)
  if (existsSync(mp3Path)) {
    console.log(`  [TTS] Using cached voiceover: ${mp3Path}`);
    return { mp3Path, duration: getAudioDuration(mp3Path) };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set');

  const client = new ElevenLabsClient({ apiKey });

  console.log(`  [TTS] Generating voiceover (${text.length} chars)...`);

  const audioStream = await client.textToSpeech.convert(VOICE_ID, {
    model_id:      MODEL_ID,
    text,
    output_format: 'mp3_44100_128',
    voice_settings: {
      stability:        0.5,
      similarity_boost: 0.75,
      style:            0.0,
      use_speaker_boost: true,
    },
  });

  // Write stream to file
  await new Promise((resolve, reject) => {
    const writeStream = createWriteStream(mp3Path);
    // audioStream might be a ReadableStream (web) or Node Readable
    const nodeStream = audioStream instanceof Readable
      ? audioStream
      : Readable.fromWeb(audioStream);
    nodeStream.pipe(writeStream);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    nodeStream.on('error', reject);
  });

  const duration = getAudioDuration(mp3Path);
  console.log(`  [TTS] Done — ${mp3Path} (${duration.toFixed(1)}s)`);
  return { mp3Path, duration };
}

/**
 * Get audio duration in seconds using ffprobe.
 */
function getAudioDuration(filePath) {
  try {
    const ffprobe = getFfprobePath();
    const result = execSync(
      `"${ffprobe}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(result) || 150;
  } catch {
    return 150; // fallback 2.5 min
  }
}

function getFfprobePath() {
  // GitHub Actions (ubuntu-latest)
  if (process.platform === 'linux') return 'ffprobe';
  // Windows WinGet install path
  const winPath = 'C:\\Users\\ldavi\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffprobe.exe';
  if (existsSync(winPath)) return winPath;
  return 'ffprobe';
}
