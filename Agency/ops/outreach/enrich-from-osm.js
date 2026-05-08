#!/usr/bin/env node
// enrich-from-osm.js — local Overpass fetch → push enrichment to live CRM via import API
// Fills missing phone + address for no-website churches using OpenStreetMap data (free, no key)
// Run: node Agency/ops/outreach/enrich-from-osm.js

const BASE_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN = 'KingdomSeed2026';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const QUERY = `[out:json][timeout:60];
(
  node["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7);
  way["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7);
  relation["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7);
);
out body center;`;

function norm(s) {
  return s.toLowerCase()
    .replace(/\b(church|baptist|methodist|presbyterian|lutheran|apostolic|assembly|cogic|ame|cog|umc|of|the|first|second|third|greater|new|holy|mount|mt|saint|st|and|&)\b/g, '')
    .replace(/[^a-z0-9]/g, '').trim();
}

function score(a, b) {
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  function bigrams(s) { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i+2)); return g; }
  const ba = bigrams(na), bb = bigrams(nb);
  const inter = [...ba].filter(g => bb.has(g)).length;
  const uni = new Set([...ba, ...bb]).size;
  return uni > 0 ? inter / uni : 0;
}

async function main() {
  console.log('ORACLE — OSM Enrichment (local Overpass → live CRM)');
  console.log('=====================================================\n');

  // 1. Fetch OSM data locally
  console.log('Fetching church data from OpenStreetMap...');
  const osmResp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/javascript, */*',
    },
    body: `data=${encodeURIComponent(QUERY)}`,
  });
  const rawText = await osmResp.text();
  if (!osmResp.ok || rawText.trim().startsWith('<')) {
    throw new Error(`Overpass returned non-JSON: HTTP ${osmResp.status}\n${rawText.slice(0, 300)}`);
  }
  const osmData = JSON.parse(rawText);
  const elements = (osmData.elements || []).filter(el => el.tags && el.tags.name);
  console.log(`Found ${elements.length} named places of worship in OSM\n`);

  // 2. Fetch all churches from CRM
  console.log('Loading churches from live CRM...');
  const crmResp = await fetch(`${BASE_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=500`);
  const crmData = await crmResp.json();
  const churches = crmData.churches || [];
  console.log(`CRM has ${churches.length} churches\n`);

  // 3. Match and build enrichment list
  const enriched = [];
  let skipped = 0;

  for (const el of elements) {
    const t = el.tags;
    const osmPhone  = t.phone || t['contact:phone'] || t['contact:mobile'] || null;
    const osmStreet = t['addr:street'] ? `${t['addr:housenumber'] || ''} ${t['addr:street']}`.trim() : null;
    const osmCity   = t['addr:city'] || null;
    const osmZip    = t['addr:postcode'] || null;

    if (!osmPhone && !osmStreet) continue;

    let best = null, bestS = 0;
    for (const c of churches) {
      const s = score(t.name, c.name);
      if (s > bestS) { bestS = s; best = c; }
    }
    if (!best || bestS < 0.5) continue;

    const needsPhone   = (!best.phone   || best.phone.trim() === '')   && osmPhone;
    const needsAddress = (!best.address || best.address.trim() === '') && osmStreet;

    if (!needsPhone && !needsAddress) { skipped++; continue; }

    const update = { name: best.name };
    if (needsAddress) update.address = osmStreet;
    if (osmCity && (!best.city || best.city.trim() === ''))   update.city  = osmCity;
    if (osmZip  && (!best.zip  || best.zip.trim()  === ''))   update.zip   = osmZip;
    if (needsPhone)   update.phone   = osmPhone;

    console.log(`[${bestS.toFixed(2)}] "${t.name}" → "${best.name}"`);
    if (needsAddress) console.log(`  address: ${osmStreet}${osmCity ? ', ' + osmCity : ''}${osmZip ? ' ' + osmZip : ''}`);
    if (needsPhone)   console.log(`  phone:   ${osmPhone}`);

    enriched.push(update);
  }

  console.log(`\nMatched ${enriched.length} records to update, skipped ${skipped} (already have data)\n`);

  if (!enriched.length) {
    console.log('No new data to push.');
    return;
  }

  // 4. Push to CRM via import endpoint (only updates, never inserts because names must match exactly)
  console.log(`Pushing ${enriched.length} enrichment updates to CRM...`);
  const postResp = await fetch(`${BASE_URL}/api/kingdom-reach/churches/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, churches: enriched }),
  });
  const postData = await postResp.json();
  if (postResp.ok) {
    console.log(`Done. Updated ${postData.updated ?? postData.imported ?? enriched.length} records.`);
  } else {
    console.error('Push failed:', postData);
  }

  console.log('\n=== ENRICHED ===');
  for (const e of enriched) {
    console.log(`  ${e.name.padEnd(50)} ${e.phone || ''} | ${e.address || ''}`);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
