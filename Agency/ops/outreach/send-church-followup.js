/**
 * send-church-followup.js — Church Outreach Follow-up Sender
 * Sends Day 3 or Day 7 follow-up emails to Batch 2 churches via Resend.
 * Skips churches that replied (manually add to SKIP_LIST below).
 *
 * Usage:
 *   node send-church-followup.js --day 3            ← send Day 3 follow-up (send 2026-05-04)
 *   node send-church-followup.js --day 7            ← send Day 7 follow-up (send 2026-05-08)
 *   node send-church-followup.js --day 3 --dry-run  ← preview only
 *   node send-church-followup.js --day 3 --test     ← send all to king@crownmediagroup.co
 */

const fs   = require('fs');
const path = require('path');

// Load env
for (const p of [path.join(__dirname, '../../../.env'), path.join(__dirname, '.env'), path.join(__dirname, '.env.outreach')]) {
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length && !process.env[k.trim()]) {
        process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
      }
    });
  }
}

const IS_DRY  = process.argv.includes('--dry-run');
const IS_TEST = process.argv.includes('--test');
const TEST_TO = 'king@crownmediagroup.co';

const dayArg = process.argv.find(a => a.startsWith('--day'));
const DAY    = dayArg ? parseInt(process.argv[process.argv.indexOf(dayArg) + 1] || dayArg.split('=')[1]) : null;

if (!DAY || (DAY !== 3 && DAY !== 7)) {
  console.error('Usage: node send-church-followup.js --day 3|7 [--dry-run] [--test]');
  process.exit(1);
}

const RESEND_KEY = process.env.RESEND_API_KEY || 're_Kg1npkbf_EeeVDXvGLMyV3NM9R5hFzJ8F';
const FROM       = 'king@crownmediagroup.co';
const FROM_NAME  = 'David King | Crown Media Group';
const BATCH_CSV  = path.join(__dirname, 'gmass-next-batch.csv');
const LOG_FILE   = path.join(__dirname, '../../ops/notes/OUTREACH-LOG.md');
const DELAY_MS   = 1200;

// ── Add replied churches here so they don't get follow-ups ───────────────────
// Add the email address of anyone who replied and doesn't need a follow-up.
const SKIP_LIST = new Set([
  // 'info@example.com',
]);

// ── Email templates ───────────────────────────────────────────────────────────
function buildDay3Email(churchName, pastorName) {
  const firstName = pastorName && pastorName !== 'Pastor' ? pastorName.split(' ')[0] : null;
  const greeting = firstName || 'Pastor';
  const html = `
<div style="font-family: Arial, sans-serif; font-size: 15px; color: #1a1a1a; max-width: 580px; line-height: 1.6;">
  <p>Hey ${greeting},</p>

  <p>Just wanted to follow up on my note about <strong>${churchName}</strong>.</p>

  <p>I know ministry keeps you busy — no pressure at all. I just believe there's real opportunity for <strong>${churchName}</strong> to reach more people in Columbia through a smarter social media strategy.</p>

  <p>Would a quick 10-minute call this week work? I can show you exactly what I'd do for your specific ministry.</p>

  <p style="margin-top: 28px;">
    — David King<br>
    <strong>Crown Media Group</strong><br>
    <a href="https://crownmediagroup.co" style="color: #1a56db;">crownmediagroup.co</a><br>
    (908) 848-1436
  </p>
</div>`;

  const text = `Hey ${greeting},\n\nJust wanted to follow up on my note about ${churchName}.\n\nI know ministry keeps you busy — no pressure at all. I just believe there's real opportunity for ${churchName} to reach more people in Columbia through a smarter social media strategy.\n\nWould a quick 10-minute call this week work? I can show you exactly what I'd do for your specific ministry.\n\n— David King\nCrown Media Group\ncrownmediagroup.co\n(908) 848-1436`;

  return { html, text, subject: `Quick follow-up — ${churchName}` };
}

function buildDay7Email(churchName, pastorName) {
  const firstName = pastorName && pastorName !== 'Pastor' ? pastorName.split(' ')[0] : null;
  const greeting = firstName || 'Pastor';
  const html = `
<div style="font-family: Arial, sans-serif; font-size: 15px; color: #1a1a1a; max-width: 580px; line-height: 1.6;">
  <p>Hey ${greeting},</p>

  <p>Last note from me — I promise.</p>

  <p>If the timing isn't right for <strong>${churchName}</strong> right now, I completely understand. Ministry seasons are real.</p>

  <p>But if you ever want to talk about reaching more people online — I'm here. Just reply to this email or call me at (908) 848-1436.</p>

  <p style="margin-top: 28px;">
    — David King<br>
    <strong>Crown Media Group</strong><br>
    <a href="https://crownmediagroup.co" style="color: #1a56db;">crownmediagroup.co</a><br>
    (908) 848-1436
  </p>
</div>`;

  const text = `Hey ${greeting},\n\nLast note from me — I promise.\n\nIf the timing isn't right for ${churchName} right now, I completely understand. Ministry seasons are real.\n\nBut if you ever want to talk about reaching more people online — I'm here. Just reply to this email or call me at (908) 848-1436.\n\n— David King\nCrown Media Group\ncrownmediagroup.co\n(908) 848-1436`;

  return { html, text, subject: `Last note — ${churchName}` };
}

// ── CSV parser ─────────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const fields = []; let field = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { field += '"'; i++; } else { inQ = !inQ; } }
    else if (ch === ',' && !inQ) { fields.push(field.trim()); field = ''; }
    else { field += ch; }
  }
  fields.push(field.trim());
  return fields;
}

// ── Resend sender ─────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html, text) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${FROM_NAME} <${FROM}>`, to, subject, html, text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data.id;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(BATCH_CSV)) {
    console.error('gmass-next-batch.csv not found');
    process.exit(1);
  }

  const lines = fs.readFileSync(BATCH_CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  const churches = lines.slice(1).map(line => {
    const [ChurchName, PastorName, Email] = parseCsvLine(line);
    return { ChurchName, PastorName, Email };
  }).filter(c => c.Email && c.Email.includes('@') && !SKIP_LIST.has(c.Email.toLowerCase()));

  const label = DAY === 3 ? 'Day 3 Follow-up' : 'Day 7 Final';
  console.log(`\n Church Batch 2 — ${label}`);
  console.log(`   Mode: ${IS_DRY ? 'DRY RUN' : IS_TEST ? 'TEST' : 'LIVE'}`);
  console.log(`   Churches: ${churches.length} (${SKIP_LIST.size} skipped — replied)`);
  console.log(`   From: ${FROM}\n`);

  let sent = 0, failed = 0;
  const results = [];

  for (const church of churches) {
    const to = IS_TEST ? TEST_TO : church.Email;
    const { html, text, subject } = DAY === 3
      ? buildDay3Email(church.ChurchName, church.PastorName)
      : buildDay7Email(church.ChurchName, church.PastorName);

    if (IS_DRY) {
      console.log(`  [DRY] ${church.ChurchName} → ${church.Email} | ${subject}`);
      results.push({ church: church.ChurchName, email: church.Email, status: 'dry-run' });
      continue;
    }

    try {
      const id = await sendEmail(to, subject, html, text);
      console.log(`  + ${church.ChurchName} → ${to} (${id})`);
      results.push({ church: church.ChurchName, email: church.Email, status: 'sent', id });
      sent++;
    } catch (err) {
      console.error(`  x ${church.ChurchName} → ${church.Email}: ${err.message}`);
      results.push({ church: church.ChurchName, email: church.Email, status: 'failed', error: err.message });
      failed++;
    }

    await sleep(DELAY_MS);
  }

  const today = new Date().toISOString().split('T')[0];
  const logEntry = `# Outreach Follow-up — Day ${DAY} — ${today}\n\n**Sent:** ${sent}/${churches.length} | **Failed:** ${failed} | **Mode:** ${IS_DRY ? 'DRY RUN' : IS_TEST ? 'TEST' : 'LIVE'}\n\n${results.map(r => `- [${r.status.toUpperCase()}] ${r.church} → ${r.email}${r.error ? ' (' + r.error + ')' : ''}`).join('\n')}\n\n---\n`;

  const existing = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
  fs.writeFileSync(LOG_FILE, logEntry + existing, 'utf8');

  console.log(`\n Done. Sent: ${sent} | Failed: ${failed}`);
  console.log(`  Log: Agency/ops/notes/OUTREACH-LOG.md\n`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
