#!/usr/bin/env node
// import-churches-to-db.js — one-time seed: push all 283 churches from CSV into Kingdom Reach DB
// Run: node Agency/ops/outreach/import-churches-to-db.js
// Safe to re-run — uses ON CONFLICT(name) DO UPDATE, never overwrites existing richer data

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../..');

const CRM_URL    = process.env.CRM_URL    || 'https://crm.crownmediagroup.co';
const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';

// ── Parse CSV ─────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
    return row;
  });
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// ── Load main CSV ─────────────────────────────────────────────────────────────
const csvPath = join(__dirname, 'churches-columbia-sc.csv');
if (!existsSync(csvPath)) {
  console.error('CSV not found:', csvPath);
  process.exit(1);
}
const csvRows = parseCSV(readFileSync(csvPath, 'utf8'));
console.log(`CSV loaded: ${csvRows.length} churches`);

// ── Load GMass export for enrichment (pastor names + phones) ─────────────────
const gmassPath = join(__dirname, 'gmass-export.csv');
const gmassMap = new Map(); // churchName → { pastor, phone }
if (existsSync(gmassPath)) {
  const gmassRows = parseCSV(readFileSync(gmassPath, 'utf8'));
  for (const r of gmassRows) {
    const name = r['Church Name'] || r['Name'] || r['church_name'] || '';
    if (name) {
      gmassMap.set(name.toLowerCase(), {
        pastor: r['Pastor'] || r['pastor'] || r['Contact'] || '',
        phone:  r['Phone']  || r['phone']  || '',
      });
    }
  }
  console.log(`GMass export loaded: ${gmassMap.size} records`);
}

// ── Known email sent (from OUTREACH-LOG.md + batch tracking) ─────────────────
const logPath = join(ROOT, 'Agency/ops/notes/OUTREACH-LOG.md');
const sentFromLog = new Set();
if (existsSync(logPath)) {
  const lines = readFileSync(logPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/\[SENT\]\s*(.+?)\s*[→>]/);
    if (m) sentFromLog.add(m[1].trim().toLowerCase());
  }
  console.log(`OUTREACH-LOG.md: ${sentFromLog.size} sent entries`);
}

// ── Known GMass opened churches (from campaign tracking) ─────────────────────
const KNOWN_OPENED = [
  'Spring Valley Baptist Church',
  'Pineview Baptist Church',
  'RADIUS Church',
  'Mill City Church',
  'Round Hill Baptist Church',
  'Saluda River Church',
  'Northside Baptist Church',
  'Bethel United Methodist Church',
];

// ── Known replied churches ────────────────────────────────────────────────────
const KNOWN_REPLIED = [
  'Rehoboth Baptist Church',
];

// ── Build churches payload ────────────────────────────────────────────────────
const churches = csvRows.map(r => {
  const name = r['Church Name'] || r['Name'] || '';
  if (!name) return null;

  const gmass = gmassMap.get(name.toLowerCase()) || {};
  const hasWebsite = !!(r['Website'] || '').trim();

  return {
    name,
    tier:         r['Tier'] || 'C',
    denomination: r['Denomination'] || '',
    address:      r['Address'] || '',
    city:         r['City'] || 'Columbia',
    state:        r['State'] || 'SC',
    zip:          r['ZIP'] || r['Zip'] || '',
    phone:        r['Phone'] || gmass.phone || '',
    website:      r['Website'] || '',
    pastor:       r['Pastor'] || gmass.pastor || '',
    email:        r['Email'] || '',
    instagram:    r['Instagram'] || '',
    facebook:     r['Facebook'] || '',
    size:         r['Size'] || '',
    social:       r['Social Activity'] || '',
    fit:          r['Best Service Fit'] || '',
    has_website:  hasWebsite,
    status:       r['Outreach Status'] || 'Not Contacted',
    notes:        r['Notes'] || '',
  };
}).filter(Boolean);

// ── Build sent names list: CSV Outreach Status OR known from log ──────────────
const sentNames = churches
  .filter(c => {
    const csvSent = (c.status || '').toLowerCase().includes('contact') ||
                    (c.status || '').toLowerCase().includes('emailed') ||
                    (c.status || '').toLowerCase().includes('sent');
    const logSent = sentFromLog.has(c.name.toLowerCase());
    return csvSent || logSent;
  })
  .map(c => c.name);

console.log(`\nChurches to import:    ${churches.length}`);
console.log(`Email sent markers:    ${sentNames.length}`);
console.log(`Email opened markers:  ${KNOWN_OPENED.length}`);
console.log(`Replied markers:       ${KNOWN_REPLIED.length}`);

// ── POST to CRM in batches of 50 ─────────────────────────────────────────────
const ENDPOINT = `${CRM_URL}/api/kingdom-reach/churches/import`;
const BATCH_SIZE = 50;
console.log(`\nImporting to: ${ENDPOINT} (batches of ${BATCH_SIZE})`);

let totalImported = 0;
for (let i = 0; i < churches.length; i += BATCH_SIZE) {
  const batch = churches.slice(i, i + BATCH_SIZE);
  const isFirst = i === 0;
  const body = {
    token: SEED_TOKEN,
    churches: batch,
    // Only send tracking markers with the last batch to avoid double-applying
    sent_names:    i + BATCH_SIZE >= churches.length ? sentNames   : [],
    opened_names:  i + BATCH_SIZE >= churches.length ? KNOWN_OPENED  : [],
    replied_names: i + BATCH_SIZE >= churches.length ? KNOWN_REPLIED : [],
  };
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let result;
  try { result = JSON.parse(text); } catch { result = { error: 'Bad JSON: ' + text.slice(0, 100) }; }
  if (!result.ok) {
    console.error(`Batch ${Math.floor(i/BATCH_SIZE)+1} failed:`, result);
    process.exit(1);
  }
  totalImported += result.imported || 0;
  process.stdout.write(`  Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(churches.length/BATCH_SIZE)}: ${result.imported} records\n`);
}

console.log(`\nSUCCESS`);
console.log(`  Total imported/updated: ${totalImported}`);
console.log(`  Email sent markers:     ${sentNames.length}`);
console.log(`  Email opened markers:   ${KNOWN_OPENED.length}`);
console.log(`  Replied markers:        ${KNOWN_REPLIED.length}`);
console.log('\nKingdom Reach dashboard will now show full church data with email tracking.');
