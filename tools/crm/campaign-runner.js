#!/usr/bin/env node
/**
 * Campaign Runner — NxLevel Warm Outreach
 * Crown Media Group — All Glory to Jesus Global LLC
 *
 * Sends emails + SMS on the 3-step schedule:
 *   Step 0 → 1  Day 0:  Email 1 + SMS 1 (Reconnect + Offer)
 *   Step 1 → 2  Day 3:  Email 2          (3 Things I Noticed)
 *   Step 2 → 3  Day 6:  Email 3 + SMS 2  (Last Call)
 *
 * Usage:
 *   node tools/crm/campaign-runner.js              # send due steps
 *   node tools/crm/campaign-runner.js --dry-run    # preview, no send
 *   node tools/crm/campaign-runner.js --status     # show summary table
 *   node tools/crm/campaign-runner.js --step 1     # force run only step 1
 *
 * Prerequisite: node tools/crm/nxlevel-campaign-setup.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { config } from 'dotenv';
config({ path: join(__dirname, '../../.env') });

import Database from 'node:sqlite';
const db = new Database(join(__dirname, 'crm.db'));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun   = args.includes('--dry-run');
const isStatus   = args.includes('--status');
const forceStep  = args.includes('--step') ? parseInt(args[args.indexOf('--step') + 1]) : null;

// ── Config ────────────────────────────────────────────────────────────────────
const CAMPAIGN_NAME = 'NxLevel Warm Outreach — March 2026';
const STEP_DELAY_DAYS = 3; // days between steps
const FROM_EMAIL = process.env.GMAIL_USER || 'king@crownmediagroup.co';
const FROM_NAME  = 'King | Crown Media Group';

// ── Email transport (Gmail) ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// ── Twilio ────────────────────────────────────────────────────────────────────
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

// ── Status report ─────────────────────────────────────────────────────────────
if (isStatus) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE name = ?').get(CAMPAIGN_NAME);
  if (!campaign) {
    console.log('\nNo NxLevel campaign found. Run: npm run campaign:setup\n');
    process.exit(0);
  }

  const contacts = db.prepare(`
    SELECT cc.current_step, cc.status, cc.last_sent_at, cc.enrolled_at,
           co.name, co.business, co.email, co.phone
    FROM campaign_contacts cc JOIN contacts co ON co.id = cc.contact_id
    WHERE cc.campaign_id = ? ORDER BY cc.current_step DESC, co.name ASC
  `).all(campaign.id);

  const byStep = [0,1,2,3].map(s => contacts.filter(c => c.current_step === s).length);
  const replied = contacts.filter(c => c.status === 'replied').length;

  console.log(`\n── NxLevel Campaign: ${campaign.name} ──`);
  console.log(`   Status: ${campaign.status}  |  Calendly: ${campaign.calendly_link}`);
  console.log(`   Not started: ${byStep[0]}  |  Email 1 sent: ${byStep[1]}  |  Email 2 sent: ${byStep[2]}  |  Email 3 sent: ${byStep[3]}`);
  console.log(`   Replied: ${replied}  |  Total: ${contacts.length}\n`);
  console.log('   Name                         Business                  Step  Status       Last Sent');
  console.log('   ' + '─'.repeat(90));
  contacts.forEach(c => {
    const name = (c.name || '').padEnd(28);
    const biz  = (c.business || '—').substring(0, 24).padEnd(25);
    const step = String(c.current_step).padEnd(5);
    const stat = (c.status || '').padEnd(12);
    const sent = c.last_sent_at ? c.last_sent_at.substring(0,10) : 'pending';
    console.log(`   ${name} ${biz} ${step} ${stat} ${sent}`);
  });
  console.log('');
  process.exit(0);
}

// ── Email templates ───────────────────────────────────────────────────────────
function buildEmail1(name, business, calendly) {
  const biz = business || 'your business';
  return {
    subject: `Quick question about ${biz}`,
    html: `
<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;color:#1a1a2e;line-height:1.7">
  <p>Hey ${name},</p>
  <p>It's King from NxLevel. Hope your business is moving — I know the grind is real.</p>
  <p>I wanted to reach out because I've been building <strong>Crown Media Group</strong>, my AI-powered marketing agency, and honestly — some of the businesses in our class are exactly who I built this for.</p>
  <p>I took a look at <strong>${biz}</strong> and I see real potential. A few quick wins with your social media and online presence could bring in new customers fast.</p>
  <p>Here's what I'm offering to NxLevel classmates only: a <strong>free 20-minute content audit</strong> where I'll show you exactly what's working, what's not, and what I'd fix first — no strings attached.</p>
  <p>If you're open to it, grab a time here: <a href="${calendly}" style="color:#C9981A;font-weight:700">${calendly}</a></p>
  <p>Either way, I'm rooting for you. Let's keep building.</p>
  <p>— King<br>
  <span style="color:#C9981A;font-weight:700">Crown Media Group</span><br>
  <a href="https://crownmediagroup.co" style="color:#C9981A">crownmediagroup.co</a></p>
</div>`,
    text: `Hey ${name},\n\nIt's King from NxLevel. Hope your business is moving — I know the grind is real.\n\nI wanted to reach out because I've been building Crown Media Group, my AI-powered marketing agency, and honestly — some of the businesses in our class are exactly who I built this for.\n\nI took a look at ${biz} and I see real potential. A few quick wins with your social media and online presence could bring in new customers fast.\n\nHere's what I'm offering to NxLevel classmates only: a free 20-minute content audit where I'll show you exactly what's working, what's not, and what I'd fix first — no strings attached.\n\nGrab a time here: ${calendly}\n\nEither way, I'm rooting for you. Let's keep building.\n\n— King\nCrown Media Group\ncrownmediagroup.co`
  };
}

function buildEmail2(name, business, calendly, observationsJson) {
  const biz = business || 'your business';
  let obs = ['Your Google Business Profile could use fresher content — updated photos and posts boost local search visibility.',
             'Your social media has potential but inconsistent posting is limiting your reach — a regular schedule doubles engagement in 30 days.',
             `You're leaving money on the table without paid ads — even $5/day on Facebook could bring in 10-20 new leads a month.`];
  try {
    const parsed = JSON.parse(observationsJson);
    if (Array.isArray(parsed) && parsed.length >= 3) obs = parsed;
  } catch (_) {}

  const obsList = obs.map((o, i) => `<li style="margin-bottom:12px">${i+1}. ${o}</li>`).join('');
  const obsText = obs.map((o, i) => `${i+1}. ${o}`).join('\n');

  return {
    subject: `3 things I noticed about ${biz}`,
    html: `
<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;color:#1a1a2e;line-height:1.7">
  <p>Hey ${name},</p>
  <p>Following up from my last email — I actually went ahead and looked at your online presence.</p>
  <p>Here are 3 things I noticed:</p>
  <ul style="padding-left:20px">${obsList}</ul>
  <p>I'm not saying this to call you out — I'm saying it because these are easy fixes and I can help.</p>
  <p>The free 20-minute audit is still on the table: <a href="${calendly}" style="color:#C9981A;font-weight:700">${calendly}</a></p>
  <p>Let's get you growing.</p>
  <p>— King<br>
  <span style="color:#C9981A;font-weight:700">Crown Media Group</span><br>
  <a href="https://crownmediagroup.co" style="color:#C9981A">crownmediagroup.co</a></p>
</div>`,
    text: `Hey ${name},\n\nFollowing up from my last email — I actually went ahead and looked at your online presence.\n\nHere are 3 things I noticed:\n\n${obsText}\n\nI'm not saying this to call you out — I'm saying it because these are easy fixes and I can help.\n\nThe free 20-minute audit is still on the table: ${calendly}\n\nLet's get you growing.\n\n— King\nCrown Media Group\ncrownmediagroup.co`
  };
}

function buildEmail3(name, business, calendly) {
  const biz = business || 'your business';
  return {
    subject: 'Last chance — free audit for NxLevel fam',
    html: `
<div style="font-family:Georgia,serif;max-width:580px;margin:0 auto;color:#1a1a2e;line-height:1.7">
  <p>Hey ${name},</p>
  <p>Last email on this — I know you're busy building.</p>
  <p>The <strong>free content audit offer for NxLevel classmates</strong> closes this week. After that, it goes to <strong>$150</strong> for everyone else.</p>
  <p>20 minutes. I show you exactly what to fix for <strong>${biz}</strong>. No pressure, no pitch — just value from one entrepreneur to another.</p>
  <p>Book here if you're in: <a href="${calendly}" style="color:#C9981A;font-weight:700">${calendly}</a></p>
  <p>God bless the grind.</p>
  <p>— King<br>
  <span style="color:#C9981A;font-weight:700">Crown Media Group</span><br>
  <a href="https://crownmediagroup.co" style="color:#C9981A">crownmediagroup.co</a></p>
</div>`,
    text: `Hey ${name},\n\nLast email on this — I know you're busy building.\n\nThe free content audit offer for NxLevel classmates closes this week. After that, it goes to $150 for everyone else.\n\n20 minutes. I show you exactly what to fix for ${biz}. No pressure, no pitch — just value from one entrepreneur to another.\n\nBook here if you're in: ${calendly}\n\nGod bless the grind.\n\n— King\nCrown Media Group\ncrownmediagroup.co`
  };
}

// ── SMS templates ─────────────────────────────────────────────────────────────
function buildSms1(name, calendly) {
  return `Hey ${name}! It's King from NxLevel. Just sent you an email about a free content audit I'm doing for classmates. Would love to help you out — check your inbox or grab a time here: ${calendly}`;
}

function buildSms2(name, calendly) {
  return `Hey ${name} — last call on the free audit for NxLevel fam. 20 min, no strings. If your business needs more customers, this is the move: ${calendly}`;
}

// ── Send helpers ──────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html, text, contactId, campaignId) {
  if (isDryRun) {
    console.log(`  [DRY-RUN] EMAIL → ${to}`);
    console.log(`    Subject: ${subject}`);
    console.log(`    Preview: ${text.substring(0, 100)}...`);
    return true;
  }
  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to,
      subject,
      html,
      text
    });
    // Log to messages_sent
    db.prepare(`INSERT INTO messages_sent (contact_id, type, subject, body, sent_at, status) VALUES (?, 'email', ?, ?, datetime('now'), 'sent')`)
      .run(contactId, subject, text.substring(0, 500));
    return true;
  } catch (e) {
    console.error(`  ERROR sending email to ${to}: ${e.message}`);
    return false;
  }
}

async function sendSms(to, body, contactId) {
  if (!to) return false;
  if (!twilioClient) {
    console.log(`  [NO TWILIO] SMS would go to ${to}: ${body.substring(0, 60)}...`);
    return false;
  }
  if (isDryRun) {
    console.log(`  [DRY-RUN] SMS → ${to}: ${body.substring(0, 80)}...`);
    return true;
  }
  // Normalize phone: strip non-digits, add +1 if US
  let phone = to.replace(/\D/g, '');
  if (phone.length === 10) phone = '1' + phone;
  if (!phone.startsWith('+')) phone = '+' + phone;

  try {
    await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_FROM_NUMBER,
      to: phone
    });
    db.prepare(`INSERT INTO messages_sent (contact_id, type, subject, body, sent_at, status) VALUES (?, 'sms', 'SMS', ?, datetime('now'), 'sent')`)
      .run(contactId, body.substring(0, 500));
    return true;
  } catch (e) {
    console.error(`  ERROR sending SMS to ${to}: ${e.message}`);
    return false;
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function run() {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE name = ?').get(CAMPAIGN_NAME);
  if (!campaign) {
    console.log('\nNo campaign found. Run: npm run campaign:setup\n');
    process.exit(1);
  }

  const calendly = campaign.calendly_link || DEFAULT_CALENDLY;
  const now = new Date();

  console.log(`\nCrown Media Group — Campaign Runner`);
  console.log(`Campaign: ${campaign.name}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no emails sent)' : 'LIVE'}`);
  if (forceStep !== null) console.log(`Force step: ${forceStep}`);
  console.log('');

  // Fetch all active contacts
  const allActive = db.prepare(`
    SELECT cc.*, co.name, co.business, co.email, co.phone, co.ai_observations
    FROM campaign_contacts cc JOIN contacts co ON co.id = cc.contact_id
    WHERE cc.campaign_id = ? AND cc.status = 'active'
  `).all(campaign.id);

  if (allActive.length === 0) {
    console.log('No active contacts in campaign. All done or not set up.');
    process.exit(0);
  }

  let processed = 0;
  let emailsSent = 0;
  let smsSent = 0;

  for (const cc of allActive) {
    const name  = cc.name || 'there';
    const biz   = cc.business || 'your business';
    const email = cc.email;
    const phone = cc.phone;

    // Determine which step is due
    let dueStep = null;

    if (cc.current_step === 0) {
      // Step 0 → 1: send immediately (Day 0)
      dueStep = 1;
    } else if (cc.current_step === 1 || cc.current_step === 2) {
      // Check if enough days have passed since last send
      if (cc.last_sent_at) {
        const lastSent = new Date(cc.last_sent_at);
        const daysSince = (now - lastSent) / (1000 * 60 * 60 * 24);
        if (daysSince >= STEP_DELAY_DAYS) {
          dueStep = cc.current_step + 1;
        }
      }
    }

    // Override if --step flag
    if (forceStep !== null) {
      dueStep = cc.current_step === forceStep - 1 ? forceStep : null;
    }

    if (dueStep === null) {
      // Not due yet — show when
      if (cc.current_step > 0 && cc.current_step < 3 && cc.last_sent_at) {
        const lastSent = new Date(cc.last_sent_at);
        const nextSend = new Date(lastSent.getTime() + STEP_DELAY_DAYS * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((nextSend - now) / (1000 * 60 * 60 * 24));
        console.log(`  WAIT  ${name} — next email in ${daysLeft} day(s) (step ${cc.current_step + 1})`);
      }
      continue;
    }

    processed++;
    console.log(`\n  → ${name} (${biz}) — sending step ${dueStep}`);

    let emailOk = false;
    let smsOk   = false;

    if (dueStep === 1) {
      const { subject, html, text } = buildEmail1(name, biz, calendly);
      emailOk = await sendEmail(email, subject, html, text, cc.contact_id, campaign.id);
      if (phone) smsOk = await sendSms(phone, buildSms1(name, calendly), cc.contact_id);

    } else if (dueStep === 2) {
      const { subject, html, text } = buildEmail2(name, biz, calendly, cc.ai_observations);
      emailOk = await sendEmail(email, subject, html, text, cc.contact_id, campaign.id);

    } else if (dueStep === 3) {
      const { subject, html, text } = buildEmail3(name, biz, calendly);
      emailOk = await sendEmail(email, subject, html, text, cc.contact_id, campaign.id);
      if (phone) smsOk = await sendSms(phone, buildSms2(name, calendly), cc.contact_id);
    }

    if (!isDryRun && emailOk) {
      emailsSent++;
      if (smsOk) smsSent++;

      // Update step and timestamp
      db.prepare('UPDATE campaign_contacts SET current_step = ?, last_sent_at = datetime(\'now\') WHERE campaign_id = ? AND contact_id = ?')
        .run(dueStep, campaign.id, cc.contact_id);

      // Mark completed if done
      if (dueStep === 3) {
        db.prepare("UPDATE campaign_contacts SET status = 'completed' WHERE campaign_id = ? AND contact_id = ?")
          .run(campaign.id, cc.contact_id);
      }
    } else if (isDryRun) {
      emailsSent++;
      if (phone) smsSent++;
    }

    // Small delay between sends to avoid rate limits
    if (!isDryRun && processed % 5 === 0) {
      console.log('  (pausing 30s to respect rate limits...)');
      await new Promise(r => setTimeout(r, 30000));
    }
  }

  // Summary
  console.log(`\n── Run Complete ─────────────────────────────────`);
  console.log(`   Processed: ${processed} contact(s)`);
  console.log(`   Emails ${isDryRun ? 'would send' : 'sent'}: ${emailsSent}`);
  console.log(`   SMS ${isDryRun ? 'would send' : 'sent'}: ${smsSent}`);
  if (isDryRun) console.log(`   Mode: DRY RUN — no emails/SMS actually sent`);
  console.log(`\n   Run again in ${STEP_DELAY_DAYS} days for next step.`);
  console.log(`   Check status: npm run campaign:status\n`);
}

run().catch(e => {
  console.error('\nCampaign runner error:', e.message);
  process.exit(1);
});
