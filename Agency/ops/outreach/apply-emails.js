// apply-emails.js
// Reads email-harvest-results.txt (after King reviews it), applies APPLY lines
// to build-church-list.js, then rebuilds the xlsx and HTML.
// Usage: node apply-emails.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RESULTS_PATH = path.join(__dirname, 'email-harvest-results.txt');
const BUILD_PATH = path.join(__dirname, 'build-church-list.js');

if (!fs.existsSync(RESULTS_PATH)) {
  console.error('email-harvest-results.txt not found — run scrape-emails.js first');
  process.exit(1);
}

const lines = fs.readFileSync(RESULTS_PATH, 'utf8').split('\n');
const toApply = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('APPLY')) continue;
  const parts = trimmed.split('|').map(s => s.trim());
  if (parts.length < 3) continue;
  const churchName = parts[1].trim();
  const email = parts[2].trim();
  if (churchName && email && email.includes('@')) {
    toApply.push({ churchName, email });
  }
}

if (toApply.length === 0) {
  console.log('No APPLY lines found in results file. Nothing to update.');
  process.exit(0);
}

console.log(`\nApplying ${toApply.length} email(s) to build-church-list.js...\n`);

let src = fs.readFileSync(BUILD_PATH, 'utf8');
let applied = 0;
let skipped = 0;

for (const { churchName, email } of toApply) {
  // Escape special regex chars in church name
  const escaped = churchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match the church entry block — find name:'churchName',...,email:''
  // We look for the name field followed (anywhere in the object) by email:''
  const namePattern = new RegExp(`(name:'${escaped}'[^}]*?email:)'([^']*)'`);
  const namePatternDq = new RegExp(`(name:"${escaped}"[^}]*?email:)"([^"]*)"`);

  let matched = false;

  if (namePattern.test(src)) {
    const current = src.match(namePattern)[2];
    if (current && current !== email) {
      console.log(`  SKIP  ${churchName} — already has email: ${current}`);
      skipped++;
      continue;
    }
    src = src.replace(namePattern, `$1'${email}'`);
    matched = true;
  } else if (namePatternDq.test(src)) {
    const current = src.match(namePatternDq)[2];
    if (current && current !== email) {
      console.log(`  SKIP  ${churchName} — already has email: ${current}`);
      skipped++;
      continue;
    }
    src = src.replace(namePatternDq, `$1"${email}"`);
    matched = true;
  }

  if (matched) {
    console.log(`  APPLY ${churchName} → ${email}`);
    applied++;
  } else {
    console.log(`  WARN  Could not find church in JS: ${churchName}`);
    skipped++;
  }
}

if (applied === 0) {
  console.log('\nNo changes applied. Check church names match exactly.');
  process.exit(0);
}

fs.writeFileSync(BUILD_PATH, src, 'utf8');
console.log(`\n✓ ${applied} email(s) applied to build-church-list.js`);

console.log('\nRebuilding xlsx...');
execSync('node build-church-list.js', { cwd: __dirname, stdio: 'inherit' });

console.log('Rebuilding HTML...');
execSync('node Agency/ops/outreach/build-html.js', { cwd: path.join(__dirname, '../../..'), stdio: 'inherit' });

console.log(`\nDone. ${applied} churches updated, ${skipped} skipped.\n`);
