#!/usr/bin/env node
/**
 * Instagram DM via Meta Business Messaging API
 *
 * Requires:
 *   IG_PAGE_ACCESS_TOKEN — From Meta Business Suite → App → Instagram → Messaging
 *   IG_BUSINESS_ACCOUNT_ID — Your Instagram Business Account ID
 *
 * Usage:
 *   node Agency/tools/ig-meta-api.js --user <instagram_username> --msg "your message"
 *   node Agency/tools/ig-meta-api.js --user <instagram_username> --template cold_outreach
 *
 * Setup (one-time, 15 min):
 *   1. Go to developers.facebook.com → My Apps → Create App → Business type
 *   2. Add Instagram product → Connect @crownmediagroupco
 *   3. Generate Page Access Token (never-expiring)
 *   4. Get your IG Business Account ID from Graph API Explorer
 *   5. Add both to .env as IG_PAGE_ACCESS_TOKEN and IG_BUSINESS_ACCOUNT_ID
 */

import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const { IG_PAGE_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID } = process.env;

const TEMPLATES = {
  cold_outreach: (username) =>
    `Hey! I came across your page and love what you're building. I'm David King — I run Crown Media Group here in Columbia, SC. We help local businesses grow with AI-powered marketing. I'd love to offer you a free content audit — no strings attached. Interested?`,
  follow_up: (username) =>
    `Hey! Just wanted to follow up on my last message. We're helping Columbia SC businesses get real results with AI marketing — would love to show you what that looks like for your brand. Worth a quick chat?`,
  faith_intro: (username) =>
    `Hey! I noticed your page and felt led to reach out. I'm David King — I run Crown Media Group, a faith-driven AI marketing agency in Columbia, SC. We help local businesses grow through content, automation, and strategy. Would love to connect and offer a free audit!`,
  shatiea_proof: (username) =>
    `Hey! I run Crown Media Group in Columbia, SC. We just helped a local juice brand (Fruit of the Spirit) get a full brand identity + content system up in weeks. I'd love to do the same for your business — free audit, no pressure. Interested?`
};

async function getUserIdByUsername(username) {
  const url = `https://graph.facebook.com/v19.0/${IG_BUSINESS_ACCOUNT_ID}?fields=business_discovery.fields(id,username)&user_id=${username}&access_token=${IG_PAGE_ACCESS_TOKEN}`;
  // Use business discovery to find recipient ID
  const searchUrl = `https://graph.facebook.com/v19.0/ig_username_lookup?username=${username}&access_token=${IG_PAGE_ACCESS_TOKEN}`;
  const r = await fetch(searchUrl);
  const data = await r.json();
  if (data.error) throw new Error(`User lookup failed: ${data.error.message}`);
  return data.id;
}

async function sendDM(recipientId, message) {
  const url = `https://graph.facebook.com/v19.0/${IG_BUSINESS_ACCOUNT_ID}/messages`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: IG_PAGE_ACCESS_TOKEN
    })
  });
  const data = await r.json();
  if (data.error) throw new Error(`Send failed: ${data.error.message}`);
  return data.message_id;
}

async function main() {
  const args = process.argv.slice(2);
  const userIdx = args.indexOf('--user');
  const msgIdx = args.indexOf('--msg');
  const tplIdx = args.indexOf('--template');
  const dryRun = args.includes('--dry-run');

  if (userIdx === -1) {
    console.error('Usage: node ig-meta-api.js --user <username> [--msg "text" | --template name] [--dry-run]');
    process.exit(1);
  }

  const username = args[userIdx + 1];
  const message = msgIdx !== -1 ? args[msgIdx + 1]
    : tplIdx !== -1 ? TEMPLATES[args[tplIdx + 1]]?.(username)
    : null;

  if (!message) {
    console.error('Provide --msg or --template (cold_outreach, follow_up, faith_intro, shatiea_proof)');
    process.exit(1);
  }

  if (!IG_PAGE_ACCESS_TOKEN || !IG_BUSINESS_ACCOUNT_ID) {
    console.log('\n[SETUP REQUIRED] Meta API not configured yet.');
    console.log('\nTo activate:');
    console.log('  1. Go to developers.facebook.com → My Apps → Create App → Business type');
    console.log('  2. Add "Instagram" product → Connect @crownmediagroupco Facebook Page');
    console.log('  3. Go to Graph API Explorer → Generate Page Access Token');
    console.log('  4. Add to .env:');
    console.log('     IG_PAGE_ACCESS_TOKEN=<your token>');
    console.log('     IG_BUSINESS_ACCOUNT_ID=<your IG business account numeric ID>');
    console.log('\nOnce set, this script sends DMs via official API — no bot detection, no browser.');
    if (dryRun) {
      console.log('\n[DRY RUN] Would send to @' + username + ':');
      console.log('─'.repeat(60));
      console.log(message);
      console.log('─'.repeat(60));
    }
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would send to @' + username + ':');
    console.log('─'.repeat(60));
    console.log(message);
    console.log('─'.repeat(60));
    process.exit(0);
  }

  try {
    console.log(`\n[API] Looking up @${username}...`);
    const recipientId = await getUserIdByUsername(username);
    console.log(`[API] Found user ID: ${recipientId}`);

    console.log(`[API] Sending DM...`);
    const messageId = await sendDM(recipientId, message);
    console.log(`[API] Sent! Message ID: ${messageId}`);
  } catch (err) {
    console.error('[API ERROR]', err.message);
    process.exit(1);
  }
}

main();
