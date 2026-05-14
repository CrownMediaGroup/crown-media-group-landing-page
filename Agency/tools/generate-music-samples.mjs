#!/usr/bin/env node
// generate-music-samples.mjs — generate the 5 public preview tracks for /music.html
// via fal.ai Stable Audio. Output: landing-page/assets/music-samples/<filename>.mp3
//
// Usage: node Agency/tools/generate-music-samples.mjs

import { fal } from '@fal-ai/client';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: join(__dirname, '..', '..', '.env') });
dotenv({ path: join(__dirname, '..', '..', 'landing-page', '.env') });

if (!process.env.FAL_KEY) {
  console.error('FAL_KEY not set');
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY });

const OUT_DIR = join(__dirname, '..', '..', 'landing-page', 'assets', 'music-samples');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const SAMPLES = [
  {
    filename: 'cinematic-throne-ascending.mp3',
    prompt:   'epic cinematic orchestral score, slow build, soaring strings, taiko drums, triumphant brass crescendo, instrumental, no vocals, 90 BPM, film score style',
  },
  {
    filename: 'corporate-clean-stride.mp3',
    prompt:   'uplifting corporate background music, light acoustic guitar plucking, soft piano, simple percussion, hand claps, optimistic vibe, instrumental, no vocals, 100 BPM',
  },
  {
    filename: 'worship-sunday-morning.mp3',
    prompt:   'contemporary worship instrumental, warm piano arpeggios, soft synth pad, gentle build, hopeful and reverent, no vocals, 75 BPM',
  },
  {
    filename: 'lofi-study-hour.mp3',
    prompt:   'lo-fi hip hop, jazzy piano sample, warm bass, dusty drums, vinyl crackle, chill study vibe, instrumental, no vocals, 80 BPM',
  },
  {
    filename: 'hiphop-soul-sample.mp3',
    prompt:   'soulful hip hop instrumental, sampled vocal chops, warm bass, boom bap drums, classic Kanye-style soul sample production, no lyrics, 92 BPM',
  },
];

async function downloadToFile(url, filepath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buf);
  return buf.length;
}

async function generateOne(sample) {
  console.log(`\n[${sample.filename}] generating…`);
  console.log(`  prompt: ${sample.prompt.slice(0, 80)}…`);
  const start = Date.now();
  const result = await fal.subscribe('fal-ai/stable-audio', {
    input: {
      prompt:           sample.prompt,
      seconds_total:    30,
      steps:            100,
    },
    logs: false,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const audioUrl = result?.data?.audio_file?.url || result?.data?.audio?.url || result?.data?.url;
  if (!audioUrl) {
    console.error(`  [error] no audio URL in result:`, JSON.stringify(result?.data || result, null, 2).slice(0, 400));
    return false;
  }
  console.log(`  generated in ${elapsed}s — downloading…`);
  const out = join(OUT_DIR, sample.filename);
  const bytes = await downloadToFile(audioUrl, out);
  console.log(`  saved ${(bytes / 1024).toFixed(1)} KB → ${sample.filename}`);
  return true;
}

(async () => {
  console.log(`Generating ${SAMPLES.length} sample tracks via fal-ai/stable-audio`);
  console.log(`Output dir: ${OUT_DIR}`);
  let ok = 0, fail = 0;
  for (const sample of SAMPLES) {
    try {
      const success = await generateOne(sample);
      if (success) ok++; else fail++;
    } catch (e) {
      fail++;
      console.error(`  [error] ${sample.filename}: ${e.message}`);
    }
  }
  console.log(`\n=== DONE — ${ok}/${SAMPLES.length} generated, ${fail} failed ===`);
})();
