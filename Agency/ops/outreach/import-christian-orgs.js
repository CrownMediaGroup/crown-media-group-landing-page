#!/usr/bin/env node
// import-christian-orgs.js — parse pipe-delimited christian-orgs-columbia-sc.txt
// and import into the live Kingdom Reach CRM via /api/kingdom-reach/churches/import
//
// Run: node Agency/ops/outreach/import-christian-orgs.js [--dry-run]

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, 'christian-orgs-columbia-sc.txt');
const BASE_URL  = process.env.CRM_URL   || 'https://crm.crownmediagroup.co';
const TOKEN     = process.env.SEED_TOKEN; if (!TOKEN) { console.error('SEED_TOKEN env var not set'); process.exit(1); }
const DRY_RUN   = process.argv.includes('--dry-run');

// Section header → org_type
const SECTION_MAP = [
  [/NONPROFITS/i,                'nonprofit'],
  [/SCHOOLS|UNIVERSITIES/i,      'school'],
  [/PRAYER NETWORKS|APOSTOLIC/i, 'network'],
  [/YOUTH/i,                     'youth'],
  [/BUSINESS ASSOCIATIONS/i,     'business'],
  [/MEDIA/i,                     'media'],
  [/RECOVERY|ADDICTION/i,        'recovery'],
  [/MISSIONS|EVANGELISM/i,       'missions'],
  [/PREGNANCY|ADOPTION|FAMILY/i, 'nonprofit'],
  [/MEN.?S.*WOMEN|WOMEN.*MEN/i,  'mixed'],   // resolved per-row below
  [/SPECIAL|COMMUNITY/i,         'nonprofit'],
];

function sectionToOrgType(header) {
  for (const [re, type] of SECTION_MAP) if (re.test(header)) return type;
  return 'nonprofit';
}

// For the mixed Men's/Women's section, resolve per-org based on name keywords.
function resolveMixed(name) {
  const n = name.toLowerCase();
  if (/\b(women|girl|proverbs 31)\b/.test(n)) return 'women';
  if (/\b(men|iron|manup|brother|man\s*up)\b/.test(n)) return 'men';
  return 'nonprofit';
}

const PHONE_RE   = /\(\d{3}\)\s*\d{3}-\d{4}/;
const WEBSITE_RE = /\b(?:[a-z0-9-]+\.)+(?:com|org|net|edu|co|us)\b/i;
const ADDR_RE    = /\b\d{2,5}\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)*\s+(?:Rd|St|Ave|Blvd|Ln|Dr|Way|Ct|Pkwy|Hwy|Pl)/i;
const CITY_RE    = /\bColumbia\s+SC\b/i;

function parseRow(line, orgType) {
  const cols = line.split('|').map(c => c.trim()).filter(c => c.length);
  if (!cols.length) return null;

  const name = cols[0];
  if (!name) return null;

  let description = '', phone = '', website = '', address = '';
  for (const col of cols.slice(1)) {
    if (!phone   && PHONE_RE.test(col))   phone   = col.match(PHONE_RE)[0];
    if (!website && WEBSITE_RE.test(col)) website = col.match(WEBSITE_RE)[0].toLowerCase();
    if (!address && ADDR_RE.test(col))    address = col;
    // Description is the first column that's not a phone/website/address-only and contains words
    if (!description && !PHONE_RE.test(col) && !ADDR_RE.test(col) && col.length > 8 && !/^\s*[a-z0-9-]+\.(com|org|net|edu|co|us)\s*$/i.test(col)) {
      description = col;
    }
  }

  // Strip ", Columbia SC" tail from address for cleanliness
  if (address) address = address.replace(/,\s*Columbia\s+SC.*$/i, '').trim();

  // Resolve mixed-section org_type per row
  const finalType = orgType === 'mixed' ? resolveMixed(name) : orgType;

  return {
    name,
    org_type:    finalType,
    tier:        'B',
    address:     address || '',
    city:        'Columbia',
    state:       'SC',
    zip:         '',
    phone:       phone   || '',
    website:     website ? (website.startsWith('http') ? website : `https://${website}`) : '',
    email:       '',
    has_website: website ? 1 : 0,
    notes:       description || '',
    status:      'Not Contacted',
  };
}

function parseFile(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const orgs = [];
  let currentType = 'nonprofit';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('=') || line.startsWith('CHRISTIAN ORGANIZATIONS') ||
        line.startsWith('All Glory') || line.startsWith('Generated:') ||
        line.startsWith('Target:') || line.startsWith('TOTAL ORGS') ||
        line.startsWith('Use for:') || line.startsWith('Note:')) {
      // Section header? Detect `== HEADER ==`
      const m = line.match(/^==\s*(.+?)\s*==$/);
      if (m) currentType = sectionToOrgType(m[1]);
      continue;
    }
    const row = parseRow(line, currentType);
    if (row) orgs.push(row);
  }
  return orgs;
}

async function run() {
  console.log(`Reading ${FILE_PATH}...`);
  const orgs = parseFile(FILE_PATH);
  console.log(`Parsed ${orgs.length} organizations`);

  const byType = {};
  orgs.forEach(o => { byType[o.org_type] = (byType[o.org_type] || 0) + 1; });
  const withSite  = orgs.filter(o => o.has_website).length;
  const withPhone = orgs.filter(o => o.phone).length;
  const withAddr  = orgs.filter(o => o.address).length;

  console.log(`\nImport summary:`);
  console.log(`  Total orgs:    ${orgs.length}`);
  console.log(`  With website:  ${withSite}`);
  console.log(`  With phone:    ${withPhone}`);
  console.log(`  With address:  ${withAddr}`);
  console.log(`  By type:`);
  Object.entries(byType).sort((a,b) => b[1]-a[1]).forEach(([t,n]) =>
    console.log(`    ${t.padEnd(14)} ${n}`));
  console.log();

  if (DRY_RUN) {
    console.log('[--dry-run] First 3 parsed rows:');
    console.log(JSON.stringify(orgs.slice(0, 3), null, 2));
    return;
  }

  console.log(`Posting to ${BASE_URL}/api/kingdom-reach/churches/import ...`);
  const resp = await fetch(`${BASE_URL}/api/kingdom-reach/churches/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, churches: orgs }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.ok) {
    console.error('Import failed:', data);
    process.exit(1);
  }
  console.log(`Import complete:`);
  console.log(`  Imported (new): ${data.imported}`);
  console.log(`  Updated:        ${data.updated || 0}`);
}

run().catch(err => { console.error(err); process.exit(1); });
