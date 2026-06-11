#!/usr/bin/env node
// clean-inbox.js — Direct IMAP inbox cleaner for king@crownmediagroup.co
// Uses GMAIL_USER + GMAIL_APP_PASSWORD from .env (already set up for Resend send).
//
// Usage:
//   node tools/kingdom-reach/clean-inbox.js              # LIVE — actually moves messages
//   node tools/kingdom-reach/clean-inbox.js --dry-run    # report what WOULD happen
//
// Rules:
//   1. Trash hard spam (loan/mortgage/weight-loss spam patterns)
//   2. Archive vendor noise (Chess.com, YouTube TV, HeyGen, Recraft, Suno, etc.)
//   3. STAR + label "🚨 URGENT/Billing" — payments-noreply@google.com
//   4. STAR + label "🔐 Security" — Google security alerts
//   5. Mark as read for all archives

import { ImapFlow } from 'imapflow';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

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

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) { console.error('GMAIL_USER + GMAIL_APP_PASSWORD required in .env'); process.exit(1); }

// ─── Categorization rules ───────────────────────────────────────────────────
const RULES = [
  // P0 — STAR + label
  {
    name: '🚨 URGENT Billing (payments-noreply@google.com)',
    match: env => /payments-noreply@google\.com/i.test(env.from?.[0]?.address || ''),
    action: 'flag_label',
    label: '🚨 URGENT/Billing',
  },
  {
    name: '🔐 Security alerts',
    match: env => /security|new sign-in|suspicious activity|account.was.signed/i.test(env.subject || '')
      && /accounts\.google\.com|security@google/i.test(env.from?.[0]?.address || ''),
    action: 'flag_label',
    label: '🔐 Security',
  },

  // Client analytics
  {
    name: 'Crown Clients/Analytics (Microsoft Clarity)',
    match: env => /maccount@microsoft\.com/i.test(env.from?.[0]?.address || '') && /Clarity/i.test(env.subject || ''),
    action: 'label',
    label: 'Crown Clients/Analytics',
  },

  // Hard spam — TRASH
  {
    name: 'TRASH — loan/mortgage/weight-loss/scam spam',
    match: env => {
      const from = (env.from?.[0]?.address || '').toLowerCase();
      const subj = (env.subject || '').toLowerCase();
      const spamDomains = [
        'gread.victoriaproco.com', 'manofmany.tyt', 'nm3-etouches.paperial.net',
        'half-644.againsthim.net', 'soncezsol.net', 'disk-com.infrequentlyan.com',
        'sbiksla.quechoisir.org', 'superbking.net', 'aeroflot.ru', 'bankmobilewebemail.com',
        'contorted.penphase.com', 'ermatat.com', 'it3184.shitside.com', 'tsvangirai.ranllczid.store',
        'finalcall.com', 'culets-a897.validcove.com', 'public-osi.buildstrike.com',
        'mail-hfvezoe.c5cjq50kbv.smartweak.com', 'pliant.hexawalk.com', 'comingsweet.com',
        'value-now.focusshapes.net', 'hurtfulmono.com', 'paidweave.us', 'essinflammable.net',
        'propet.worfive.com', 'site.bothextra.eu',
      ];
      if (spamDomains.some(d => from.includes(d))) return true;
      const spamSubjects = [
        "you're approved", 'house payment', 'personalloan', 'loanmanager', 'homeprotect',
        'protectyourhome', 'bye bye fat', 'end of obesity', 'natural pain relief',
        'adt premier', 'home_warranty', 'home-warranty', 'free trial', 'auto warranty',
        'final notice', 'last chance to claim', 'congratulations you', 'fidelity life',
      ];
      if (spamSubjects.some(s => subj.includes(s))) return true;
      return false;
    },
    action: 'trash',
    label: '💩 Spam Trash',
  },

  // Chess.com — archive
  {
    name: 'Archive — Chess.com (King doesn\'t want)',
    match: env => /chess\.com/i.test(env.from?.[0]?.address || ''),
    action: 'archive',
    label: 'Vendor Noise',
  },

  // YouTube TV — archive
  {
    name: 'Archive — YouTube TV (King doesn\'t want)',
    match: env => /noreply-purchases@youtube\.com|youtube tv/i.test((env.from?.[0]?.address || '') + ' ' + (env.subject || '')),
    action: 'archive',
    label: 'Receipts/Streaming',
  },

  // Other vendor noise
  {
    name: 'Archive — vendor newsletters',
    match: env => {
      const from = (env.from?.[0]?.address || '').toLowerCase();
      const noiseFroms = [
        'email@seller.etsy.com', 'email@email.etsy.com',
        'suno@creators.suno.com',
        'no_reply@email.heygen.com', 'no_reply@learn.heygen.com',
        'info@recraft.ai',
        'workspace-noreply@google.com',
        'noreply@x.ai',
        'updates@product.exa.ai',
        'ajay@wordzen.com',
        'noreply@skool.com',
        'news@insideapple.apple.com',
        'notifications@fountain.com',
        '@medallia.com',
        'survey@hm.com',
        'billing@fly.io',
      ];
      return noiseFroms.some(d => from.includes(d));
    },
    action: 'archive',
    label: 'Vendor Noise',
  },

  // Mailer-daemon bounces
  {
    name: 'Archive — bounces',
    match: env => /mailer-daemon@|postmaster@/i.test(env.from?.[0]?.address || ''),
    action: 'archive',
    label: 'Crown CRM/Bounces',
  },

  // Logo Review Overdue test spam
  {
    name: 'Archive — Logo Review TEST spam',
    match: env => /Logo Review Overdue/i.test(env.subject || '')
      && /Final Verify Test/i.test(env.subject || env.snippet || ''),
    action: 'archive',
    label: 'Crown AI Tools/Test Spam',
  },

  // CRM replies — label + keep in inbox
  {
    name: 'Crown CRM/Replies',
    match: env => /^Re: (Helping|A free first project|Crown Media)/i.test(env.subject || ''),
    action: 'label',
    label: 'Crown CRM/Replies',
  },
];

async function ensureLabel(client, labelName) {
  try {
    const list = await client.list();
    if (list.find(box => box.path === labelName)) return;
    await client.mailboxCreate(labelName);
  } catch (e) { /* may already exist */ }
}

async function main() {
  console.log(`Inbox cleaner — ${GMAIL_USER}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN (report only)' : 'LIVE (actually moves messages)'}`);
  console.log('');

  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    logger: false,
  });

  await client.connect();

  // Pre-create all labels we use
  const allLabels = [...new Set(RULES.map(r => r.label).filter(Boolean))];
  if (!DRY_RUN) {
    for (const lbl of allLabels) {
      await ensureLabel(client, lbl);
    }
  }

  const lock = await client.getMailboxLock('INBOX');
  const stats = { total: 0, matched: 0, archived: 0, trashed: 0, labeled: 0, starred: 0, by_rule: {} };

  try {
    // Get ALL messages in inbox (not just unread)
    const uids = await client.search({ all: true });
    stats.total = uids.length;
    console.log(`Total messages in INBOX: ${stats.total}`);
    console.log('');

    // Process in batches of 50 for performance
    const BATCH = 50;
    for (let i = 0; i < uids.length; i += BATCH) {
      const batch = uids.slice(i, i + BATCH);
      const msgs = await client.fetchAll(batch.join(','), { envelope: true, uid: true });

      for (const msg of msgs) {
        const env = msg.envelope;
        if (!env) continue;

        // Find first matching rule
        let matched = null;
        for (const rule of RULES) {
          try {
            if (rule.match(env)) { matched = rule; break; }
          } catch { /* rule errored, skip */ }
        }
        if (!matched) continue;

        stats.matched++;
        stats.by_rule[matched.name] = (stats.by_rule[matched.name] || 0) + 1;

        if (DRY_RUN) continue;

        try {
          // Apply label first
          if (matched.label) {
            await client.messageMove(msg.uid, matched.label, { uid: true }).catch(async () => {
              // If move fails, try copy + flag
              await client.messageCopy(msg.uid, matched.label, { uid: true }).catch(() => {});
            });
          }

          switch (matched.action) {
            case 'trash':
              await client.messageMove(msg.uid, '[Gmail]/Trash', { uid: true }).catch(()=>{});
              stats.trashed++;
              break;
            case 'archive':
              // Remove INBOX label (archive)
              await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true }).catch(()=>{});
              await client.messageMove(msg.uid, '[Gmail]/All Mail', { uid: true }).catch(()=>{
                // Try removing INBOX via store
              });
              stats.archived++;
              break;
            case 'flag_label':
              await client.messageFlagsAdd(msg.uid, ['\\Flagged'], { uid: true }).catch(()=>{});
              stats.starred++;
              stats.labeled++;
              break;
            case 'label':
              stats.labeled++;
              break;
          }
        } catch (e) {
          // skip individual message errors
        }
      }
      process.stdout.write(`\rProcessed: ${Math.min(i + BATCH, uids.length)}/${uids.length} · matched: ${stats.matched}`);
    }
  } finally {
    lock.release();
    await client.logout();
  }

  console.log('');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  INBOX CLEAN COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total in inbox:    ${stats.total}`);
  console.log(`Matched rule:      ${stats.matched}`);
  console.log(`Trashed:           ${stats.trashed}`);
  console.log(`Archived:          ${stats.archived}`);
  console.log(`Labeled:           ${stats.labeled}`);
  console.log(`Starred:           ${stats.starred}`);
  console.log(`Remaining in inbox: ${stats.total - stats.archived - stats.trashed}`);
  console.log('');
  console.log('By rule:');
  for (const [rule, n] of Object.entries(stats.by_rule).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)} · ${rule}`);
  }
  console.log('');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
