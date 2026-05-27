#!/usr/bin/env node
// send-pitch-emails.mjs — throttled Gmail SMTP send of personalized pitch PDFs
//
// Reads manifest CSV from build-pitch-batch.mjs, sends one email per row,
// attaches the pre-built PDF, throttles between sends, marks email_sent=1 in CRM.
//
// Usage:
//   SEED_TOKEN=... node send-pitch-emails.mjs [--dry-run] [--limit N] [--test-only]
//
//   --dry-run     : skip actually sending; print what would be done
//   --limit N     : only send first N (default: all)
//   --test-only   : send 1 email to ldavid226@gmail.com (verify deliverability + look)

import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { emit } from '../../../tools/kingdom-reach/herald.js';
import { appendEvent } from '../../../tools/kingdom-reach/archive.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Env ────────────────────────────────────────────────────────────────────
const SEED_TOKEN = process.env.SEED_TOKEN;
if (!SEED_TOKEN) { console.error('SEED_TOKEN env var not set'); process.exit(1); }

// Load Gmail creds from .env (already-existing file)
function loadEnv() {
  const envPath = join(__dirname, '..', '..', '..', '.env');
  if (!existsSync(envPath)) { console.error('.env not found at', envPath); process.exit(1); }
  const content = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    env[k.trim()] = rest.join('=').trim();
  }
  return env;
}
const env = loadEnv();
const GMAIL_USER = env.GMAIL_USER;
const GMAIL_APP_PASSWORD = env.GMAIL_APP_PASSWORD;
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('GMAIL_USER + GMAIL_APP_PASSWORD must be in .env');
  process.exit(1);
}

// ── Args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const TEST_ONLY = args.includes('--test-only');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

// ── Constants ──────────────────────────────────────────────────────────────
const CRM_URL = 'https://crm.crownmediagroup.co';
const THROTTLE_MS = 30_000;  // 30 seconds between sends — 130 emails = ~65 min
const LEAVE_BEHINDS_DIR = join(__dirname, 'leave-behinds');

// ── First-name extraction ──────────────────────────────────────────────────
function firstNameFrom(pastor) {
  if (!pastor) return 'Friend';
  const cleaned = String(pastor).replace(/^(dr\.?|rev\.?|pastor|fr\.?|sr\.?|brother|sister|deacon|elder|bishop|mr\.?|mrs\.?|ms\.?)\s+/i, '');
  const first = cleaned.split(/[\s\(]/)[0];
  if (!first) return 'Friend';
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

// ── Email body templates ───────────────────────────────────────────────────
function emailBody({ name, firstName, orgType }) {
  const isSchool = orgType === 'school';
  const isMissionOrNonprofit = ['nonprofit','missions','recovery','prison','men','women','mixed','network','media','youth'].includes(orgType);

  const orgPhrase = isSchool
    ? `families discover what you're building at ${name}`
    : isMissionOrNonprofit
      ? `more people connect with ${name}'s mission`
      : `more people connect with ${name}`;

  return {
    text: `Hi ${firstName},

I'm David King, founder of Crown Media Group — faith-aligned marketing and media based in Columbia, SC.

I put together a one-page personalized offering for ${name}. It outlines what I'd love to build for you at no cost, no commitment. It's attached to this email.

The short version: I want to help ${orgPhrase} online. AI-powered video reels, custom website, social media management, brand identity, royalty-free music — pick whatever would actually serve you and I'll build it free as a first project. If it helps, we talk. If it doesn't, you keep the work.

This is Kingdom economy — give first, talk later (Luke 6:38).

The attached PDF has the details. Would love a yes, no, or "tell me more."

In Christ's service,

King
David King
Founder, Crown Media Group
(908) 848-1436  |  king@crownmediagroup.co
crownmediagroup.co`,
    subject: `A free first project for ${name}`,
  };
}

// ── Parse manifest CSV ─────────────────────────────────────────────────────
function parseManifest() {
  // find latest manifest
  const today = new Date().toISOString().slice(0, 10);
  const candidates = [
    join(LEAVE_BEHINDS_DIR, `manifest-${today}.csv`),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      const header = lines[0].split(',');
      return lines.slice(1).map(line => {
        // CSV with quoted fields — simple parser
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
        header.forEach((h, i) => row[h.trim()] = (fields[i]||'').trim());
        return row;
      });
    }
  }
  console.error('No manifest CSV found in', LEAVE_BEHINDS_DIR);
  process.exit(1);
}

// ── Mark CRM email_sent ────────────────────────────────────────────────────
async function markSent(churchId) {
  const resp = await fetch(`${CRM_URL}/api/kingdom-reach/churches/${churchId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: SEED_TOKEN,
      email_sent: 1,
      email_sent_at: new Date().toISOString(),
      status: 'Pitched',
      notes: `Pitch PDF emailed 2026-05-22 via Gmail SMTP. Personalized one-pager attached.`,
    }),
  });
  return resp.ok;
}

// ── Transporter ────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s/g, '') },  // strip spaces from app password
});

// ── Main ───────────────────────────────────────────────────────────────────
const manifest = parseManifest();
console.log('Manifest entries:', manifest.length);

let targets = manifest.slice(0, LIMIT === Infinity ? manifest.length : LIMIT);

if (TEST_ONLY) {
  // single test send to King himself
  const first = manifest[0];
  targets = [{ ...first, email: 'ldavid226@gmail.com', name: first.name + ' (TEST)' }];
  console.log('TEST MODE: sending one email to ldavid226@gmail.com with', first.name + "'s PDF attached");
}

console.log('');
console.log(`Will send to: ${targets.length}`);
console.log(`Throttle: ${THROTTLE_MS/1000}s between sends`);
console.log(`Estimated total: ${Math.ceil(targets.length * THROTTLE_MS / 60000)} minutes`);
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (no emails sent)' : 'LIVE SEND'}`);
console.log('');

// Verify transporter before any send
if (!DRY_RUN && !TEST_ONLY) {
  console.log('Verifying SMTP connection...');
  try {
    await transporter.verify();
    console.log('SMTP OK.\n');
  } catch (e) {
    console.error('SMTP verify failed:', e.message);
    process.exit(1);
  }
}

const results = { sent: 0, failed: 0, errors: [] };

for (let i = 0; i < targets.length; i++) {
  const row = targets[i];
  const churchId = row.church_id;
  const name = row.name;
  const email = row.email;
  const pastor = row.pastor;
  const firstName = firstNameFrom(pastor);
  const orgType = row.org_type || 'church';
  const pdfPath = row.pdf_path;

  if (!existsSync(pdfPath)) {
    console.log(`[${i+1}/${targets.length}] id=${churchId} FAILED: PDF missing at ${pdfPath}`);
    results.failed++;
    results.errors.push({ id: churchId, error: 'PDF missing' });
    continue;
  }

  const body = emailBody({ name, firstName, orgType });

  if (DRY_RUN) {
    console.log(`[${i+1}/${targets.length}] DRY: would send to ${email} subject="${body.subject}" attach=${row.pdf_filename}`);
    results.sent++;
    continue;
  }

  try {
    const info = await transporter.sendMail({
      from: `"David King — Crown Media Group" <${GMAIL_USER}>`,
      to: email,
      subject: body.subject,
      text: body.text,
      attachments: [{ filename: row.pdf_filename, path: pdfPath }],
    });
    console.log(`[${i+1}/${targets.length}] id=${churchId} SENT → ${email}  msgId=${info.messageId.slice(0,40)}`);
    if (!TEST_ONLY) await markSent(churchId);
    results.sent++;
  } catch (e) {
    console.log(`[${i+1}/${targets.length}] id=${churchId} FAILED → ${email}: ${e.message.slice(0,120)}`);
    results.failed++;
    results.errors.push({ id: churchId, email, error: e.message });
  }

  // throttle between sends — but not after the last one
  if (i < targets.length - 1 && !TEST_ONLY) {
    await new Promise(r => setTimeout(r, THROTTLE_MS));
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`SENT:   ${results.sent}`);
console.log(`FAILED: ${results.failed}`);
console.log('═══════════════════════════════════════════════════════════════');

// HERALD + ARCHIVE — log batch completion (Constitutional Laws 11 + 14)
try {
  appendEvent({
    agent: 'WORDSMITH',
    entity_type: 'campaign',
    entity_id: `send-pitch-emails-${new Date().toISOString().slice(0,10)}`,
    action: 'batch_complete',
    fields: { sent: results.sent, failed: results.failed, total: targets.length, mode: DRY_RUN ? 'dry-run' : TEST_ONLY ? 'test-only' : 'live' },
    source: 'send-pitch-emails.mjs',
  });
  emit({
    agent: 'WORDSMITH',
    severity: results.failed > 0 ? 'P1' : 'P2',
    action: `Pitch batch complete — ${results.sent} sent, ${results.failed} failed`,
    detail: DRY_RUN ? 'dry-run only' : (TEST_ONLY ? 'test-only mode' : `${targets.length} prospects targeted`),
    next: 'RADAR sweeps Gmail for replies in 24-72 hr Hormozi window',
  });
} catch (e) { console.warn('[HERALD/ARCHIVE wire-up failed]', e.message); }
if (results.errors.length) {
  console.log('\nErrors:');
  for (const e of results.errors) console.log(`  id=${e.id}${e.email ? ' (' + e.email + ')' : ''}: ${e.error}`);
}
