#!/usr/bin/env node
/**
 * Crown Media Group — Content Queue Manager
 *
 * Drop a topic here, AI generates the caption, schedules it, fires to all platforms.
 * Zero manual work after adding an item.
 *
 * Usage:
 *   node Agency/tools/content-queue.js add --topic "5 reasons Columbia SC businesses need AI" --platforms ig,fb,x
 *   node Agency/tools/content-queue.js add --topic "Shatiea juice launch" --client shatiea --platforms ig,fb
 *   node Agency/tools/content-queue.js run        ← process queue now
 *   node Agency/tools/content-queue.js list       ← show pending items
 *   node Agency/tools/content-queue.js clear      ← clear completed items
 *
 * Env vars needed: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const QUEUE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../Agency/ops/content-queue.json');
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── Platform caption configs ─────────────────────────────────────────────────
const PLATFORM_CONFIGS = {
  ig: { name: 'Instagram', maxChars: 2200, hashtags: true, emoji: true },
  fb: { name: 'Facebook', maxChars: 63206, hashtags: false, emoji: true },
  x:  { name: 'X/Twitter', maxChars: 280, hashtags: true, emoji: false },
  tiktok: { name: 'TikTok', maxChars: 2200, hashtags: true, emoji: true },
  linkedin: { name: 'LinkedIn', maxChars: 3000, hashtags: true, emoji: false },
  threads: { name: 'Threads', maxChars: 500, hashtags: true, emoji: true }
};

const CMG_HASHTAGS = '#ColumbiaMarketing #ColumbiaSmallBusiness #AIMarketing #CrownMediaGroup #SocialMediaMarketing #ColumbiaBusinessOwner #SouthCarolinaBusiness #DigitalMarketing';

const SHATIEA_HASHTAGS = '#FruitOfTheSpirit #JuiceBusiness #FaithDriven #HealthyLiving #Columbia #Juicing #CleanEating #WellnessJourney';

// ── Load/save queue ───────────────────────────────────────────────────────────
function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return { items: [] };
  return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
}

function saveQueue(queue) {
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

// ── AI caption generation ────────────────────────────────────────────────────
async function generateCaption(topic, platform, client = null) {
  const config = PLATFORM_CONFIGS[platform];
  const isShatiea = client === 'shatiea';
  const hashtags = isShatiea ? SHATIEA_HASHTAGS : CMG_HASHTAGS;

  const systemPrompt = isShatiea
    ? `You write social media captions for Shatiea's faith-based juice business "Fruit of the Spirit" in Columbia, SC. Voice: warm, faith-driven, community-centered, clean, bold. Never fluffy. Always end with a CTA.`
    : `You write social media captions for Crown Media Group, an AI-powered marketing agency in Columbia, SC run by David King. Voice: bold, direct, confident, faith-aligned where natural. Never fluffy. Always end with a CTA.`;

  const userPrompt = `Write a ${config.name} caption about: "${topic}"
- Max ${config.maxChars} characters total
- ${config.emoji ? 'Use 1-3 relevant emojis' : 'No emojis'}
- ${config.hashtags ? `End with these hashtags: ${hashtags}` : 'No hashtags'}
- Strong hook first line (scroll stopper)
- 2-3 lines of value
- Clear CTA at the end
- Output ONLY the caption, nothing else`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  const data = await response.json();
  return data.content?.[0]?.text?.trim() || '';
}

// ── Log to Supabase ──────────────────────────────────────────────────────────
async function logToSupabase(item, platform, caption, status) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  await fetch(`${SUPABASE_URL}/rest/v1/content`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      topic: item.topic,
      platform,
      caption,
      client: item.client || 'crown_media_group',
      status,
      created_at: new Date().toISOString()
    })
  });
}

// ── Commands ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0];

if (command === 'add') {
  const topicIdx = args.indexOf('--topic');
  const platformsIdx = args.indexOf('--platforms');
  const clientIdx = args.indexOf('--client');

  if (topicIdx === -1) {
    console.error('Usage: content-queue.js add --topic "your topic" [--platforms ig,fb,x] [--client shatiea]');
    process.exit(1);
  }

  const topic = args[topicIdx + 1];
  const platforms = platformsIdx !== -1 ? args[platformsIdx + 1].split(',') : ['ig', 'fb', 'x'];
  const client = clientIdx !== -1 ? args[clientIdx + 1] : null;

  const queue = loadQueue();
  const item = {
    id: Date.now().toString(),
    topic,
    platforms,
    client,
    status: 'pending',
    added_at: new Date().toISOString()
  };
  queue.items.push(item);
  saveQueue(queue);
  console.log(`[QUEUE] Added: "${topic}" → ${platforms.join(', ')}`);
  console.log(`[QUEUE] ${queue.items.filter(i => i.status === 'pending').length} items pending`);

} else if (command === 'list') {
  const queue = loadQueue();
  const pending = queue.items.filter(i => i.status === 'pending');
  const done = queue.items.filter(i => i.status === 'posted');
  console.log(`\nContent Queue — Crown Media Group`);
  console.log(`Pending: ${pending.length} | Posted: ${done.length}\n`);
  pending.forEach((item, i) => {
    console.log(`${i + 1}. [${item.platforms.join(',')}] ${item.topic}${item.client ? ` (${item.client})` : ''}`);
  });

} else if (command === 'clear') {
  const queue = loadQueue();
  queue.items = queue.items.filter(i => i.status === 'pending');
  saveQueue(queue);
  console.log('[QUEUE] Cleared completed items.');

} else if (command === 'run') {
  const queue = loadQueue();
  const pending = queue.items.filter(i => i.status === 'pending');

  if (pending.length === 0) {
    console.log('[QUEUE] Nothing to process.');
    process.exit(0);
  }

  console.log(`[QUEUE] Processing ${pending.length} items...`);

  (async () => {
    for (const item of pending) {
      console.log(`\n[PROCESSING] "${item.topic}"`);

      for (const platform of item.platforms) {
        try {
          console.log(`  [${platform.toUpperCase()}] Generating caption...`);
          const caption = await generateCaption(item.topic, platform, item.client);
          console.log(`  [${platform.toUpperCase()}] Caption ready (${caption.length} chars)`);
          console.log(`  ─────────────────────────────────`);
          console.log(`  ${caption.slice(0, 150)}...`);
          console.log(`  ─────────────────────────────────`);

          // Write to social-post queue
          const postFile = path.join(path.dirname(fileURLToPath(import.meta.url)), `../../Agency/ops/post-${platform}-${item.id}.txt`);
          fs.writeFileSync(postFile, caption);

          await logToSupabase(item, platform, caption, 'generated');

        } catch (err) {
          console.error(`  [${platform.toUpperCase()}] Error:`, err.message);
        }
      }

      // Mark as processed
      item.status = 'generated';
      item.processed_at = new Date().toISOString();
    }

    saveQueue(queue);
    console.log(`\n[QUEUE] Done. Captions written to Agency/ops/post-*.txt`);
    console.log('[QUEUE] Review captions, then run social-post.js to fire them.');
  })();

} else {
  console.log(`
Crown Media Group — Content Queue

Commands:
  add --topic "topic" [--platforms ig,fb,x,tiktok,linkedin,threads] [--client shatiea]
  list     — show pending items
  run      — generate AI captions for all pending items
  clear    — remove completed items

Examples:
  node Agency/tools/content-queue.js add --topic "Why Columbia SC businesses are losing to AI-powered competitors"
  node Agency/tools/content-queue.js add --topic "Shatiea juice cleanse challenge" --client shatiea --platforms ig,fb,tiktok
  node Agency/tools/content-queue.js run
  `);
}
