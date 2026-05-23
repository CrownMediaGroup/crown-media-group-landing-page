#!/usr/bin/env node
// upload-music-library.mjs — one-shot uploader for the 20 generated music tracks
// Creates kingdom-sound bucket (if missing), uploads MP3s, seeds music_tracks table.
//
// Usage:
//   cd landing-page && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=eyJxxx node ../Agency/ops/tools/upload-music-library.mjs
//
// Idempotent: skips files already in storage, skips music_tracks rows with same storage_path.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, basename, extname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const LIBRARY_DIR = join(ROOT, 'Agency', 'ops', 'music', 'library');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Required env vars missing.');
  console.error('Run: SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJxxx \\');
  console.error('     node Agency/ops/tools/upload-music-library.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const BUCKET = 'kingdom-sound';

// ── 1. Ensure bucket exists ──────────────────────────────────────────────────
console.log('Checking bucket "' + BUCKET + '"...');
const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) { console.error('listBuckets failed:', listErr.message); process.exit(1); }

if (!buckets.find(b => b.name === BUCKET)) {
  console.log('Creating private bucket: ' + BUCKET);
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (createErr) { console.error('createBucket failed:', createErr.message); process.exit(1); }
} else {
  console.log('Bucket exists.');
}

// ── 2. Parse filename → track metadata ───────────────────────────────────────
// Filenames follow pattern: <genre>-<NN>-<slug>.mp3
// e.g. cinematic-02-quiet-before.mp3 → { genre: 'cinematic', title: 'Quiet Before' }
function parseFilename(filename) {
  const stem = basename(filename, extname(filename));
  const parts = stem.split('-');
  const genre = parts[0];
  const titleSlug = parts.slice(2).join('-');
  const title = titleSlug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  return { genre, title, stem };
}

// ── 3. Tier + price by genre (matches earlier per-project pricing) ───────────
function tierForGenre(genre) {
  // Map genres → tier_required + price_cents per Kingdom Sound pricing
  const map = {
    cinematic:  { tier: 'studio',  price: 49700 },
    corporate:  { tier: 'pro',     price: 29700 },
    worship:    { tier: 'studio',  price: 49700 },
    'lo-fi':    { tier: 'starter', price: 15000 },
    lofi:       { tier: 'starter', price: 15000 },
    'hip-hop':  { tier: 'pro',     price: 29700 },
    hiphop:     { tier: 'pro',     price: 29700 },
  };
  return map[genre] || { tier: 'starter', price: 15000 };
}

// ── 4. Iterate + upload ──────────────────────────────────────────────────────
if (!existsSync(LIBRARY_DIR)) { console.error('Library dir missing:', LIBRARY_DIR); process.exit(1); }
const files = readdirSync(LIBRARY_DIR).filter(f => f.endsWith('.mp3'));
console.log('Found ' + files.length + ' MP3 files in ' + LIBRARY_DIR);
console.log('');

const results = { uploaded: 0, skippedExisting: 0, dbInserted: 0, dbSkipped: 0, failed: 0, errors: [] };

for (const file of files) {
  const localPath = join(LIBRARY_DIR, file);
  const storagePath = 'library/' + file;
  const { genre, title } = parseFilename(file);
  const { tier, price } = tierForGenre(genre);

  // Storage upload
  try {
    const bytes = readFileSync(localPath);
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: 'audio/mpeg', upsert: false });

    if (upErr && upErr.message && upErr.message.toLowerCase().includes('already exists')) {
      console.log('SKIP storage: ' + file + ' (already in bucket)');
      results.skippedExisting++;
    } else if (upErr) {
      throw upErr;
    } else {
      console.log('UP   storage: ' + file);
      results.uploaded++;
    }
  } catch (e) {
    console.log('FAIL storage: ' + file + ' — ' + e.message);
    results.failed++;
    results.errors.push({ file, error: e.message });
    continue;
  }

  // DB row — check if already exists
  try {
    const { data: existing } = await supabase
      .from('music_tracks')
      .select('id')
      .eq('storage_path', storagePath)
      .limit(1);

    if (existing && existing.length > 0) {
      results.dbSkipped++;
      continue;
    }

    const { error: insErr } = await supabase
      .from('music_tracks')
      .insert({
        title,
        genre,
        storage_path: storagePath,
        tier_required: tier,
        source_platform: 'falai',
        public: true,
        price_cents: price,
      });
    if (insErr) throw insErr;
    console.log('   db row: "' + title + '" (' + genre + ', tier=' + tier + ', $' + (price/100).toFixed(2) + ')');
    results.dbInserted++;
  } catch (e) {
    console.log('FAIL db: ' + file + ' — ' + e.message);
    results.failed++;
    results.errors.push({ file, error: e.message });
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('UPLOADED:        ' + results.uploaded);
console.log('STORAGE SKIPPED: ' + results.skippedExisting + ' (already in bucket)');
console.log('DB INSERTED:     ' + results.dbInserted);
console.log('DB SKIPPED:      ' + results.dbSkipped + ' (already in table)');
console.log('FAILED:          ' + results.failed);
console.log('═══════════════════════════════════════════════════════════════');

if (results.errors.length) {
  console.log('');
  console.log('Errors:');
  for (const e of results.errors) console.log('  ' + e.file + ': ' + e.error);
}

console.log('');
console.log('NEXT STEPS:');
console.log('1. Visit /music.html and verify catalog page now lists tracks.');
console.log('2. Test the music-download function with a paid user account.');
