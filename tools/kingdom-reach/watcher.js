// watcher.js — Drops a transcript .txt into tools/kingdom-reach/inbox/ and fires the pipeline
// Run as: node tools/kingdom-reach/watcher.js
import { watch, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import db from '../crm/database.js';
import { ensureSchema } from './schema.js';
import { runPipeline } from './index.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const INBOX      = join(__dirname, 'inbox');
const PROCESSED  = join(INBOX, 'processed');
const FAILED     = join(INBOX, 'failed');

ensureSchema(db);
for (const d of [INBOX, PROCESSED, FAILED]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

console.log(`[Kingdom Reach Watcher] Watching: ${INBOX}`);
console.log('  Drop a transcript named  ChurchName_2026-05-01.txt  to trigger the pipeline.');
console.log('  First line of the file may be:  pastor=Name | phone=... | email=... | address=...  (optional metadata)');

const seen = new Set();

watch(INBOX, async (event, filename) => {
  if (!filename || !filename.toLowerCase().endsWith('.txt')) return;
  const full = join(INBOX, filename);
  if (seen.has(full)) return;
  seen.add(full);
  setTimeout(async () => {
    seen.delete(full);
    if (!existsSync(full)) return;
    try {
      const stats = statSync(full);
      if (!stats.isFile()) return;
      await processFile(full);
    } catch (e) {
      console.error('[Watcher]', filename, '→', e.message);
    }
  }, 1500);
});

async function processFile(file) {
  const fname     = basename(file, extname(file));
  const churchName = fname.replace(/_\d{4}-\d{2}-\d{2}.*$/, '').replace(/[_-]+/g, ' ').trim();
  if (!churchName) { console.warn('[Watcher] Could not derive church name from', file); return; }

  const raw = readFileSync(file, 'utf8');
  const { meta, transcript } = parseHeader(raw);
  console.log(`[Watcher] Processing: ${churchName}  (${transcript.length} chars)`);

  const churchHint = {
    name:    churchName,
    pastor:  meta.pastor  || '',
    phone:   meta.phone   || '',
    email:   meta.email   || '',
    address: meta.address || '',
    website: meta.website || '',
  };

  const ins = db.prepare(`INSERT INTO kingdom_dispatches (church_slug, transcript, status, workspace_id) VALUES (?, ?, 'processing', 1)`)
    .run(churchName.toLowerCase().replace(/\s+/g,'-'), transcript);

  try {
    await runPipeline(db, ins.lastInsertRowid, churchHint, { sendNow: false });
    renameSync(file, join(PROCESSED, basename(file)));
    console.log(`[Watcher] ✓ Done — moved to processed/`);
  } catch (e) {
    db.prepare(`UPDATE kingdom_dispatches SET status='error', error=? WHERE id=?`).run(String(e.message).slice(0,500), ins.lastInsertRowid);
    renameSync(file, join(FAILED, basename(file)));
    console.error(`[Watcher] ✗ Failed — moved to failed/  (${e.message})`);
  }
}

function parseHeader(raw) {
  const lines = raw.split(/\r?\n/);
  const first = lines[0] || '';
  const meta  = {};
  if (/^[a-z_]+\s*=/i.test(first) && first.includes('|')) {
    for (const part of first.split('|')) {
      const [k, ...v] = part.split('=');
      if (k && v.length) meta[k.trim().toLowerCase()] = v.join('=').trim();
    }
    return { meta, transcript: lines.slice(1).join('\n').trim() };
  }
  return { meta, transcript: raw.trim() };
}
