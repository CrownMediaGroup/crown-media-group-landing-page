#!/usr/bin/env node
// import-orgs-to-db.js — import faith-orgs-columbia-sc.csv into Kingdom Reach DB
// Run: node Agency/ops/outreach/import-orgs-to-db.js
// Uses token bypass — no login required

import { createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH  = join(__dirname, 'faith-orgs-columbia-sc.csv');
const BASE_URL  = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN     = process.env.SEED_TOKEN || 'KingdomSeed2026';

// Map CSV OrgType → org_type value stored in DB
const ORG_TYPE_MAP = {
  nonprofit:  'nonprofit',
  school:     'school',
  youth:      'youth',
  business:   'business',
  network:    'network',
  missions:   'missions',
  media:      'media',
  recovery:   'recovery',
  prison:     'prison',
  men:        'men',
  women:      'women',
  church:     'church',
};

async function parseCsv(path) {
  const orgs = [];
  const rl = readline.createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (!headers) { headers = cols.map(h => h.toLowerCase().replace(/\s+/g,'_')); continue; }
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    orgs.push(row);
  }
  return orgs;
}

async function importOrgs() {
  console.log(`Reading ${CSV_PATH}...`);
  const rows = await parseCsv(CSV_PATH);
  console.log(`Parsed ${rows.length} organizations`);

  const churches = rows.map(r => ({
    name:       r.name,
    org_type:   ORG_TYPE_MAP[r.orgtype?.toLowerCase()] || 'nonprofit',
    tier:       'B',
    address:    r.address || '',
    city:       r.city    || 'Columbia',
    state:      r.state   || 'SC',
    zip:        r.zip     || '',
    phone:      r.phone   || '',
    website:    r.website || '',
    email:      r.email   || '',
    has_website: r.website ? 1 : 0,
    notes:      r.notes   || '',
    status:     'Not Contacted',
  }));

  // Show summary before sending
  const withEmail = churches.filter(c => c.email).length;
  const withSite  = churches.filter(c => c.has_website).length;
  const byType    = {};
  churches.forEach(c => { byType[c.org_type] = (byType[c.org_type] || 0) + 1; });

  console.log(`\nImport summary:`);
  console.log(`  Total orgs:     ${churches.length}`);
  console.log(`  With email:     ${withEmail}`);
  console.log(`  With website:   ${withSite}`);
  console.log(`  By type:`);
  Object.entries(byType).sort((a,b) => b[1]-a[1]).forEach(([t,n]) => console.log(`    ${t.padEnd(14)} ${n}`));
  console.log();

  console.log(`Posting to ${BASE_URL}/api/kingdom-reach/churches/import ...`);

  const resp = await fetch(`${BASE_URL}/api/kingdom-reach/churches/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, churches }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    console.error('Import failed:', data);
    process.exit(1);
  }

  console.log(`Import complete:`);
  console.log(`  Imported (new): ${data.imported}`);
  console.log(`  Total in DB:    (use /api/kingdom-reach/churches to check)`);
}

importOrgs().catch(err => { console.error(err); process.exit(1); });
