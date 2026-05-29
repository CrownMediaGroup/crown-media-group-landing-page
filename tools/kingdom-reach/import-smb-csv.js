// tools/kingdom-reach/import-smb-csv.js
// INTAKE — convert SMB discovery CSV → CRM records.
// Uses existing POST /api/kingdom-reach/churches/import endpoint (token-bypass per memory).
//
// After import:
//   - GAUGE scoring auto-runs (or invoke lead-score.js after)
//   - Tier-A subset gets pitch_pdf generated via build-pitch-pdf.mjs
//   - Manifest staged at Agency/ops/outreach/leave-behinds/manifest-YYYY-MM-DD.csv
//
// Usage: SEED_TOKEN=... node tools/kingdom-reach/import-smb-csv.js <csv-path>

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CRM_URL = 'https://crm.crownmediagroup.co';
const TOKEN = process.env.SEED_TOKEN;

function parseCSV(text) {
  const lines = text.split('\n').filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
      else { cur += ch; }
    }
    fields.push(cur);
    const row = {};
    header.forEach((h, i) => row[h] = (fields[i] || '').trim());
    return row;
  });
}

async function importBatch(records) {
  // Use existing POST /api/kingdom-reach/churches/import endpoint (idempotent on name)
  const payload = records.map(r => ({
    name: r.name,
    org_type: 'business',
    website: r.website || null,
    phone: r.phone || null,
    email: r.email || null,
    address: r.address || null,
    city: r.city || null,
    state: 'SC',
    has_website: !!r.website,
    notes: `Imported via discover-smb-faith.js · OSM ${r.osm_id || ''} · faith_score=${r.faith_score || 0}`,
  }));

  const res = await fetch(`${CRM_URL}/api/kingdom-reach/churches/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, churches: payload }),
  });
  const data = await res.json();
  return data;
}

async function main() {
  if (!TOKEN) { console.error('SEED_TOKEN required'); process.exit(1); }
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node tools/kingdom-reach/import-smb-csv.js <csv-path>'); process.exit(1); }

  console.log(`Reading ${csvPath}...`);
  const records = parseCSV(readFileSync(csvPath, 'utf8'));
  console.log(`Parsed ${records.length} records`);
  console.log('');

  // Filter: must have name + (website OR email OR phone)
  const importable = records.filter(r => r.name && r.name.trim() && (r.website || r.email || r.phone));
  console.log(`Importable (has name + contact): ${importable.length}`);

  if (!importable.length) { console.log('Nothing to import.'); return; }

  // Batch by 50 to be kind to CRM
  let totalAdded = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  const batchSize = 50;
  for (let i = 0; i < importable.length; i += batchSize) {
    const batch = importable.slice(i, i + batchSize);
    process.stdout.write(`[${i+1}-${Math.min(i+batchSize, importable.length)}/${importable.length}] importing batch... `);
    try {
      const r = await importBatch(batch);
      const added = r.added || r.inserted || 0;
      const updated = r.updated || 0;
      const failed = r.failed || 0;
      totalAdded += added;
      totalUpdated += updated;
      totalFailed += failed;
      process.stdout.write(`+${added} ~${updated} ✗${failed}\n`);
    } catch (e) {
      console.log(`ERR: ${e.message}`);
      totalFailed += batch.length;
    }
    await new Promise(r => setTimeout(r, 1500));  // throttle
  }

  console.log('');
  console.log(`Done. Added: ${totalAdded} · Updated: ${totalUpdated} · Failed: ${totalFailed}`);

  try {
    appendEvent({
      agent: 'INTAKE',
      entity_type: 'import_run',
      entity_id: `smb-import-${new Date().toISOString().slice(0,10)}`,
      action: 'import_csv',
      fields: { source_csv: csvPath, importable: importable.length, added: totalAdded, updated: totalUpdated, failed: totalFailed },
      source: 'import-smb-csv.js',
    });
    emit({
      agent: 'INTAKE',
      severity: totalAdded >= 50 ? 'P1' : 'P2',
      action: `SMB import: +${totalAdded} new records`,
      detail: `Updated: ${totalUpdated} · Failed: ${totalFailed} · Source: ${csvPath}`,
      next: 'GAUGE will score new records on next run → A-tier subset gets pitch_pdf for Monday fire',
    });
  } catch {}

  return { added: totalAdded, updated: totalUpdated, failed: totalFailed };
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('import-smb-csv.js') || argv1.endsWith('import-smb-csv.mjs')) {
  try { await main(); } catch (e) { console.error('FAILED:', e.message); process.exit(1); }
}
