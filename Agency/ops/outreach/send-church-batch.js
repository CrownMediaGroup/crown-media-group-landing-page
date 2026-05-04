/**
 * send-church-batch.js — Church Outreach Email Blaster
 * Reads gmass-next-batch.csv, sends personalized emails via Resend API.
 * Logs every result to OUTREACH-LOG.md.
 *
 * Usage:
 *   node send-church-batch.js            ← live send
 *   node send-church-batch.js --dry-run  ← preview only, no sends
 *   node send-church-batch.js --test     ← send all to king@crownmediagroup.co
 */

const fs   = require('fs');
const path = require('path');

// Load env
for (const p of [path.join(__dirname, '../../../.env'), path.join(__dirname, '.env')]) {
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

const RESEND_KEY  = process.env.RESEND_API_KEY || 're_Kg1npkbf_EeeVDXvGLMyV3NM9R5hFzJ8F';
const FROM        = 'king@crownmediagroup.co';
const FROM_NAME   = 'David King | Crown Media Group';
const SUBJECT     = 'Your Ministry Deserves a Bigger Reach';
const BATCH_CSV   = path.join(__dirname, 'gmass-next-batch.csv');
const LOG_FILE    = path.join(__dirname, '../../ops/notes/OUTREACH-LOG.md');
const LAST_RUN    = path.join(__dirname, '../../ops/notes/.outreach-last-run');
const DELAY_MS    = 1200; // 1.2s between sends — stays under Resend rate limit

// ── Email template ─────────────────────────────────────────────────────────────
function buildEmail(churchName, pastorName) {
  const firstName = pastorName && pastorName !== 'Pastor' ? pastorName.split(' ')[0] : null;
  const greeting = firstName || 'Pastor';
  const html = `
<div style="font-family: Arial, sans-serif; font-size: 15px; color: #1a1a1a; max-width: 580px; line-height: 1.6;">
  <p>Hey ${greeting},</p>

  <p>The work happening at <strong>${churchName}</strong> is impacting lives — and it deserves a bigger reach.</p>

  <p>I help faith communities in Columbia use social media strategically — not just to post, but to draw people in who need what God is doing there.</p>

  <p>Would it be valuable to have a plan for that?</p>

  <p style="margin-top: 28px;">
    — David King<br>
    <strong>Crown Media Group</strong><br>
    <a href="https://crownmediagroup.co" style="color: #1a56db;">crownmediagroup.co</a><br>
    (908) 848-1436
  </p>
</div>`;

  const text = `Hey ${greeting},\n\nThe work happening at ${churchName} is impacting lives — and it deserves a bigger reach.\n\nI help faith communities in Columbia use social media strategically — not just to post, but to draw people in who need what God is doing there.\n\nWould it be valuable to have a plan for that?\n\n— David King\nCrown Media Group\ncrownmediagroup.co\n(908) 848-1436`;

  return { html, text };
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
    console.error('gmass-next-batch.csv not found — run build-next-batch.js first');
    process.exit(1);
  }

  const lines = fs.readFileSync(BATCH_CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  const churches = lines.slice(1).map(line => {
    const [ChurchName, PastorName, Email] = parseCsvLine(line);
    return { ChurchName, PastorName, Email };
  }).filter(c => c.Email && c.Email.includes('@'));

  console.log(`\n📋 Church Batch 2 Email Blast`);
  console.log(`   Mode: ${IS_DRY ? 'DRY RUN' : IS_TEST ? 'TEST' : 'LIVE'}`);
  console.log(`   Churches: ${churches.length}`);
  console.log(`   From: ${FROM}\n`);

  let sent = 0, failed = 0;
  const results = [];

  for (const church of churches) {
    const to = IS_TEST ? TEST_TO : church.Email;
    const { html, text } = buildEmail(church.ChurchName, church.PastorName);

    if (IS_DRY) {
      console.log(`  [DRY] ${church.ChurchName} → ${church.Email}`);
      results.push({ church: church.ChurchName, email: church.Email, status: 'dry-run' });
      continue;
    }

    try {
      const id = await sendEmail(to, SUBJECT, html, text);
      console.log(`  ✓ ${church.ChurchName} → ${to} (${id})`);
      results.push({ church: church.ChurchName, email: church.Email, status: 'sent', id });
      sent++;
    } catch (err) {
      console.error(`  ✗ ${church.ChurchName} → ${church.Email}: ${err.message}`);
      results.push({ church: church.ChurchName, email: church.Email, status: 'failed', error: err.message });
      failed++;
    }

    await sleep(DELAY_MS);
  }

  // ── Log results ─────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const logEntry = `# Outreach Log — ${today}\n\n**Sent:** ${sent}/${churches.length} | **Failed:** ${failed} | **Mode:** ${IS_DRY ? 'DRY RUN' : IS_TEST ? 'TEST' : 'LIVE'}\n\n${results.map(r => `- [${r.status.toUpperCase()}] ${r.church} → ${r.email}${r.error ? ' (' + r.error + ')' : ''}`).join('\n')}\n\n---\n`;

  const existing = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
  fs.writeFileSync(LOG_FILE, logEntry + existing, 'utf8');
  fs.writeFileSync(LAST_RUN, today, 'utf8');

  console.log(`\n✓ Done. Sent: ${sent} | Failed: ${failed}`);
  console.log(`  Log: Agency/ops/notes/OUTREACH-LOG.md\n`);
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
