#!/usr/bin/env node
// import-sends-to-crm.js — one-time seed: push all sent church emails into CRM DB
// Run: node Agency/ops/outreach/import-sends-to-crm.js
// Works against BOTH local CRM (port 3001) and live Fly.io server

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

// ── Config ────────────────────────────────────────────────────────────────────
const CRM_URL    = process.env.CRM_URL    || 'https://crm.crownmediagroup.co';
const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';

// ── Collect all sent emails from multiple sources ─────────────────────────────
const sends = new Map(); // email → name

// Source 1: OUTREACH-LOG.md
const logPath = join(ROOT, 'Agency/ops/notes/OUTREACH-LOG.md');
if (existsSync(logPath)) {
  const lines = readFileSync(logPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/\[SENT\]\s*(.+?)\s*[→>]\s*(\S+@\S+)/);
    if (m) sends.set(m[2].trim(), m[1].trim());
  }
  console.log(`OUTREACH-LOG.md: ${sends.size} entries`);
}

// Source 2: sent-batch-1.json (email array)
const batchPath = join(__dirname, 'sent-batch-1.json');
if (existsSync(batchPath)) {
  const emails = JSON.parse(readFileSync(batchPath, 'utf8'));
  let added = 0;
  for (const email of emails) {
    if (typeof email === 'string' && !sends.has(email)) {
      sends.set(email, email.split('@')[0]);
      added++;
    }
  }
  console.log(`sent-batch-1.json: ${added} new entries added`);
}

console.log(`Total unique sends to import: ${sends.size}`);

const payload = [...sends.entries()].map(([email, name]) => ({ name, email }));

// ── POST via token-authenticated seed endpoint ────────────────────────────────
console.log(`\nSeeding ${payload.length} sends to ${CRM_URL}…`);
const importRes = await fetch(`${CRM_URL}/api/admin/seed-outreach`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: SEED_TOKEN, sends: payload }),
});

const result = await importRes.json();
if (result.ok) {
  console.log(`SUCCESS: Imported ${result.imported} church sends into CRM DB.`);
  console.log('Outreach tab will now show real data.');
} else {
  console.error('Import failed:', result);
  process.exit(1);
}
