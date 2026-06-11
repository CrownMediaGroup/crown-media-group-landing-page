#!/usr/bin/env node
// clean-personal.js — Aggressive personal Gmail inbox cleaner.
// For ldavid226-style accounts with thousands of unread messages.
//
// Strategy:
//   1. Group all inbox messages by sender domain
//   2. Senders with 20+ messages → bulk/noise → archive ALL
//   3. Senders with 5-19 messages → archive everything older than 90 days
//   4. Anything older than 1 year, unflagged, unstarred → archive
//   5. Trash hard spam (loan/mortgage/scam keyword + suspicious TLDs)
//   6. STAR + label payments-noreply (billing), security alerts
//   7. Keep: anything starred, anything from a person (no @noreply pattern), recent
//
// Usage:
//   GMAIL_USER=ldavid226@gmail.com GMAIL_APP_PASSWORD="..." node tools/kingdom-reach/clean-personal.js
//   --dry-run    report only, no moves

import { ImapFlow } from 'imapflow';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = join(__dirname, '..', '..', '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    const key = k.trim();
    if (!process.env[key]) process.env[key] = rest.join('=').trim();
  }
}
loadEnv();

const DRY_RUN = process.argv.includes('--dry-run');
// Allow --account=ldavid226 to override default king credentials
const useLDavid = process.argv.includes('--account=ldavid226') || process.argv.includes('--personal');
const GMAIL_USER = useLDavid ? (process.env.LDAVID226_GMAIL_USER || 'ldavid226@gmail.com') : process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = ((useLDavid ? process.env.LDAVID226_APP_PASSWORD : process.env.GMAIL_APP_PASSWORD) || '').replace(/\s/g, '');
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) { console.error('GMAIL_USER + GMAIL_APP_PASSWORD required'); process.exit(1); }

const ONE_YEAR_MS = 365 * 86400 * 1000;
const NINETY_DAYS_MS = 90 * 86400 * 1000;
const BULK_THRESHOLD = 20;   // senders with this many messages → bulk noise → archive all
const MEDIUM_THRESHOLD = 5;  // senders with this many messages → archive >90d

const HARD_SPAM_PATTERNS = [
  /you'?re approved/i, /house payment/i, /personalloan/i, /loanmanager/i,
  /homeprotect/i, /protectyourhome/i, /bye bye fat/i, /end of obesity/i,
  /natural pain relief/i, /adt premier/i, /home.warranty/i,
  /^final notice/i, /^last chance/i, /^congratulations you/i, /fidelity life/i,
  /^claim your/i, /your prize/i, /^win a /i, /weight loss/i,
];
const SUSPICIOUS_TLDS = /\.(tk|ml|ga|cf|gq|loan|click|country|win|biz|xyz|info|top|store|stream|trade|click|download|review|us\.com)$/i;
const NOREPLY_PATTERN = /(noreply|no-reply|no_reply|donotreply|do-not-reply|notifications?@|alerts?@|marketing@|newsletter@|info@|updates?@|deals?@|offers?@|promo@|automated@|mailer@|hello@|hi@|news@|team@|support@|admin@)/i;

const KEEP_DOMAINS = new Set([
  // Banking / financial — never auto-archive
  'navyfederal.org', 'chase.com', 'plaid.com', 'stripe.com', 'capitalone.com',
  'paypal.com', 'venmo.com', 'cashapp.com', 'wellsfargo.com', 'bankofamerica.com',
  'discover.com', 'amex.com', 'americanexpress.com',
  // Government / tax / legal
  'irs.gov', 'usps.com', 'ssa.gov', 'gov',
  // Insurance + medical
  'unitedhealthcare.com', 'cigna.com', 'kaiserpermanente.org',
]);

const STAR_PATTERNS = [
  { rx: /payments-noreply@google\.com/i,                  label: '🚨 URGENT/Billing' },
  { rx: /(?:^|\W)irs\.gov(?:\W|$)/i,                       label: '🚨 URGENT/Government' },
  { rx: /(?:^|\W)(ssa\.gov|medicare\.gov)(?:\W|$)/i,       label: '🚨 URGENT/Government' },
  { rx: /no-reply@accounts\.google\.com/i,                 label: '🔐 Security', subjectRx: /security|sign-?in/i },
  { rx: /security-noreply@/i,                              label: '🔐 Security' },
];

function getFromDomain(env) {
  const addr = env.from?.[0]?.address || '';
  const m = addr.match(/@(.+)$/);
  return m ? m[1].toLowerCase() : '';
}

function getFromAddress(env) {
  return (env.from?.[0]?.address || '').toLowerCase();
}

async function ensureLabel(client, name) {
  try {
    const list = await client.list();
    if (list.find(b => b.path === name)) return;
    await client.mailboxCreate(name);
  } catch {}
}

async function main() {
  console.log(`Personal inbox cleaner — ${GMAIL_USER}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log('');

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  await client.connect();
  const labels = ['Vendor Noise', 'Receipts/Shopping', 'Social Notifications', 'Newsletters', '🚨 URGENT/Billing', '🚨 URGENT/Government', '🔐 Security', '💩 Spam Trash', 'Archive/Auto'];
  if (!DRY_RUN) for (const lbl of labels) await ensureLabel(client, lbl);

  const lock = await client.getMailboxLock('INBOX');

  try {
    // ── Pass 1: scan envelopes, group by sender ─────────────────────────────
    console.log('Pass 1: scanning inbox + grouping by sender...');
    const uids = await client.search({ all: true });
    console.log(`Total: ${uids.length}`);

    const senders = new Map();  // domain → [{uid, env, date}]
    const allMsgs = [];
    const BATCH = 100;
    for (let i = 0; i < uids.length; i += BATCH) {
      const batch = uids.slice(i, i + BATCH);
      const msgs = await client.fetchAll(batch.join(','), { envelope: true, uid: true, flags: true });
      for (const m of msgs) {
        if (!m.envelope) continue;
        const domain = getFromDomain(m.envelope);
        const addr = getFromAddress(m.envelope);
        const date = m.envelope.date ? new Date(m.envelope.date) : new Date(0);
        const entry = { uid: m.uid, env: m.envelope, addr, domain, date, flags: m.flags || new Set() };
        allMsgs.push(entry);
        if (!senders.has(addr)) senders.set(addr, []);
        senders.get(addr).push(entry);
      }
      if (i % (BATCH * 5) === 0) process.stdout.write(`\r  scanned ${Math.min(i + BATCH, uids.length)}/${uids.length}`);
    }
    console.log('');
    console.log(`Unique senders: ${senders.size}`);
    console.log('');

    // ── Identify bulk senders ───────────────────────────────────────────────
    const bulkSenders = [...senders.entries()].filter(([, msgs]) => msgs.length >= BULK_THRESHOLD);
    const mediumSenders = [...senders.entries()].filter(([, msgs]) => msgs.length >= MEDIUM_THRESHOLD && msgs.length < BULK_THRESHOLD);
    console.log(`Top 10 bulk senders (≥${BULK_THRESHOLD} msgs each):`);
    bulkSenders.sort((a, b) => b[1].length - a[1].length).slice(0, 10).forEach(([addr, msgs]) => {
      console.log(`  ${String(msgs.length).padStart(4)} · ${addr}`);
    });
    console.log('');

    // ── Plan actions ────────────────────────────────────────────────────────
    const now = Date.now();
    const stats = { total: allMsgs.length, archived: 0, trashed: 0, starred: 0, labeled: 0, kept: 0 };
    const plan = [];  // {uid, action, label}

    const bulkAddrs = new Set(bulkSenders.map(([addr]) => addr));
    const mediumAddrs = new Set(mediumSenders.map(([addr]) => addr));

    for (const m of allMsgs) {
      const isStarred = m.flags.has('\\Flagged');
      const ageMs = now - m.date.getTime();
      const subj = m.env.subject || '';

      // KEEP rules — never touch
      if (isStarred) { stats.kept++; continue; }
      if (KEEP_DOMAINS.has(m.domain)) { stats.kept++; continue; }
      if (m.domain && [...KEEP_DOMAINS].some(d => m.domain.endsWith('.' + d) || m.domain === d)) { stats.kept++; continue; }

      // STAR rules — flag + label, keep in inbox
      let starred = false;
      for (const sp of STAR_PATTERNS) {
        if (sp.rx.test(m.addr) && (!sp.subjectRx || sp.subjectRx.test(subj))) {
          plan.push({ uid: m.uid, action: 'star', label: sp.label });
          starred = true;
          stats.starred++;
          stats.labeled++;
          break;
        }
      }
      if (starred) continue;

      // TRASH rules — hard spam
      const isTrash = HARD_SPAM_PATTERNS.some(rx => rx.test(subj)) || SUSPICIOUS_TLDS.test(m.domain);
      if (isTrash) {
        plan.push({ uid: m.uid, action: 'trash', label: '💩 Spam Trash' });
        stats.trashed++;
        continue;
      }

      // ARCHIVE — bulk senders (all messages)
      if (bulkAddrs.has(m.addr)) {
        const labelGuess = guessLabel(m.addr, subj);
        plan.push({ uid: m.uid, action: 'archive', label: labelGuess });
        stats.archived++;
        continue;
      }
      // ARCHIVE — medium senders, > 90 days old
      if (mediumAddrs.has(m.addr) && ageMs > NINETY_DAYS_MS) {
        const labelGuess = guessLabel(m.addr, subj);
        plan.push({ uid: m.uid, action: 'archive', label: labelGuess });
        stats.archived++;
        continue;
      }
      // ARCHIVE — anything > 1 year old AND from noreply-pattern address
      if (ageMs > ONE_YEAR_MS && NOREPLY_PATTERN.test(m.addr)) {
        plan.push({ uid: m.uid, action: 'archive', label: 'Archive/Auto' });
        stats.archived++;
        continue;
      }

      stats.kept++;
    }

    console.log('');
    console.log('PLAN:');
    console.log(`  archive: ${stats.archived}`);
    console.log(`  trash:   ${stats.trashed}`);
    console.log(`  star:    ${stats.starred}`);
    console.log(`  keep:    ${stats.kept}`);
    console.log('');

    if (DRY_RUN) { await client.logout(); return; }

    // ── Execute plan ────────────────────────────────────────────────────────
    console.log('Executing...');
    let done = 0;
    for (const p of plan) {
      try {
        if (p.action === 'trash') {
          await client.messageMove(p.uid, '[Gmail]/Trash', { uid: true }).catch(()=>{});
        } else if (p.action === 'archive') {
          await client.messageFlagsAdd(p.uid, ['\\Seen'], { uid: true }).catch(()=>{});
          if (p.label) await client.messageCopy(p.uid, p.label, { uid: true }).catch(()=>{});
          await client.messageMove(p.uid, '[Gmail]/All Mail', { uid: true }).catch(()=>{});
        } else if (p.action === 'star') {
          await client.messageFlagsAdd(p.uid, ['\\Flagged'], { uid: true }).catch(()=>{});
          if (p.label) await client.messageCopy(p.uid, p.label, { uid: true }).catch(()=>{});
        }
      } catch {}
      done++;
      if (done % 100 === 0) process.stdout.write(`\r  ${done}/${plan.length} actions`);
    }
    console.log('');
  } finally {
    lock.release();
    await client.logout();
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PERSONAL INBOX CLEAN COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

function guessLabel(addr, subj) {
  if (/youtube|spotify|netflix|hulu|disney|max\.com|paramount/i.test(addr)) return 'Receipts/Streaming';
  if (/amazon|ebay|etsy|shopify|@email\.amazon|@auto-confirm|@shopping/i.test(addr)) return 'Receipts/Shopping';
  if (/linkedin|facebook|twitter|instagram|tiktok|reddit/i.test(addr)) return 'Social Notifications';
  if (/newsletter|digest|weekly|monthly|update/i.test(addr + ' ' + subj)) return 'Newsletters';
  return 'Vendor Noise';
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
