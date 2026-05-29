// tools/kingdom-reach/discover-smb-faith.js
// FALCON + EYES — small business + faith-friendly lead discovery for SC.
// Pulls from OpenStreetMap (Overpass API — free, no key) across 7 SC counties.
// Filters business categories + applies Christian-affinity heuristic.
// AI fallback: Gemini Flash scores ambiguous matches.
//
// Output: Agency/ops/outreach/smb-faith-columbia-YYYY-MM-DD.csv
//
// Usage: GEMINI_API_KEY=... node tools/kingdom-reach/discover-smb-faith.js
//        node tools/kingdom-reach/discover-smb-faith.js --county Lexington

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'Agency', 'ops', 'outreach');

// Overpass mirrors (rotate if rate-limited)
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

// 7 SC counties (King's directive expansion)
const COUNTIES = {
  Richland:   { latS: 33.85, latN: 34.20, lonW: -81.30, lonE: -80.65 },
  Lexington:  { latS: 33.75, latN: 34.20, lonW: -81.60, lonE: -81.00 },
  Kershaw:    { latS: 34.10, latN: 34.65, lonW: -80.85, lonE: -80.30 },
  Calhoun:    { latS: 33.55, latN: 33.95, lonW: -80.95, lonE: -80.55 },
  Newberry:   { latS: 34.00, latN: 34.55, lonW: -81.80, lonE: -81.30 },
  Fairfield:  { latS: 34.20, latN: 34.70, lonW: -81.40, lonE: -80.85 },
  Saluda:     { latS: 33.85, latN: 34.20, lonW: -82.00, lonE: -81.55 },
};

// Business categories worth pitching (Columbia SMB faith owners)
const CATEGORIES = [
  // service businesses
  'shop=hairdresser', 'shop=beauty', 'shop=tailor',
  'office=accountant', 'office=lawyer', 'office=insurance', 'office=financial',
  'office=therapist', 'amenity=counselling',
  'office=architect', 'office=research',
  // education + childcare
  'amenity=school', 'amenity=college', 'amenity=childcare', 'amenity=kindergarten',
  // health + wellness
  'amenity=doctors', 'amenity=dentist', 'amenity=clinic', 'amenity=veterinary',
  'leisure=fitness_centre', 'shop=optician', 'amenity=pharmacy',
  // food + retail
  'amenity=restaurant', 'amenity=cafe', 'amenity=bakery',
  'shop=bakery', 'shop=florist', 'shop=jewelry', 'shop=gift', 'shop=books',
  // construction + trades
  'craft=carpenter', 'craft=electrician', 'craft=plumber', 'craft=painter',
  'craft=roofer', 'craft=stonemason', 'shop=hardware',
  // creative
  'craft=photographer', 'shop=art',
];

// Faith-affinity name/website indicators (regex)
const FAITH_INDICATORS = /\b(christ|jesus|christian|faith|grace|hope|trinity|calvary|covenant|bethel|kingdom|king's|prayer|cross|emmanuel|gospel|salvation|disciple|psalm|proverbs|alpha|omega|abundant|harvest|truth|rock|shepherd|lamb|lion of judah|messiah|redeem|holy|sanctified|anointed|blessed|chosen|cornerstone|firstborn|alpha-omega)\b/i;

async function overpassQuery(bbox, categories) {
  const filters = categories.map(c => {
    const [k, v] = c.split('=');
    return `nwr[${k}="${v}"](${bbox});`;
  }).join('\n');
  const query = `[out:json][timeout:60];(${filters});out tags center;`;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      return data.elements || [];
    } catch (e) {
      console.warn(`[Overpass] ${mirror} failed: ${e.message}`);
    }
  }
  return [];
}

function scoreFaithAffinity(element) {
  const name = element.tags?.name || '';
  const desc = element.tags?.description || '';
  const website = element.tags?.website || '';
  const combined = `${name} ${desc} ${website}`;
  if (FAITH_INDICATORS.test(combined)) return { score: 90, reason: 'name/desc contains faith indicator' };
  if (/holy|sanctified|blessed|anointed/i.test(combined)) return { score: 80, reason: 'spiritual descriptor' };
  return { score: 0, reason: 'no indicator (manual review or AI fallback needed)' };
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s).replace(/"/g, '""');
  return /[",\n]/.test(str) ? `"${str}"` : str;
}

async function main() {
  console.log('FALCON SMB Discovery — SC faith-friendly small businesses');
  console.log('===========================================================');
  console.log('');

  // Allow --county filter
  const countyIdx = process.argv.indexOf('--county');
  const targetCounties = countyIdx >= 0 ? [process.argv[countyIdx + 1]] : Object.keys(COUNTIES);

  const seen = new Set();
  const matches = [];

  for (const countyName of targetCounties) {
    const c = COUNTIES[countyName];
    if (!c) { console.warn(`Unknown county: ${countyName}`); continue; }
    const bbox = `${c.latS},${c.lonW},${c.latN},${c.lonE}`;
    console.log(`\n[${countyName}] querying Overpass...`);

    // Batch categories in groups of 12 (Overpass query length limit safety)
    let countyMatches = 0;
    for (let i = 0; i < CATEGORIES.length; i += 12) {
      const batch = CATEGORIES.slice(i, i + 12);
      const elements = await overpassQuery(bbox, batch);

      for (const el of elements) {
        const name = el.tags?.name;
        if (!name) continue;
        const key = `${name.toLowerCase().trim()}-${el.tags?.['addr:city'] || ''}`;
        if (seen.has(key)) continue;

        const affinity = scoreFaithAffinity(el);
        if (affinity.score < 60) continue;  // skip non-faith businesses

        seen.add(key);
        matches.push({
          name,
          category: batch.find(c => {
            const [k, v] = c.split('=');
            return el.tags?.[k] === v;
          }) || 'business',
          website: el.tags?.website || el.tags?.['contact:website'] || '',
          phone: el.tags?.phone || el.tags?.['contact:phone'] || '',
          email: el.tags?.email || el.tags?.['contact:email'] || '',
          address: [
            el.tags?.['addr:housenumber'], el.tags?.['addr:street'],
            el.tags?.['addr:city'], el.tags?.['addr:state'], el.tags?.['addr:postcode'],
          ].filter(Boolean).join(' '),
          city: el.tags?.['addr:city'] || countyName,
          county: countyName,
          osm_id: `${el.type}/${el.id}`,
          lat: el.lat || el.center?.lat || null,
          lon: el.lon || el.center?.lon || null,
          faith_score: affinity.score,
          faith_reason: affinity.reason,
        });
        countyMatches++;
      }
      await new Promise(r => setTimeout(r, 1500));  // be nice to Overpass
    }
    console.log(`  ${countyName}: ${countyMatches} faith-affinity SMB matches`);
  }

  console.log('');
  console.log(`TOTAL faith-affinity SMB leads: ${matches.length}`);

  // Write CSV
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const csvPath = join(OUT_DIR, `smb-faith-columbia-${date}.csv`);
  const header = ['name','category','website','phone','email','address','city','county','osm_id','lat','lon','faith_score','faith_reason'];
  const csv = [header.join(',')];
  for (const m of matches) csv.push(header.map(h => csvEscape(m[h])).join(','));
  writeFileSync(csvPath, csv.join('\n'));

  console.log(`Written: ${csvPath}`);

  try {
    appendEvent({
      agent: 'FALCON',
      entity_type: 'discovery_run',
      entity_id: `smb-faith-${date}`,
      action: 'discover_smb',
      fields: { total: matches.length, counties: targetCounties, output: csvPath },
      source: 'discover-smb-faith.js',
    });
    emit({
      agent: 'FALCON',
      severity: matches.length >= 100 ? 'P1' : 'P2',
      action: `Discovered ${matches.length} faith-affinity SMB leads`,
      detail: `7 SC counties scanned · ${matches.filter(m=>m.email).length} have email · ${matches.filter(m=>m.website).length} have website`,
      next: 'INTAKE → CRM import → GAUGE scoring → Tier-A subset gets pitch_pdf Monday',
    });
  } catch {}

  return { matches, csvPath };
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('discover-smb-faith.js') || argv1.endsWith('discover-smb-faith.mjs')) {
  try { await main(); } catch (e) { console.error('FAILED:', e.message); process.exit(1); }
}

export { main };
