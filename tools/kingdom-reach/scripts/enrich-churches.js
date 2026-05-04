#!/usr/bin/env node
// enrich-churches.js — Free church data enrichment using OpenStreetMap (Overpass API)
// Queries OSM for all churches in Columbia SC area, fuzzy-matches against our DB,
// fills in missing addresses + phone numbers. No API key needed. 100% free.
//
// Usage: node tools/kingdom-reach/scripts/enrich-churches.js [--dry-run]

import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

// ── DB path (works locally + on Fly.io) ──────────────────────────────────────
const dbPaths = [
  join(__dirname, '../../crm/crm.db'),
  '/data/crm.db',
  join(__dirname, '../../../tools/crm/crm.db'),
];
const dbPath = dbPaths.find(p => existsSync(p));
if (!dbPath) {
  console.error('crm.db not found. Paths tried:', dbPaths);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);

// ── Overpass API query — all churches in Richland County SC ──────────────────
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const QUERY = `
[out:json][timeout:60];
(
  node["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7);
  way["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7);
  relation["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7);
);
out body center;
`;

// ── Fuzzy name matching ───────────────────────────────────────────────────────
function normalize(s) {
  return s.toLowerCase()
    .replace(/\b(church|baptist|methodist|presbyterian|lutheran|apostolic|assembly|cogic|ame|cog|umc|of|the|first|second|third|greater|new|holy|mount|mt|saint|st|and|&)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  // Simple bigram overlap
  function bigrams(s) {
    const bg = new Set();
    for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
    return bg;
  }
  const ba = bigrams(na);
  const bb = bigrams(nb);
  const intersection = [...ba].filter(g => bb.has(g)).length;
  const union = new Set([...ba, ...bb]).size;
  return union > 0 ? intersection / union : 0;
}

function findBestMatch(osmName, churchRows) {
  let best = null;
  let bestScore = 0;
  for (const row of churchRows) {
    const score = similarity(osmName, row.name);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return bestScore >= 0.5 ? { church: best, score: bestScore } : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching church data from OpenStreetMap (Overpass API)…');
  console.log('Coverage: Columbia SC metro (33.8–34.2°N, 81.2–80.7°W)\n');

  let osmData;
  try {
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(QUERY)}`,
    });
    osmData = await resp.json();
  } catch (e) {
    console.error('Overpass API failed:', e.message);
    process.exit(1);
  }

  const osmChurches = osmData.elements.filter(el => el.tags && el.tags.name);
  console.log(`Found ${osmChurches.length} named places of worship in OSM\n`);

  // Load our churches
  const churches = db.prepare("SELECT id, name, address, phone, city, state, zip FROM churches WHERE has_website = 0").all();
  console.log(`Our DB has ${churches.length} no-website churches to enrich\n`);

  let updated = 0;
  let skipped = 0;

  for (const osm of osmChurches) {
    const tags = osm.tags;
    const osmName = tags.name;

    // Extract OSM fields
    const osmPhone = tags.phone || tags['contact:phone'] || tags['contact:mobile'] || null;
    const osmStreet = tags['addr:street'] ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim() : null;
    const osmCity   = tags['addr:city'] || null;
    const osmState  = tags['addr:state'] || null;
    const osmZip    = tags['addr:postcode'] || null;

    // Skip if OSM has no useful new data
    if (!osmPhone && !osmStreet) continue;

    const match = findBestMatch(osmName, churches);
    if (!match) continue;

    const { church, score } = match;

    // Only fill MISSING fields — never overwrite existing good data
    const needsPhone   = !church.phone && osmPhone;
    const needsAddress = !church.address && osmStreet;
    const needsCity    = !church.city && osmCity;
    const needsZip     = !church.zip && osmZip;

    if (!needsPhone && !needsAddress) {
      skipped++;
      continue;
    }

    console.log(`[${score.toFixed(2)}] "${osmName}" → "${church.name}"`);
    if (needsAddress) console.log(`  address: ${osmStreet}${osmCity ? ', ' + osmCity : ''}${osmZip ? ' ' + osmZip : ''}`);
    if (needsPhone)   console.log(`  phone:   ${osmPhone}`);

    if (!DRY_RUN) {
      const sets = [];
      const vals = [];
      if (needsAddress) { sets.push('address = ?'); vals.push(osmStreet); }
      if (needsCity)    { sets.push('city = ?');    vals.push(osmCity); }
      if (needsState)   { sets.push('state = ?');   vals.push(osmState); }
      if (needsZip)     { sets.push('zip = ?');     vals.push(osmZip); }
      if (needsPhone)   { sets.push('phone = ?');   vals.push(osmPhone); }
      vals.push(church.id);
      db.prepare(`UPDATE churches SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    }

    updated++;
  }

  console.log(`\n${ DRY_RUN ? '[DRY RUN] Would have updated' : 'Updated' } ${updated} churches.`);
  console.log(`Skipped ${skipped} (already had address+phone or no OSM data).`);

  if (DRY_RUN) console.log('\nRun without --dry-run to apply changes.');

  db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
