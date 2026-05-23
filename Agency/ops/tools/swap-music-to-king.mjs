#!/usr/bin/env node
// swap-music-to-king.mjs — atomic swap: wipe AI-generated tracks, upload King's original Suno beats
//
// 1. Delete all rows in music_tracks where source_platform='falai'
// 2. Delete all files in storage bucket kingdom-sound/library/ (the fal.ai ones)
// 3. Upload King's 10 tracks from D:\BEATS\2026 BEATS\DavidKing - Suno\DAVIDKING BEATS\
// 4. Insert music_tracks rows with King's tracks: studio tier, $497, public=true

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { basename, extname } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = 'kingdom-sound';
const KING_DIR = 'D:/BEATS/2026 BEATS/DavidKing - Suno/DAVIDKING BEATS';

// ── Step 1: Read fal.ai track storage paths, then wipe ──────────────────────
console.log('Step 1: Wiping fal.ai tracks...');
const { data: existing, error: listErr } = await supabase
  .from('music_tracks')
  .select('id, storage_path, source_platform')
  .eq('source_platform', 'falai');

if (listErr) { console.error('list error:', listErr.message); process.exit(1); }
console.log('  Found ' + existing.length + ' fal.ai tracks in DB');

if (existing.length > 0) {
  // Delete storage files
  const storagePaths = existing.map(r => r.storage_path);
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove(storagePaths);
  if (rmErr) console.log('  storage remove warning:', rmErr.message);
  else console.log('  Removed ' + storagePaths.length + ' files from storage');

  // Delete DB rows
  const { error: delErr } = await supabase.from('music_tracks').delete().eq('source_platform', 'falai');
  if (delErr) { console.error('  db delete error:', delErr.message); process.exit(1); }
  console.log('  Deleted ' + existing.length + ' rows from music_tracks');
}

// ── Step 2: Upload King's tracks ───────────────────────────────────────────
console.log('');
console.log('Step 2: Uploading King\'s Suno beats from ' + KING_DIR);
if (!existsSync(KING_DIR)) { console.error('King dir not found:', KING_DIR); process.exit(1); }
const files = readdirSync(KING_DIR).filter(f => f.toLowerCase().endsWith('.mp3'));
console.log('  Found ' + files.length + ' MP3 files');

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function titleFromFilename(filename) {
  const stem = basename(filename, extname(filename));
  // Strip "(beat)" and " beat" suffixes, normalize whitespace
  return stem.replace(/\s*\(beat\)\s*/gi, '').replace(/\s+beat(\s+v\d+)?$/i, '$1').trim();
}

function genreFromTitle(title) {
  const t = title.toLowerCase();
  // Velvet/Vinyl/Tape = lo-fi/chillhop aesthetic; Lemon Static = experimental
  if (/velvet|vinyl|tape|static/.test(t)) return 'lofi';
  return 'hiphop';
}

const results = { uploaded: 0, inserted: 0, failed: 0, errors: [] };

for (const file of files) {
  const title = titleFromFilename(file);
  const slug = slugify(title);
  const storagePath = `king/${slug}.mp3`;
  const localPath = `${KING_DIR}/${file}`;

  try {
    // Storage upload
    const bytes = readFileSync(localPath);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'audio/mpeg', upsert: true });
    if (upErr) throw upErr;
    console.log('  UP   ' + storagePath + ' (' + (bytes.length/1024).toFixed(0) + ' KB)');
    results.uploaded++;

    // DB row
    const genre = genreFromTitle(title);
    const { error: insErr } = await supabase
      .from('music_tracks')
      .insert({
        title,
        genre,
        storage_path: storagePath,
        tier_required: 'studio',  // King's originals = signature tier
        source_platform: 'suno',
        public: true,
        price_cents: 49700,  // $497 — King's signature work
        description: `Original beat by David King — Crown Media Group.`,
      });
    if (insErr) throw insErr;
    console.log('       row: "' + title + '" (genre=' + genre + ', studio tier, $497)');
    results.inserted++;
  } catch (e) {
    console.log('  FAIL ' + file + ' — ' + e.message);
    results.failed++;
    results.errors.push({ file, error: e.message });
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('UPLOADED: ' + results.uploaded);
console.log('DB ROWS:  ' + results.inserted);
console.log('FAILED:   ' + results.failed);
console.log('═══════════════════════════════════════════════════════════════');
if (results.errors.length) {
  console.log('Errors:');
  for (const e of results.errors) console.log('  ' + e.file + ': ' + e.error);
}

// ── Step 3: Final state ─────────────────────────────────────────────────────
const { data: final } = await supabase.from('music_tracks').select('id, title, genre, tier_required, price_cents, source_platform');
console.log('');
console.log('Final catalog state (' + final.length + ' tracks):');
for (const t of final) {
  console.log('  [' + t.id + '] ' + t.title.padEnd(35) + ' ' + t.genre.padEnd(10) + ' ' + t.tier_required.padEnd(8) + ' $' + (t.price_cents/100).toFixed(2));
}
