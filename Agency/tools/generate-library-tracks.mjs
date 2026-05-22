#!/usr/bin/env node
// generate-library-tracks.mjs — generate the NEXT 20 catalog tracks for Kingdom Sound.
// Builds on generate-music-samples.mjs (which produced the 5 public previews).
// These 20 are catalog tracks intended for upload to the kingdom-sound bucket
// once King runs the migrations + bucket creation.
//
// Genres covered (4 tracks each = 20 total):
//   Cinematic, Corporate, Worship, Lo-Fi, Hip-Hop
//
// Output: Agency/ops/music/library/<genre>-<slug>.mp3
//
// Usage: node Agency/tools/generate-library-tracks.mjs

import { fal } from '@fal-ai/client';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: join(__dirname, '..', '..', '.env') });
dotenv({ path: join(__dirname, '..', '..', 'landing-page', '.env') });

if (!process.env.FAL_KEY) { console.error('FAL_KEY not set'); process.exit(1); }
fal.config({ credentials: process.env.FAL_KEY });

const OUT_DIR = join(__dirname, '..', 'ops', 'music', 'library');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Catalog tracks — modeled on Agency/ops/music/100-track-seed-prompts.md
const TRACKS = [
  // Cinematic (4)
  { filename: 'cinematic-02-quiet-before.mp3',       prompt: 'instrumental cinematic, sparse piano, low cello drone, gentle build, contemplative film score, no vocals, 70 BPM' },
  { filename: 'cinematic-03-lions-pace.mp3',         prompt: 'instrumental cinematic action score, driving percussion, brass stabs, urgent strings, no vocals, 130 BPM' },
  { filename: 'cinematic-04-glory-march.mp3',        prompt: 'instrumental cinematic orchestral, regal brass, marching snare, choir pad, anthemic, no vocals, 110 BPM' },
  { filename: 'cinematic-05-heavens-edge.mp3',       prompt: 'instrumental cinematic ambient, ethereal pad, female choir vowels, soft piano motif, no lyrics, 80 BPM' },

  // Corporate (4)
  { filename: 'corporate-02-morning-office.mp3',     prompt: 'instrumental corporate ambient, light marimba, soft synth pad, gentle hi-hat, calm productivity vibe, no vocals, 95 BPM' },
  { filename: 'corporate-03-slide-deck.mp3',         prompt: 'instrumental corporate, minimal piano motif, soft strings underneath, neutral professional, no vocals, 90 BPM' },
  { filename: 'corporate-04-forward.mp3',            prompt: 'instrumental corporate uplifting, acoustic guitar, light kick drum, hand claps, optimistic resolution, no vocals, 110 BPM' },
  { filename: 'corporate-05-the-pitch.mp3',          prompt: 'instrumental corporate, light piano arpeggios, building synth, modern startup vibe, no vocals, 105 BPM' },

  // Worship (4)
  { filename: 'worship-02-open-hands.mp3',           prompt: 'instrumental worship ballad, piano arpeggios, swelling strings, devotional mood, no vocals, 70 BPM' },
  { filename: 'worship-03-the-call.mp3',             prompt: 'instrumental gospel uplifting, organ, light drums, soulful piano, joyful build, no vocals, 95 BPM' },
  { filename: 'worship-04-sanctuary-light.mp3',      prompt: 'instrumental contemporary worship, piano and acoustic guitar, ambient pad, reflective, no vocals, 72 BPM' },
  { filename: 'worship-05-resurrection.mp3',         prompt: 'instrumental worship anthem, piano build, soaring strings, anthemic crescendo, no vocals, 80 BPM' },

  // Lo-Fi (4)
  { filename: 'lofi-02-tape-loop.mp3',               prompt: 'instrumental lo-fi chillhop, soft electric piano, gentle bass, brush drums, mellow, no vocals, 75 BPM' },
  { filename: 'lofi-03-after-hours.mp3',             prompt: 'instrumental lo-fi jazzy, smooth saxophone sample, warm Rhodes, light drums, vintage feel, no vocals, 78 BPM' },
  { filename: 'lofi-04-slow-sundown.mp3',            prompt: 'instrumental lo-fi, dreamy synth pad, soft piano, dusty drums, relaxed groove, no vocals, 82 BPM' },
  { filename: 'lofi-05-rain-window.mp3',             prompt: 'instrumental lo-fi, warm piano, soft bass, vinyl noise plus light rain sound, peaceful, no vocals, 75 BPM' },

  // Hip-Hop (4)
  { filename: 'hiphop-01-lowrider-sunday.mp3',       prompt: 'instrumental hip-hop chill, lo-fi drums, jazzy piano sample, smooth bass, no vocals, 85 BPM' },
  { filename: 'hiphop-02-cypher-block.mp3',          prompt: 'instrumental boom-bap hip-hop, vinyl crackle, jazzy piano sample, hard kick and snare, no vocals, 90 BPM' },
  { filename: 'hiphop-03-underground.mp3',           prompt: 'instrumental hip-hop dark, minor piano, deep 808s, hi-hat rolls, gritty atmosphere, no vocals, 140 BPM' },
  { filename: 'hiphop-04-trap-throne.mp3',           prompt: 'instrumental trap, hard 808 bass, hi-hat rolls, dark minor synth, modern Atlanta vibe, no vocals, 145 BPM' },
];

async function downloadToFile(url, filepath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buf);
  return buf.length;
}

async function generateOne(track) {
  console.log(`\n[${track.filename}] generating…`);
  const start = Date.now();
  const result = await fal.subscribe('fal-ai/stable-audio', {
    input: { prompt: track.prompt, seconds_total: 30, steps: 100 },
    logs: false,
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const audioUrl = result?.data?.audio_file?.url || result?.data?.audio?.url || result?.data?.url;
  if (!audioUrl) {
    console.error(`  [error] no audio URL:`, JSON.stringify(result?.data || result, null, 2).slice(0, 300));
    return false;
  }
  console.log(`  generated in ${elapsed}s — downloading…`);
  const out = join(OUT_DIR, track.filename);
  const bytes = await downloadToFile(audioUrl, out);
  console.log(`  saved ${(bytes / 1024).toFixed(1)} KB → ${track.filename}`);
  return true;
}

(async () => {
  console.log(`Generating ${TRACKS.length} catalog tracks via fal-ai/stable-audio`);
  console.log(`Output dir: ${OUT_DIR}`);
  let ok = 0, fail = 0;
  for (const track of TRACKS) {
    try {
      if (await generateOne(track)) ok++; else fail++;
    } catch (e) {
      fail++;
      console.error(`  [error] ${track.filename}: ${e.message}`);
    }
  }
  console.log(`\n=== DONE — ${ok}/${TRACKS.length} generated, ${fail} failed ===`);
})();
