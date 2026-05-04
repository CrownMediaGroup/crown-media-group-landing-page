// build-next-batch.js
// Builds the next 50-email GMass batch.
// Excludes churches from sent-batch-1.json (confirmed sent list from Google Sheet).
// For churches without scraped emails, infers info@domain or office@domain.
// Usage: node build-next-batch.js

const fs   = require('fs');
const path = require('path');

const CSV_PATH        = path.join(__dirname, 'churches-columbia-sc.csv');
const GMASS_PATH      = path.join(__dirname, 'gmass-export.csv');
const SENT_PATH       = path.join(__dirname, 'sent-batch-1.json');
const OUTPUT_PATH     = path.join(__dirname, 'gmass-next-batch.csv');
const BATCH_SIZE      = 50;

// ── CSV parser (handles quoted fields) ───────────────────────────────────────
function parseCsvLine(line) {
  const fields = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { field += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      fields.push(field.trim());
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseCsv(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

// ── Infer email from website domain ─────────────────────────────────────────
function inferEmail(website) {
  if (!website) return null;
  const domain = website
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase()
    .trim();
  if (!domain || domain.length < 4) return null;
  return `info@${domain}`;
}

function escapeCsv(val) {
  const s = (val || '').toString();
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const tierOrder = { A: 0, B: 1, C: 2 };

// Load confirmed sent list from Google Sheet
const alreadySentEmails = new Set(
  JSON.parse(fs.readFileSync(SENT_PATH, 'utf8')).map(e => e.toLowerCase())
);

// GMass export — get any confirmed emails NOT yet sent
const gmassRows   = parseCsv(GMASS_PATH);
const gmassEmails = new Set(gmassRows.map(r => (r.Email || '').toLowerCase()));
const gmassRemaining = gmassRows
  .filter(r => !alreadySentEmails.has((r.Email || '').toLowerCase()))
  .sort((a, b) => (tierOrder[a.Tier] ?? 9) - (tierOrder[b.Tier] ?? 9));

// Read full church CSV for additional churches
const churchRows = fs.readFileSync(CSV_PATH, 'utf8').split(/\r?\n/).filter(Boolean);
const churchHeaders = parseCsvLine(churchRows[0]);
// Headers: #, Tier, Church Name, Denomination, Address, City, State, ZIP, Phone, Website, Pastor, Email, Instagram, Facebook, Size, Social Activity, Best Service Fit, Outreach Status, Notes

const additional = [];
for (const line of churchRows.slice(1)) {
  const vals = parseCsvLine(line);
  const tier      = (vals[1] || '').trim();
  const name      = (vals[2] || '').trim();
  const website   = (vals[9] || '').trim();
  const pastor    = (vals[10] || '').trim();
  const email     = (vals[11] || '').trim();

  // Skip if already in gmass export (already has a real email captured)
  if (email && gmassEmails.has(email.toLowerCase())) continue;
  if (email && alreadySentEmails.has(email.toLowerCase())) continue;

  // Build inferred email if website available and no real email
  const useEmail = email || inferEmail(website);
  if (!useEmail) continue;

  // Skip if inferred email already in already-sent set
  if (alreadySentEmails.has(useEmail.toLowerCase())) continue;
  if (gmassEmails.has(useEmail.toLowerCase())) continue;

  additional.push({
    ChurchName:   name,
    PastorName:   pastor || 'Pastor',
    Email:        useEmail,
    Tier:         tier,
    Source:       email ? 'confirmed' : 'inferred',
    Website:      website,
  });
}

// Build per-church candidate map — one best email per unique church name
// Priority: confirmed real email > inferred info@ > inferred office@
const churchMap = new Map(); // churchName.toLowerCase() → best candidate

function scoreSource(src) { return src === 'confirmed' ? 0 : src === 'info' ? 1 : 2; }

// Seed with confirmed unsent from GMass export
for (const r of gmassRemaining) {
  const email = (r.Email || '').toLowerCase();
  if (alreadySentEmails.has(email)) continue;
  const key = r.ChurchName.toLowerCase().trim();
  if (!churchMap.has(key)) {
    churchMap.set(key, { ChurchName: r.ChurchName, PastorName: r.PastorName, Email: r.Email, Tier: r.Tier, Website: r.Website, Source: 'confirmed' });
  }
}

// info@ pass from church CSV
for (const line of churchRows.slice(1)) {
  const vals    = parseCsvLine(line);
  const tier    = (vals[1] || '').trim();
  const name    = (vals[2] || '').trim();
  const website = (vals[9] || '').trim();
  const pastor  = (vals[10] || '').trim();
  const email   = (vals[11] || '').trim();
  const useEmail = email || inferEmail(website);
  if (!useEmail) continue;
  if (alreadySentEmails.has(useEmail.toLowerCase())) continue;
  const key = name.toLowerCase().trim();
  const existing = churchMap.get(key);
  const newSrc = email ? 'confirmed' : 'info';
  if (!existing || scoreSource(newSrc) < scoreSource(existing.Source)) {
    churchMap.set(key, { ChurchName: name, PastorName: pastor || 'Pastor', Email: useEmail, Tier: tier, Website: website, Source: newSrc });
  }
}

// office@ pass — only fills gaps where no info@ candidate exists
for (const line of churchRows.slice(1)) {
  const vals    = parseCsvLine(line);
  const tier    = (vals[1] || '').trim();
  const name    = (vals[2] || '').trim();
  const website = (vals[9] || '').trim();
  const pastor  = (vals[10] || '').trim();
  if (!website) continue;
  const key = name.toLowerCase().trim();
  if (churchMap.has(key)) continue; // already have a better candidate
  const domain      = website.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  const officeEmail = `office@${domain}`;
  if (alreadySentEmails.has(officeEmail.toLowerCase())) continue;
  churchMap.set(key, { ChurchName: name, PastorName: pastor || 'Pastor', Email: officeEmail, Tier: tier, Website: website, Source: 'office' });
}

// Convert to array — confirmed first (regardless of tier), then inferred sorted A→B→C
// This ensures real confirmed emails are never cut off by lower-tier inferred churches
const sorted = [...churchMap.values()].sort((a, b) => {
  const srcDiff = scoreSource(a.Source) - scoreSource(b.Source);
  if (srcDiff !== 0) return srcDiff;
  return (tierOrder[a.Tier] ?? 9) - (tierOrder[b.Tier] ?? 9);
});

// Final dedup by email address — different campuses can share the same inbox
const seenEmails = new Set();
const pool = [];
for (const c of sorted) {
  const emailKey = c.Email.toLowerCase();
  if (seenEmails.has(emailKey)) continue;
  seenEmails.add(emailKey);
  pool.push(c);
}

const batch = pool.slice(0, BATCH_SIZE);

// Write CSV
const headers = ['ChurchName', 'PastorName', 'Email', 'Tier', 'Website'];
const csvLines = [headers.join(',')];
for (const c of batch) {
  csvLines.push(headers.map(h => escapeCsv(c[h])).join(','));
}
fs.writeFileSync(OUTPUT_PATH, csvLines.join('\r\n'), 'utf8');

// Summary
const confirmed = batch.filter(c => c.Source === 'confirmed').length;
const inferred  = batch.filter(c => c.Source !== 'confirmed').length;
const byTier    = {};
for (const c of batch) { byTier[c.Tier] = (byTier[c.Tier] || 0) + 1; }

console.log(`\n✓ Next batch CSV: gmass-next-batch.csv`);
console.log(`  Total: ${batch.length} churches`);
console.log(`  Confirmed emails: ${confirmed} | Inferred: ${inferred}`);
console.log(`  Tier A: ${byTier.A || 0} | Tier B: ${byTier.B || 0} | Tier C: ${byTier.C || 0}`);
console.log(`\nNote: Inferred = info@domain (best guess — GMass bounces won't hurt deliverability score`);
console.log(`if you use a dedicated sending address)`);
console.log(`\nNext steps:`);
console.log(`  1. Upload gmass-next-batch.csv to Google Sheets`);
console.log(`  2. In Gmail, connect GMass → select that Sheet`);
console.log(`  3. Use same email template from Campaign 1`);
console.log(`  4. Set 50/day send rate, enable auto follow-up at +3 and +7 days\n`);
