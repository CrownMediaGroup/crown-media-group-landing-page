#!/usr/bin/env node
/**
 * amplify-engine.js — Crown Media Group Content Amplification Engine
 *
 * Takes one piece of content and deploys it across all platforms:
 * - AI repurposes for each platform's native format (Claude Haiku)
 * - Hashtag research via Exa
 * - Passes variants to social-post.js for scheduling
 * - Comment-to-DM config generation (ManyChat/LinkDM webhook format)
 * - Weekly engagement report via Resend
 *
 * Usage:
 *   node tools/amplify-engine.js --content "Your raw content here" --platforms all
 *   node tools/amplify-engine.js --file Agency/ops/content/shatiea-2026-04-08.md
 *   node tools/amplify-engine.js --test
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const https   = require('https');

const ROOT = path.join(__dirname, '..');

// ── Env ────────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: path.join(ROOT, 'landing-page/.env') });

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const RESEND_KEY    = process.env.RESEND_API_KEY;
const EXA_KEY       = process.env.EXA_API_KEY;

// ── Platform configs ───────────────────────────────────────────────────────────
const PLATFORMS = {
  instagram: {
    name: 'Instagram',
    maxChars: 2200,
    hashtagCount: 5,
    prompt: 'Write an Instagram caption. Lead with a scroll-stopping hook (first line). Bold and direct. End with a call-to-action. Under 150 words. Then list exactly 5 relevant hashtags on a new line prefixed with "HASHTAGS:".',
  },
  facebook: {
    name: 'Facebook',
    maxChars: 63206,
    hashtagCount: 3,
    prompt: 'Write a Facebook post. Conversational, slightly longer than Instagram. Include a question to drive comments. Under 200 words. End with 3 hashtags on a new line prefixed with "HASHTAGS:".',
  },
  twitter: {
    name: 'X (Twitter)',
    maxChars: 280,
    hashtagCount: 2,
    prompt: 'Write a punchy X/Twitter post. Under 240 characters. One strong idea. 2 hashtags max, listed at the end after "HASHTAGS:".',
  },
  linkedin: {
    name: 'LinkedIn',
    maxChars: 3000,
    hashtagCount: 4,
    prompt: 'Write a LinkedIn post. Professional but personal. 150-250 words. Share insight or lesson. End with a question that invites connection. Then 4 hashtags on a new line after "HASHTAGS:".',
  },
  tiktok: {
    name: 'TikTok',
    maxChars: 2200,
    hashtagCount: 5,
    prompt: 'Write a TikTok caption + script hook. First: a 2-3 sentence opening script hook (the first 3 seconds of the video — must create curiosity or urgency). Then the caption (under 100 words). Then 5 trending hashtags after "HASHTAGS:".',
  },
};

// ── Claude Haiku call ──────────────────────────────────────────────────────────
async function callClaude(systemPrompt, userContent) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: 'You are an expert social media copywriter for Crown Media Group, a faith-aligned AI marketing agency. Write in a bold, direct, results-focused voice. No fluff.',
    messages: [{ role: 'user', content: `Platform instruction: ${systemPrompt}\n\nOriginal content to repurpose:\n\n${userContent}` }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.content?.[0]?.text || '').trim());
        } catch { reject(new Error('Claude parse error')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Exa hashtag research ───────────────────────────────────────────────────────
async function researchHashtags(niche, platform) {
  if (!EXA_KEY) return [];

  const body = JSON.stringify({
    query: `top trending hashtags ${platform} ${niche} 2025`,
    numResults: 5,
    type: 'neural',
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.exa.ai',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const titles = (parsed.results || []).map(r => r.title || '').join(' ');
          const hashtags = [...titles.matchAll(/#\w+/g)].map(m => m[0]).slice(0, 10);
          resolve(hashtags);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.write(body);
    req.end();
  });
}

// ── Repurpose content for all platforms ───────────────────────────────────────
async function repurposeContent(rawContent, platforms = Object.keys(PLATFORMS)) {
  const variants = {};

  await Promise.all(platforms.map(async (platform) => {
    if (!PLATFORMS[platform]) return;
    const config = PLATFORMS[platform];
    console.log(`[Amplify] Generating ${config.name} variant...`);

    const text = await callClaude(config.prompt, rawContent);

    // Extract hashtags from response
    const hashtagLine = text.match(/HASHTAGS:(.*)/i)?.[1]?.trim() || '';
    const caption = text.replace(/HASHTAGS:.*/i, '').trim();
    const hashtags = hashtagLine.split(/\s+/).filter(h => h.startsWith('#')).slice(0, config.hashtagCount);

    variants[platform] = {
      platform,
      platformName: config.name,
      caption,
      hashtags,
      full: `${caption}\n\n${hashtags.join(' ')}`.trim(),
    };

    console.log(`[Amplify] ${config.name} done — ${caption.length} chars, ${hashtags.length} hashtags`);
  }));

  return variants;
}

// ── Generate DM flow config (ManyChat/LinkDM webhook format) ──────────────────
function generateDMFlowConfig({ keyword, responseMessage, clientName }) {
  return {
    trigger: {
      type: 'comment_keyword',
      keywords: [keyword, keyword.toUpperCase(), keyword.toLowerCase()],
      platforms: ['instagram', 'facebook'],
    },
    action: {
      type: 'send_dm',
      message: responseMessage,
      delay_seconds: 5,
    },
    meta: {
      client: clientName,
      created: new Date().toISOString(),
      note: 'Meta-approved comment-to-DM flow. Configure in ManyChat or LinkDM dashboard.',
    },
  };
}

// ── Resend email ───────────────────────────────────────────────────────────────
async function sendReport({ to, subject, html, text }) {
  if (!RESEND_KEY) { console.warn('[Amplify] No RESEND_API_KEY — skipping email'); return false; }

  const body = JSON.stringify({ from: 'Crown Media Group <king@crownmediagroup.co>', to, subject, html, text });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { resolve(res.statusCode === 200); });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// ── Build weekly engagement report ────────────────────────────────────────────
async function buildEngagementReport({ clientName, clientEmail, postsData }) {
  const totalPosts = postsData.length;
  const platforms = [...new Set(postsData.map(p => p.platform))];

  const html = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1a1a2e;padding:24px;text-align:center">
    <h1 style="color:#C9A84C;margin:0;font-size:20px">Weekly Amplify Report</h1>
    <p style="color:#888;margin:8px 0 0;font-size:13px">${clientName} — Week of ${new Date().toLocaleDateString()}</p>
  </div>
  <div style="padding:32px;background:#fff">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px">
      <div style="text-align:center;background:#f9f9f9;padding:16px;border-radius:8px">
        <div style="font-size:2rem;font-weight:800;color:#C9A84C">${totalPosts}</div>
        <div style="font-size:11px;color:#666;text-transform:uppercase">Posts Sent</div>
      </div>
      <div style="text-align:center;background:#f9f9f9;padding:16px;border-radius:8px">
        <div style="font-size:2rem;font-weight:800;color:#C9A84C">${platforms.length}</div>
        <div style="font-size:11px;color:#666;text-transform:uppercase">Platforms</div>
      </div>
      <div style="text-align:center;background:#f9f9f9;padding:16px;border-radius:8px">
        <div style="font-size:2rem;font-weight:800;color:#C9A84C">${postsData.filter(p => p.status === 'posted').length}</div>
        <div style="font-size:11px;color:#666;text-transform:uppercase">Live</div>
      </div>
    </div>
    <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">Posts This Week</h3>
    ${postsData.map(p => `
      <div style="border-left:3px solid #C9A84C;padding:8px 12px;margin-bottom:8px;background:#fafafa">
        <div style="font-size:12px;font-weight:700;color:#1a1a2e">${p.platform.toUpperCase()}</div>
        <div style="font-size:13px;color:#444;margin-top:2px">${p.caption?.slice(0, 100)}...</div>
      </div>
    `).join('')}
    <div style="margin-top:32px;padding:16px;background:#f0fdf4;border-left:4px solid #059669;border-radius:4px">
      <strong>Next week:</strong> We'll keep the same cadence and monitor for comment patterns. Any post getting consistent engagement will have comment-to-DM activated.
    </div>
    <p style="margin-top:24px;font-size:13px;color:#666">Questions? Reply to this email or text King directly.<br><br>— Crown Media Group</p>
  </div>
</div>`;

  const sent = await sendReport({
    to: clientEmail,
    subject: `Your Amplify Report — ${totalPosts} posts across ${platforms.join(', ')}`,
    html,
    text: `Amplify Report for ${clientName}\n\nPosts sent: ${totalPosts}\nPlatforms: ${platforms.join(', ')}\n\nContact: king@crownmediagroup.co`,
  });

  return sent;
}

// ── Save amplify job to queue ──────────────────────────────────────────────────
function saveToQueue(job) {
  const queueFile = path.join(ROOT, 'Agency/ops/amplify-queue.json');
  let queue = [];
  if (fs.existsSync(queueFile)) {
    try { queue = JSON.parse(fs.readFileSync(queueFile, 'utf8')); } catch { queue = []; }
  }
  queue.push({ ...job, queued_at: new Date().toISOString(), status: 'pending' });
  fs.writeFileSync(queueFile, JSON.stringify(queue, null, 2));
  console.log(`[Amplify] Job queued → Agency/ops/amplify-queue.json`);
}

// ── Main / CLI ─────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  // Test mode
  if (args.includes('--test')) {
    const testContent = `AI marketing is changing everything for small businesses. Most owners are spending hours on content that gets zero traction. We built a system that does it for them — automatically posting to every platform, at the right time, with the right hashtags. The result: 3x more reach in 30 days. All Glory to Jesus for the wisdom to build this.`;

    console.log('[Amplify Test] Repurposing test content for all 5 platforms...\n');
    const variants = await repurposeContent(testContent, ['instagram', 'facebook', 'twitter', 'linkedin', 'tiktok']);

    for (const [platform, data] of Object.entries(variants)) {
      console.log(`\n=== ${data.platformName.toUpperCase()} ===`);
      console.log(data.full);
      console.log(`(${data.caption.length} chars)`);
    }

    // DM flow config sample
    const dmConfig = generateDMFlowConfig({
      keyword: 'link',
      responseMessage: 'Here is your link to get started with Crown Media Group: https://crownmediagroup.co — reply with any questions!',
      clientName: 'Crown Media Group',
    });
    console.log('\n=== COMMENT-TO-DM CONFIG ===');
    console.log(JSON.stringify(dmConfig, null, 2));

    console.log('\n[Amplify Test] Complete.');
    return;
  }

  // File mode
  const fileArg = args.find((a, i) => args[i - 1] === '--file');
  const contentArg = args.find((a, i) => args[i - 1] === '--content');
  const platformsArg = args.find((a, i) => args[i - 1] === '--platforms') || 'all';

  let rawContent = '';
  if (fileArg) {
    rawContent = fs.readFileSync(path.resolve(ROOT, fileArg), 'utf8');
  } else if (contentArg) {
    rawContent = contentArg;
  } else {
    console.error('Usage: node tools/amplify-engine.js --content "text" | --file path/to/file.md | --test');
    process.exit(1);
  }

  const platforms = platformsArg === 'all' ? Object.keys(PLATFORMS) : platformsArg.split(',');
  const variants = await repurposeContent(rawContent, platforms);

  // Save variants to output file
  const outDir = path.join(ROOT, 'Agency/ops/content');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const outFile = path.join(outDir, `amplify-${today}.json`);
  fs.writeFileSync(outFile, JSON.stringify(variants, null, 2));
  console.log(`\n[Amplify] Variants saved → Agency/ops/content/amplify-${today}.json`);

  // Save to queue for standalone-runner pickup
  saveToQueue({ date: today, platforms, variantsFile: outFile });
}

main().catch(e => {
  console.error('[Amplify] Fatal:', e.message);
  process.exit(1);
});
