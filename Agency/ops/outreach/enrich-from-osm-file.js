#!/usr/bin/env node
// enrich-from-osm-file.js — read OSM JSON from stdin/file → push enrichment to live CRM
// Usage: node Agency/ops/outreach/enrich-from-osm-file.js /path/to/osm-churches.json

import { readFileSync } from 'fs';

const BASE_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN = process.env.SEED_TOKEN; if (!TOKEN) { console.error('SEED_TOKEN env var not set'); process.exit(1); }

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
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node enrich-from-osm-file.js <osm-json-path>'); process.exit(1); }

  console.log('ORACLE — OSM Enrichment (file → live CRM)');
  console.log('==========================================\n');

  const osmData = JSON.parse(readFileSync(filePath, 'utf8'));
  const elements = (osmData.elements || []).filter(el => el.tags && el.tags.name);
  console.log(`Loaded ${elements.length} named places of worship from OSM file\n`);

  console.log('Loading churches from live CRM...');
  const crmResp = await fetch(`${BASE_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=1000`);
  const crmData = await crmResp.json();
  const churches = crmData.churches || [];
  console.log(`CRM has ${churches.length} churches\n`);

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

    const needsPhone   = (!best.phone   || best.phone.trim()   === '') && osmPhone;
    const needsAddress = (!best.address || best.address.trim() === '') && osmStreet;

    if (!needsPhone && !needsAddress) { skipped++; continue; }

    const update = { name: best.name };
    if (needsAddress) update.address = osmStreet;
    if (osmCity && (!best.city || !best.city.trim())) update.city = osmCity;
    if (osmZip  && (!best.zip  || !best.zip.trim()))  update.zip  = osmZip;
    if (needsPhone)   update.phone = osmPhone;

    const parts = [];
    if (needsAddress) parts.push(`addr: ${osmStreet}`);
    if (needsPhone)   parts.push(`phone: ${osmPhone}`);
    console.log(`[${bestS.toFixed(2)}] "${t.name}" → "${best.name}" — ${parts.join(' | ')}`);

    enriched.push(update);
  }

  console.log(`\nMatched ${enriched.length} to update, ${skipped} already had data\n`);

  if (!enriched.length) {
    console.log('Nothing to push.');
    return;
  }

  console.log(`Pushing ${enriched.length} updates to CRM...`);
  const postResp = await fetch(`${BASE_URL}/api/kingdom-reach/churches/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, churches: enriched }),
  });
  const postData = await postResp.json();
  if (postResp.ok) {
    console.log(`Done. Processed ${postData.imported ?? enriched.length} records.`);
  } else {
    console.error('Push failed:', postData);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
