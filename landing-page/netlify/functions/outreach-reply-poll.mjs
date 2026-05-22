// outreach-reply-poll.mjs — scheduled every 6h
//
// Connects to king@crownmediagroup.co Gmail via IMAP (app password),
// scans INBOX for new threads since last poll, classifies them
// (reply / unsubscribe / out-of-office / bounce), and updates the CRM.
//
// Manual trigger:
//   curl -X POST "https://crownmediagroup.co/.netlify/functions/outreach-reply-poll?dry=1"

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import {
  crmMarkReplied,
  crmMarkBounced,
  crmPatchChurch,
  crmFetchAllChurches,
  getWorkspaceSettings,
  setWorkspaceSetting,
  sendEmail,
} from './_outreach-helpers.mjs';

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const SUMMARY_RECIPIENT = 'king@crownmediagroup.co';
const MAX_MESSAGES_PER_RUN = 50;

function classifyMessage(subject, bodyText) {
  const subj = (subject || '').toLowerCase();
  const body = (bodyText || '').toLowerCase().slice(0, 500);

  // Bounce indicators
  if (subj.includes('mail delivery failed') || subj.includes('undelivered') || subj.includes('delivery status notification') || subj.includes('returned mail')) {
    return { type: 'bounce', reason: 'subject indicates bounce' };
  }
  if (body.includes('user unknown') || body.includes('mailbox unavailable') || body.includes('does not exist') || body.includes('554 5.1.1')) {
    return { type: 'bounce', reason: 'body indicates bounce' };
  }

  // Out-of-office / auto-reply
  if (subj.includes('out of office') || subj.includes('vacation') || subj.includes('auto-reply') || subj.includes('automatic reply') || subj.startsWith('autoreply')) {
    return { type: 'auto', reason: 'OOO/auto-reply detected' };
  }

  // Unsubscribe
  if (subj.includes('unsubscribe') || body.includes('please unsubscribe') || body.includes('remove me from your list') || body.includes('take me off') || body.includes('stop emailing')) {
    return { type: 'unsubscribe', reason: 'unsubscribe keyword' };
  }

  // Re: + non-empty body = real reply
  if (subj.startsWith('re:')) return { type: 'reply', reason: 'Re: prefix' };

  return { type: 'unknown', reason: 'no classifier matched' };
}

function extractEmailFromHeader(fromHeader) {
  if (!fromHeader) return null;
  const m = fromHeader.match(/<([^>]+)>/);
  if (m) return m[1].toLowerCase();
  const bare = fromHeader.trim().toLowerCase();
  if (bare.includes('@')) return bare;
  return null;
}

function extractBounceTargetEmail(bodyText, headers) {
  // Try common bounce-NDR patterns
  const patterns = [
    /(?:Failed Recipient|Original-Recipient|Final-Recipient|To):\s*(?:rfc822;)?\s*([^\s<>]+@[^\s<>]+)/i,
    /<([^@\s]+@[^@\s>]+)>:.*?(?:user unknown|does not exist|undeliver)/i,
    /(?:could not be delivered|undeliverable).*?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  ];
  for (const re of patterns) {
    const m = (bodyText || '').match(re);
    if (m && m[1]) return m[1].toLowerCase().trim();
  }
  return null;
}

export default async (req, _context) => {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    return Response.json({ ok: false, error: 'GMAIL_USER + GMAIL_APP_PASSWORD env required' }, { status: 500 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const started = Date.now();

  // Determine lookback window from workspace_settings
  const settings = await getWorkspaceSettings();
  const lastPoll = settings.last_reply_poll_at && settings.last_reply_poll_at.length > 0
    ? new Date(settings.last_reply_poll_at)
    : new Date(Date.now() - 24 * 3600 * 1000); // first-run fallback: 24h
  const now = new Date();

  const counts = { replies: 0, unsubs: 0, bounces: 0, autoReplies: 0, unknown: 0, errors: 0 };
  const replyDetails = [];

  // Pre-fetch CRM once for sender-email → record lookup
  let churches;
  try { churches = await crmFetchAllChurches(); }
  catch (e) { return Response.json({ ok: false, error: 'CRM fetch failed: ' + e.message }, { status: 500 }); }
  const churchByEmail = new Map();
  for (const c of churches) {
    if (c.email) churchByEmail.set(c.email.toLowerCase().trim(), c);
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s/g, '') },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Search for messages since lastPoll
      const uids = await client.search({ since: lastPoll }, { uid: true });
      const toProcess = uids.slice(-MAX_MESSAGES_PER_RUN); // newest N if list is huge

      for (const uid of toProcess) {
        try {
          const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
          if (!msg) continue;
          const parsed = await simpleParser(msg.source);
          const subject = parsed.subject || '';
          const fromAddr = extractEmailFromHeader(parsed.from?.text || '');
          const bodyText = parsed.text || '';
          const classification = classifyMessage(subject, bodyText);

          if (classification.type === 'reply' && fromAddr) {
            const record = churchByEmail.get(fromAddr);
            if (record && !record.replied) {
              if (!dryRun) await crmMarkReplied(fromAddr);
              counts.replies++;
              replyDetails.push({ from: fromAddr, name: record.name, subject: subject.slice(0, 80) });
            }
          } else if (classification.type === 'unsubscribe' && fromAddr) {
            const record = churchByEmail.get(fromAddr);
            if (record) {
              if (!dryRun) await crmPatchChurch(record.id, {
                unsubscribed: 1,
                unsubscribed_at: new Date().toISOString(),
                status: 'Unsubscribed',
                notes: ` [AUTO-UNSUB ${new Date().toISOString().slice(0,16)} from inbox subject: ${subject.slice(0, 60)}]`,
              });
              counts.unsubs++;
              replyDetails.push({ from: fromAddr, name: record.name, subject: subject.slice(0, 80), action: 'unsubscribed' });
            }
          } else if (classification.type === 'bounce') {
            const targetEmail = extractBounceTargetEmail(bodyText) || fromAddr;
            if (targetEmail) {
              if (!dryRun) await crmMarkBounced(targetEmail, classification.reason);
              counts.bounces++;
              replyDetails.push({ from: fromAddr, target: targetEmail, subject: subject.slice(0, 80), action: 'bounced' });
            }
          } else if (classification.type === 'auto') {
            counts.autoReplies++;
          } else {
            counts.unknown++;
          }
        } catch (e) {
          counts.errors++;
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    return Response.json({ ok: false, error: 'IMAP error: ' + e.message, counts }, { status: 500 });
  }

  // Update last_reply_poll_at
  if (!dryRun) await setWorkspaceSetting('last_reply_poll_at', now.toISOString());

  // Notify King if anything actionable
  if (!dryRun && (counts.replies > 0 || counts.unsubs > 0)) {
    const lines = replyDetails
      .filter(d => !d.action || d.action === 'unsubscribed')
      .map(d => d.action === 'unsubscribed'
        ? `   - ${d.name} (${d.from}) UNSUBSCRIBED`
        : `   - ${d.name} (${d.from}) replied: "${d.subject}"`)
      .join('\n');
    await sendEmail({
      to: SUMMARY_RECIPIENT,
      subject: `[Kingdom Reach] ${counts.replies} new replies, ${counts.unsubs} unsubscribes`,
      text: `Reply poll just finished at ${now.toISOString()}.

Replies: ${counts.replies}
Unsubscribes: ${counts.unsubs}
Bounces: ${counts.bounces}
Auto-replies (ignored): ${counts.autoReplies}

Actionable:
${lines}

Drafts to compose are on you — open Gmail and respond to any human replies.`,
    });
  }

  return Response.json({
    ok: true,
    dry_run: dryRun,
    polled_since: lastPoll.toISOString(),
    counts,
    elapsed_ms: Date.now() - started,
    sample: replyDetails.slice(0, 10),
  });
};
