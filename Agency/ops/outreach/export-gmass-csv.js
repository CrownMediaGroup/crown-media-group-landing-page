// export-gmass-csv.js
// Reads the church database, exports a GMass-ready CSV for all churches with emails.
// Sorted: Tier A → B → C
// Usage: node export-gmass-csv.js

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const XLSX_PATH = path.join(__dirname, 'churches-columbia-sc.xlsx');
const CSV_PATH = path.join(__dirname, 'gmass-export.csv');

if (!fs.existsSync(XLSX_PATH)) {
  console.error('XLSX not found — run build-church-list.js first');
  process.exit(1);
}

const wb = XLSX.readFile(XLSX_PATH);
const ws = wb.Sheets['Master List'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Headers row: #, Tier, Church Name, Denomination, Address, City, State, ZIP,
//              Phone, Website, Pastor, Email, Instagram, Facebook, Size, Social, Fit, Status, Notes
// indices:      0   1     2           3            4        5      6      7
//               8      9        10       11        12         13      14     15     16     17     18

const tierOrder = { A: 0, B: 1, C: 2 };

const churches = rows.slice(1)
  .filter(r => r[11] && r[11].toString().trim()) // must have email
  .map(r => ({
    ChurchName: (r[2] || '').toString().trim(),
    PastorName: (r[10] || '').toString().trim() || 'Pastor',
    Email: (r[11] || '').toString().trim(),
    Tier: (r[1] || '').toString().trim(),
    Denomination: (r[3] || '').toString().trim(),
    Website: (r[9] || '').toString().trim(),
    Phone: (r[8] || '').toString().trim(),
  }))
  .filter(c => c.Email.includes('@'))
  .sort((a, b) => (tierOrder[a.Tier] ?? 9) - (tierOrder[b.Tier] ?? 9));

if (churches.length === 0) {
  console.log('No churches with emails found. Run scrape-emails.js + apply-emails.js first.');
  process.exit(0);
}

// Build CSV
function escapeCsv(val) {
  const s = (val || '').toString();
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const headers = ['ChurchName', 'PastorName', 'Email', 'Tier', 'Denomination', 'Website', 'Phone'];
const csvLines = [headers.join(',')];

for (const c of churches) {
  csvLines.push(headers.map(h => escapeCsv(c[h])).join(','));
}

fs.writeFileSync(CSV_PATH, csvLines.join('\r\n'), 'utf8');

// Summary by tier
const byTier = { A: 0, B: 0, C: 0 };
for (const c of churches) { byTier[c.Tier] = (byTier[c.Tier] || 0) + 1; }

console.log(`\n✓ GMass CSV exported: gmass-export.csv`);
console.log(`  Total: ${churches.length} churches ready to send`);
console.log(`  Tier A: ${byTier.A || 0} | Tier B: ${byTier.B || 0} | Tier C: ${byTier.C || 0}`);
console.log(`\nGMass merge tags available: {{ChurchName}}, {{PastorName}}, {{Tier}}, {{Denomination}}`);
console.log(`\nNext steps:`);
console.log(`  1. Upload gmass-export.csv to Google Sheets`);
console.log(`  2. In Gmail, connect GMass and select that Sheet`);
console.log(`  3. Paste Email 1 body, set 50/day, enable auto follow-up`);
console.log(`  4. Schedule: Email 2 at +3 days, Email 3 at +7 days\n`);
