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
const CRM_URL  = process.env.CRM_URL  || 'https://crm.crownmediagroup.co';
const CRM_PASS = process.env.CRM_PASS || 'AllGlory2026!';
const CRM_EMAIL = process.env.CRM_EMAIL || 'king@crownmediagroup.co';

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

// ── Login to get session cookie ───────────────────────────────────────────────
console.log(`\nLogging in to ${CRM_URL}…`);
const loginRes = await fetch(`${CRM_URL}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: CRM_EMAIL, password: CRM_PASS }),
});

if (!loginRes.ok) {
  console.error('Login failed:', await loginRes.text());
  process.exit(1);
}

const cookies = loginRes.headers.get('set-cookie') || '';
const sessionCookie = cookies.split(';')[0];
console.log('Logged in. Session:', sessionCookie ? 'OK' : 'MISSING');

// ── POST the sends ────────────────────────────────────────────────────────────
console.log(`\nImporting ${payload.length} sends…`);
const importRes = await fetch(`${CRM_URL}/api/outreach/import-sends`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
  body: JSON.stringify({ sends: payload }),
});

const result = await importRes.json();
if (result.ok) {
  console.log(`SUCCESS: Imported ${result.imported} church sends into CRM DB.`);
  console.log('Outreach tab will now show real data.');
} else {
  console.error('Import failed:', result);
  process.exit(1);
}
