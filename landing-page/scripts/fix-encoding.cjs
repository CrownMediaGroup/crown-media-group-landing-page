#!/usr/bin/env node
// fix-encoding.cjs — Fix double-encoded UTF-8 characters across all HTML files
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FIXES = [
  ['\u00e2\u0080\u0094', '\u2014'], // em dash —
  ['\u00e2\u0080\u0093', '\u2013'], // en dash –
  ['\u00e2\u0080\u0099', '\u2019'], // right single quote '
  ['\u00e2\u0080\u009c', '\u201c'], // left double quote "
  ['\u00e2\u0080\u009d', '\u201d'], // right double quote "
  ['\u00e2\u0080\u00a6', '\u2026'], // ellipsis …
];

function walk(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory() && !f.startsWith('.') && f !== 'node_modules') {
      out.push(...walk(full));
    } else if (f.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
let fixed = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  for (const [broken, correct] of FIXES) {
    while (content.includes(broken)) {
      content = content.split(broken).join(correct);
    }
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    fixed++;
    console.log('Fixed: ' + path.relative(ROOT, file));
  }
}
console.log('\nDone. ' + fixed + ' files fixed.');
