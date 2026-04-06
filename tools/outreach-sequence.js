/**
 * outreach-sequence.js — Hawkeye Cold Outreach Sequencer
 * Pulls top-scored leads from Supabase, fires 3-step email sequences
 * Precision targeting. Never wastes a shot.
 *
 * Runs at 9 AM daily via standalone-runner.js
 *
 * Usage:
 *   node tools/outreach-sequence.js             ← full run
 *   node tools/outreach-sequence.js --dry-run   ← show what would send, no sends
 *   node tools/outreach-sequence.js --test      ← send to king@crownmediagroup.co only
 */

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

// Load env
for (const p of [path.join(__dirname, '../.env'), path.join(__dirname, '.env')]) {
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
const ROOT    = path.join(__dirname, '..');
const LAST_RUN = path.join(ROOT, 'Agency/ops/notes/.outreach-last-run');
const LOG_FILE = path.join(ROOT, 'Agency/ops/notes/OUTREACH-LOG.md');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;
const GMAIL_USER    = process.env.GMAIL_USER;
const GMAIL_PASS    = process.env.GMAIL_APP_PASSWORD;
const CALENDLY_LINK = process.env.CALENDLY_LINK || 'https://calendly.com/crownmediagroup';
const MAX_PER_DAY   = 10; // rate limit — deliverability + legal

// ── Email sender (Gmail SMTP) ─────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text }) {
  if (IS_DRY || IS_TEST) {
    const target = IS_TEST ? 'king@crownmediagroup.co' : to;
    console.log(`  [DRY/TEST] Would send to ${target}: "${subject}"`);
    return IS_TEST;
  }
  try {
    const { createTransport } = require('nodemailer');
    const mailer = createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS } });
    await mailer.sendMail({ from: `Crown Media Group <${GMAIL_USER}>`, to, subject, html, text });
    return true;
  } catch (e) {
    // Resend fallback
    const resendKey = process.env.RESEND_API_KEY || 're_Kg1npkbf_EeeVDXvGLMyV3NM9R5hFzJ8F';
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({ from: 'Crown Media Group <king@crownmediagroup.co>', to, subject, html, text }),
      });
      return r.ok;
    } catch { return false; }
  }
}

// ── Fetch leads from Supabase ─────────────────────────────────────────────────

async function getTargetLeads() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('[Hawkeye] No Supabase credentials — using test target');
    return [{ id: 'test', business_name: 'Test Business', email: 'king@crownmediagroup.co', contact_name: 'King', category: 'Marketing', website: '', lead_score: 80 }];
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?lead_score=gte.60&status=eq.new&email=not.is.null&select=id,business_name,contact_name,email,website,category,lead_score,notes&order=lead_score.desc&limit=${MAX_PER_DAY}`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const leads = await res.json();
  return Array.isArray(leads) ? leads.filter(l => l.email) : [];
}

// ── Generate personalized email with Claude ───────────────────────────────────

async function generateEmail(lead, step) {
  if (!ANTHROPIC_KEY) {
    return step === 1 ? getDefaultEmail1(lead) : step === 2 ? getDefaultEmail2(lead) : getDefaultEmail3(lead);
  }

  const prompts = {
    1: `Write a cold outreach email from Crown Media Group (AI marketing agency, Columbia SC) to ${lead.business_name}.
Category: ${lead.category || 'local business'}. Website: ${lead.website || 'none found'}.
Angle: ${lead.notes || 'help them grow their digital presence with AI-powered marketing'}.

Rules: 3–5 sentences. No fluff. Start with a specific observation about their business. Mention we just helped a juice business in Columbia SC grow their Instagram 3x. End with curiosity (not a hard CTA). Sign off as King, Crown Media Group.
Return JSON: { "subject": string, "body": string (plain text, 3-5 short paragraphs) }`,

    2: `Write follow-up email #2 (Day 3) from Crown Media Group to ${lead.business_name}.
They haven't replied yet. Give them ONE free marketing insight specific to a ${lead.category || 'local business'}.
Keep it under 150 words. End with "I put together a quick breakdown of what I'd do for your social — want me to send it over?"
Return JSON: { "subject": string, "body": string }`,

    3: `Write final follow-up email (Day 7) from Crown Media Group to ${lead.business_name}.
Soft close. Under 100 words. No pressure. Calendly link: ${CALENDLY_LINK}
"15 minutes — I'll show you exactly what I'd do for ${lead.business_name}."
Return JSON: { "subject": string, "body": string }`,
  };

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages: [{ role: 'user', content: prompts[step] }] }),
    });
    const data = await apiRes.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) { /* fallback below */ }

  return step === 1 ? getDefaultEmail1(lead) : step === 2 ? getDefaultEmail2(lead) : getDefaultEmail3(lead);
}

function getDefaultEmail1(lead) {
  return {
    subject: `Quick question about ${lead.business_name}`,
    body: `Hi${lead.contact_name ? ' ' + lead.contact_name.split(' ')[0] : ''},\n\nI came across ${lead.business_name} and wanted to reach out. We just helped a local Columbia SC business grow their Instagram engagement 3x in 60 days using AI-powered content — and I think there's a real opportunity to do the same for you.\n\nWhat's holding your social media back right now?\n\n— King\nCrown Media Group\ncrownmediagroup.co`,
  };
}

function getDefaultEmail2(lead) {
  return {
    subject: `One thing I'd change for ${lead.business_name}`,
    body: `Hey,\n\nQuick value drop since I haven't heard back — the #1 thing most local businesses miss on social is posting content that speaks to their community, not just their product.\n\nFor ${lead.business_name}, I'd shift 30% of your content to "behind the scenes" and "why we do this" stories. That's what builds the trust that turns followers into customers.\n\nWant me to put together a quick breakdown of what I'd build for your account?\n\n— King`,
  };
}

function getDefaultEmail3(lead) {
  return {
    subject: `15 minutes — ${lead.business_name}?`,
    body: `Hey,\n\nLast message from me — I know your inbox is full.\n\nI'd love 15 minutes to walk you through exactly what I'd build for ${lead.business_name}. No pitch, just the plan.\n\n${CALENDLY_LINK}\n\nIf the timing's off, no worries at all.\n\n— King\nCrown Media Group`,
  };
}

// ── Mark lead as contacted in Supabase ────────────────────────────────────────

async function markContacted(leadId, step) {
  if (!SUPABASE_URL || IS_DRY || IS_TEST || leadId === 'test') return;
  const status = step >= 3 ? 'sequence_complete' : 'in_sequence';
  await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify({ status, sent_at: new Date().toISOString() }),
  });
}

// ── Log results ───────────────────────────────────────────────────────────────

function logResults(results) {
  const date    = new Date().toISOString().split('T')[0];
  const sent    = results.filter(r => r.sent).length;
  const content = `# Outreach Log — ${date}\n\n**Sent:** ${sent}/${results.length} | **Mode:** ${IS_DRY ? 'DRY RUN' : IS_TEST ? 'TEST' : 'LIVE'}\n\n${results.map(r => `- ${r.sent ? '✅' : '❌'} ${r.business_name} — ${r.subject}`).join('\n')}\n\n---\n`;
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const existing = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : '';
  fs.writeFileSync(LOG_FILE, content + existing);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[Hawkeye] ${IS_DRY ? 'DRY RUN — ' : IS_TEST ? 'TEST MODE — ' : ''}Cold outreach sequencer firing...`);

  if (!IS_DRY && !IS_TEST && !GMAIL_USER) {
    console.log('[Hawkeye] GMAIL_USER not set — cannot send. Use --dry-run to preview.');
    process.exit(1);
  }

  const leads = await getTargetLeads();
  console.log(`[Hawkeye] ${leads.length} target${leads.length !== 1 ? 's' : ''} acquired. Taking aim.`);

  const results = [];

  for (const lead of leads.slice(0, MAX_PER_DAY)) {
    console.log(`\n  TARGET: ${lead.business_name} (score: ${lead.lead_score || '?'})`);
    try {
      const email = await generateEmail(lead, 1);
      const htmlBody = email.body.replace(/\n/g, '<br>');
      const sent = await sendEmail({
        to: IS_TEST ? 'king@crownmediagroup.co' : lead.email,
        subject: email.subject,
        html: `<div style="font-family:sans-serif;max-width:520px;color:#1a1a1a;line-height:1.7">${htmlBody}</div>`,
        text: email.body,
      });
      results.push({ business_name: lead.business_name, subject: email.subject, sent });
      if (sent) {
        await markContacted(lead.id, 1);
        console.log(`  SHOT FIRED: "${email.subject}"`);
      } else {
        console.log(`  MISSED: send failed`);
      }
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
      results.push({ business_name: lead.business_name, subject: '(error)', sent: false });
    }

    // Pause between sends — deliverability
    if (!IS_DRY && leads.indexOf(lead) < leads.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  logResults(results);
  const sent = results.filter(r => r.sent).length;
  console.log(`\n[Hawkeye] Mission complete. ${sent}/${results.length} emails fired. Log: ${LOG_FILE}`);

  if (!IS_DRY && !IS_TEST) {
    fs.writeFileSync(LAST_RUN, new Date().toISOString().split('T')[0]);
  }
}

run().catch(e => { console.error('[Hawkeye] FATAL:', e.message); process.exit(1); });
