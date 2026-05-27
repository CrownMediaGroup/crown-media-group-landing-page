#!/usr/bin/env node
// tools/kingdom-reach/check-replies.mjs
// Reads recent Gmail replies via IMAP, classifies each via reply-classifier.js,
// patches CRM with classification + status + notes, alerts King for hot leads.
//
// Usage:
//   ANTHROPIC_API_KEY=... SEED_TOKEN=... node tools/kingdom-reach/check-replies.mjs [--since=2026-05-22] [--dry-run]
//
// - --since=YYYY-MM-DD : only process emails received since this date (default: 7 days ago)
// - --dry-run          : print classifications without patching CRM

import { ImapFlow } from 'imapflow';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classifyReply, classificationToCrmAction } from './reply-classifier.js';
import { emit } from './herald.js';
import { appendEvent } from './archive.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const sinceArg = args.find(a => a.startsWith('--since='));
const SINCE = sinceArg ? new Date(sinceArg.split('=')[1]) : new Date(Date.now() - 7 * 24 * 3600 * 1000);

// Load .env from repo root if env not already set
function loadEnv() {
  const envPath = join(__dirname, '..', '..', '.env');
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      if (line.startsWith('#') || !line.includes('=')) continue;
      const [k, ...rest] = line.split('=');
      const key = k.trim();
      if (!process.env[key]) process.env[key] = rest.join('=').trim();
    }
  } catch { /* .env optional in prod */ }
}
loadEnv();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
const SEED_TOKEN = process.env.SEED_TOKEN;
const CRM_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) { console.error('GMAIL_USER + GMAIL_APP_PASSWORD required'); process.exit(1); }
if (!SEED_TOKEN) { console.error('SEED_TOKEN required'); process.exit(1); }

console.log(`Reply Classifier — Crown Media Group`);
console.log(`Inbox: ${GMAIL_USER}`);
console.log(`Since: ${SINCE.toISOString().slice(0,10)}`);
console.log(`Mode:  ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}\n`);

// ── 1. Fetch CRM records to cross-reference ─────────────────────────────────
const churchesRes = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${SEED_TOKEN}`);
const churchesData = await churchesRes.json();
const churches = churchesData.churches || [];
const churchByEmail = new Map();
for (const c of churches) {
  if (c.email) churchByEmail.set(c.email.toLowerCase().trim(), c);
}
console.log(`Loaded ${churches.length} CRM records (${churchByEmail.size} with emails)\n`);

// ── 2. Connect to Gmail IMAP ────────────────────────────────────────────────
const client = new ImapFlow({
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  logger: false,
});

await client.connect();
const lock = await client.getMailboxLock('INBOX');

try {
  // Search for recent inbound messages (not sent by us)
  const uids = await client.search({ since: SINCE, not: { from: GMAIL_USER } });
  console.log(`Found ${uids.length} candidate messages since ${SINCE.toISOString().slice(0,10)}\n`);

  const results = { classified: 0, matched: 0, hot_leads: 0, by_category: {} };

  for (const uid of uids) {
    const msg = await client.fetchOne(uid, { envelope: true, source: true });
    if (!msg) continue;

    const env = msg.envelope || {};
    const fromEmail = (env.from && env.from[0] && env.from[0].address || '').toLowerCase().trim();
    if (!fromEmail) continue;

    const church = churchByEmail.get(fromEmail);
    if (!church) continue;  // Not a CRM record — skip
    results.matched++;

    // Skip if already marked replied (don't reclassify)
    if (church.replied && church.replied_at) {
      const repliedAt = new Date(church.replied_at);
      if (repliedAt >= new Date(env.date || 0)) continue;
    }

    // Extract body (plain text preferred)
    const raw = msg.source ? msg.source.toString('utf8') : '';
    const bodyMatch = raw.split(/\r?\n\r?\n/).slice(1).join('\n\n').slice(0, 8000);

    process.stdout.write(`  [${results.matched}] ${church.name.slice(0,40).padEnd(40)} ← ${fromEmail.slice(0,35).padEnd(35)} `);

    // Throttle BEFORE call — free tier: 5 RPM for flash-latest → 13 sec/call safe
    if (results.matched > 1) await new Promise(r => setTimeout(r, 13000));

    let classification;
    try {
      classification = await classifyReply({
        subject: env.subject || '',
        body: bodyMatch,
        sender: fromEmail,
        recipient: GMAIL_USER,
      });
    } catch (err) {
      console.log(`CLASSIFY ERR: ${(err.message||String(err)).slice(0,300)}`);
      continue;
    }

    results.classified++;
    results.by_category[classification.category] = (results.by_category[classification.category] || 0) + 1;
    if (classification.category === 'positive_interest') results.hot_leads++;

    process.stdout.write(`${classification.category.padEnd(22)} (${classification.confidence.toFixed(2)})\n`);
    if (classification.key_extract) console.log(`       "${classification.key_extract}"`);

    if (DRY_RUN) continue;

    // Patch CRM
    const action = classificationToCrmAction(classification, church.notes);
    const patchRes = await fetch(`${CRM_URL}/api/kingdom-reach/churches/${church.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: SEED_TOKEN, ...action.crm_patch }),
    });

    if (!patchRes.ok) {
      console.log(`       PATCH FAILED: ${patchRes.status}`);
    } else if (action.alert_king) {
      console.log(`       → ${action.route}  [ALERTED]`);
    }
  }

  console.log('\n─── Summary ───');
  console.log(`Matched CRM records: ${results.matched}`);
  console.log(`Classified:          ${results.classified}`);
  console.log(`Hot leads:           ${results.hot_leads}`);
  console.log(`By category:`);
  for (const [cat, n] of Object.entries(results.by_category).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${cat.padEnd(25)} ${n}`);
  }

  // HERALD + ARCHIVE — log sweep completion (Constitutional Laws 11 + 14)
  try {
    appendEvent({
      agent: 'RADAR',
      entity_type: 'reply_sweep',
      entity_id: `gmail-sweep-${new Date().toISOString().slice(0,10)}`,
      action: 'classify_batch',
      fields: { matched: results.matched, classified: results.classified, hot_leads: results.hot_leads, by_category: results.by_category, mode: DRY_RUN ? 'dry-run' : 'live' },
      source: 'check-replies.mjs',
    });
    emit({
      agent: 'RADAR',
      severity: results.hot_leads > 0 ? 'P0' : (results.classified > 0 ? 'P1' : 'P3'),
      action: `Gmail sweep — ${results.classified} classified, ${results.hot_leads} hot leads`,
      detail: results.hot_leads > 0 ? '🔔 POSITIVE INTEREST detected — CLOSER prep queue' : `By category: ${Object.entries(results.by_category).map(([k,v])=>`${k}=${v}`).join(', ')}`,
      next: results.hot_leads > 0 ? 'CLOSER drafts response within 4 hrs' : 'Standby — next sweep in 4 hrs',
    });
  } catch (e) { console.warn('[HERALD/ARCHIVE wire-up failed]', e.message); }

} finally {
  lock.release();
  await client.logout();
}
