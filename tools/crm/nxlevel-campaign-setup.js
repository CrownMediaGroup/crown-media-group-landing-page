#!/usr/bin/env node
/**
 * NxLevel Campaign Setup
 * Crown Media Group — All Glory to Jesus Global LLC
 *
 * Usage:
 *   node tools/crm/nxlevel-campaign-setup.js
 *   node tools/crm/nxlevel-campaign-setup.js --calendly "https://calendly.com/..."
 *   node tools/crm/nxlevel-campaign-setup.js --status
 *   node tools/crm/nxlevel-campaign-setup.js --reset   (re-enroll, keep existing if already enrolled)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env from project root
import { config } from 'dotenv';
config({ path: join(__dirname, '../../.env') });

import Database from 'node:sqlite';

const db = new Database(join(__dirname, 'crm.db'));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CAMPAIGN_NAME = 'NxLevel Warm Outreach — March 2026';
const DEFAULT_CALENDLY = process.env.CALENDLY_LINK || 'https://calendly.com/crownmediagroupco';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isStatus  = args.includes('--status');
const isReset   = args.includes('--reset');
const calIdx    = args.indexOf('--calendly');
const calendlyLink = calIdx !== -1 ? args[calIdx + 1] : DEFAULT_CALENDLY;

// ── Status report ─────────────────────────────────────────────────────────────
if (isStatus) {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE name = ?').get(CAMPAIGN_NAME);
  if (!campaign) {
    console.log('\nNo NxLevel campaign found. Run without --status to set it up.\n');
    process.exit(0);
  }
  const total    = db.prepare('SELECT COUNT(*) as c FROM campaign_contacts WHERE campaign_id = ?').get(campaign.id).c;
  const active   = db.prepare("SELECT COUNT(*) as c FROM campaign_contacts WHERE campaign_id = ? AND status = 'active'").get(campaign.id).c;
  const step1    = db.prepare('SELECT COUNT(*) as c FROM campaign_contacts WHERE campaign_id = ? AND current_step >= 1').get(campaign.id).c;
  const step2    = db.prepare('SELECT COUNT(*) as c FROM campaign_contacts WHERE campaign_id = ? AND current_step >= 2').get(campaign.id).c;
  const step3    = db.prepare('SELECT COUNT(*) as c FROM campaign_contacts WHERE campaign_id = ? AND current_step >= 3').get(campaign.id).c;
  const replied  = db.prepare("SELECT COUNT(*) as c FROM campaign_contacts WHERE campaign_id = ? AND status = 'replied'").get(campaign.id).c;

  console.log(`\n── NxLevel Campaign Status ──────────────────────`);
  console.log(`   Name:       ${campaign.name}`);
  console.log(`   Status:     ${campaign.status}`);
  console.log(`   Calendly:   ${campaign.calendly_link}`);
  console.log(`   Enrolled:   ${total}`);
  console.log(`   Active:     ${active}`);
  console.log(`   Email 1 sent: ${step1}`);
  console.log(`   Email 2 sent: ${step2}`);
  console.log(`   Email 3 sent: ${step3}`);
  console.log(`   Replied:    ${replied}`);

  if (total > 0) {
    console.log(`\n── Contacts ──────────────────────────────────────`);
    const contacts = db.prepare(`
      SELECT cc.current_step, cc.status, cc.last_sent_at, co.name, co.business, co.email
      FROM campaign_contacts cc JOIN contacts co ON co.id = cc.contact_id
      WHERE cc.campaign_id = ? ORDER BY cc.current_step DESC, co.name ASC
    `).all(campaign.id);
    contacts.forEach(c => {
      const step = c.current_step === 0 ? 'Not started' : `Step ${c.current_step} sent`;
      console.log(`   ${c.name} (${c.business || 'no biz'}) — ${step} | ${c.status}`);
    });
  }
  console.log('');
  process.exit(0);
}

// ── Setup ─────────────────────────────────────────────────────────────────────
console.log('\nCrown Media Group — NxLevel Campaign Setup');
console.log('All Glory to Jesus Global LLC\n');

// Upsert campaign record
let campaign = db.prepare('SELECT * FROM campaigns WHERE name = ?').get(CAMPAIGN_NAME);
if (!campaign) {
  db.prepare(`INSERT INTO campaigns (name, status, workspace_id, calendly_link) VALUES (?, 'draft', 1, ?)`)
    .run(CAMPAIGN_NAME, calendlyLink);
  campaign = db.prepare('SELECT * FROM campaigns WHERE name = ?').get(CAMPAIGN_NAME);
  console.log(`Created campaign: "${CAMPAIGN_NAME}"`);
} else {
  db.prepare('UPDATE campaigns SET calendly_link = ? WHERE id = ?').run(calendlyLink, campaign.id);
  console.log(`Campaign exists (id=${campaign.id}). Updating Calendly link.`);
}

// Fetch NxLevel contacts with email addresses
const contacts = db.prepare(`
  SELECT id, name, business, email, phone, notes
  FROM contacts
  WHERE source = 'NxLevel'
    AND (archived IS NULL OR archived = 0)
    AND email IS NOT NULL
    AND email != ''
    AND id != 3
  ORDER BY name ASC
`).all();

console.log(`\nFound ${contacts.length} NxLevel contacts with emails\n`);

let enrolled = 0;
let skipped  = 0;
let aiGenerated = 0;

for (const contact of contacts) {
  // Skip if already enrolled (unless --reset)
  const existing = db.prepare('SELECT id, current_step FROM campaign_contacts WHERE campaign_id = ? AND contact_id = ?')
    .get(campaign.id, contact.id);

  if (existing && !isReset) {
    console.log(`  SKIP  ${contact.name} — already enrolled (step ${existing.current_step})`);
    skipped++;
    continue;
  }

  // Generate AI observations for Email 2
  let observations = null;
  try {
    const prompt = `You are Crown Media Group, an AI-powered marketing agency in Columbia, SC.
A NxLevel classmate named ${contact.name} runs "${contact.business || 'their business'}".
${contact.notes ? `Notes: ${contact.notes}` : ''}

Generate exactly 3 specific, believable marketing observations about their business that would be relevant to a small business owner. Each observation should feel like you actually looked at their online presence. Format as a JSON array of 3 strings — no preamble, just the array.

Example format:
["observation 1", "observation 2", "observation 3"]

Make them specific to the business type, actionable, and encouraging (not critical). Focus on:
1. Google/local visibility
2. Social media consistency
3. Missing revenue opportunity (ads, email, etc.)`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text.trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      observations = match[0];
      aiGenerated++;
    }
  } catch (e) {
    // Fallback observations
    observations = JSON.stringify([
      `Your Google Business Profile could use fresher content — updated photos and posts would boost your local search visibility significantly.`,
      `Your social media presence has potential but inconsistent posting is limiting your reach — a regular schedule would double engagement within 30 days.`,
      `You're leaving money on the table without paid ads — even $5/day on Facebook could bring in 10-20 new leads a month for ${contact.business || 'your business'}.`
    ]);
  }

  if (existing && isReset) {
    db.prepare('UPDATE campaign_contacts SET current_step = 0, status = ?, last_sent_at = NULL, ai_observations = ? WHERE campaign_id = ? AND contact_id = ?')
      .run('active', observations, campaign.id, contact.id);
    console.log(`  RESET ${contact.name} (${contact.business || '—'}) — re-enrolled`);
  } else {
    db.prepare('INSERT INTO campaign_contacts (campaign_id, contact_id, status, ai_observations) VALUES (?, ?, ?, ?)')
      .run(campaign.id, contact.id, 'active', observations);
    console.log(`  + ${contact.name} (${contact.business || '—'}) ${contact.email}`);
  }
  enrolled++;
}

// Activate campaign
db.prepare("UPDATE campaigns SET status = 'active' WHERE id = ?").run(campaign.id);

console.log(`\n── Summary ──────────────────────────────────────`);
console.log(`   Enrolled:      ${enrolled}`);
console.log(`   Skipped:       ${skipped} (already in campaign)`);
console.log(`   AI generated:  ${aiGenerated} observation sets`);
console.log(`   Calendly:      ${calendlyLink}`);
console.log(`\nCampaign is ACTIVE. Ready to run:`);
console.log(`  npm run campaign:dry-run   (preview without sending)`);
console.log(`  npm run campaign:run       (send Email 1 + SMS 1 to all enrolled)\n`);
