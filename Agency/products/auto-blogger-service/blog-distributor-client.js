#!/usr/bin/env node
/**
 * Crown Media Group — Auto-Blogger Service
 * Client Blog Distributor — sends email notification + generates social captions
 *
 * Usage:
 *   CLIENT_CONFIG=client-slug node blog-distributor-client.js [--file "2026-04-01-slug.md"]
 *   CLIENT_CONFIG_PATH=/abs/path/config.json node blog-distributor-client.js
 *
 * Env vars:
 *   CLIENT_CONFIG       — slug matching clients/[slug]/config.json (relative to this script)
 *   CLIENT_CONFIG_PATH  — absolute path to config.json (overrides CLIENT_CONFIG)
 *   RESEND_API_KEY      — Resend API key
 *   ANTHROPIC_API_KEY   — Claude API key (for caption generation)
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Config loader ─────────────────────────────────────────────────────────────
function loadConfig() {
  let configPath = process.env.CLIENT_CONFIG_PATH;

  if (!configPath) {
    const slug = process.env.CLIENT_CONFIG;
    if (!slug) {
      console.error('Error: Set CLIENT_CONFIG=<slug> or CLIENT_CONFIG_PATH=<abs-path>');
      process.exit(1);
    }
    configPath = join(__dirname, 'clients', slug, 'config.json');
  }

  if (!existsSync(configPath)) {
    console.error(`Error: Config not found at ${configPath}`);
    process.exit(1);
  }

  // Load .env from config directory, then fallback to repo root
  const configDir = dirname(configPath);
  for (const envDir of [configDir, join(__dirname, '..', '..', '..')]) {
    const envFile = join(envDir, '.env');
    if (existsSync(envFile)) {
      readFileSync(envFile, 'utf8').split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0 && !line.trim().startsWith('#')) {
          const k = line.slice(0, eq).trim();
          const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          if (k && !process.env[k]) process.env[k] = v;
        }
      });
      break;
    }
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`Error: Could not parse config at ${configPath}: ${err.message}`);
    process.exit(1);
  }
}

// ─── Front matter parser ──────────────────────────────────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  match[1].split('\n').forEach(line => {
    const eq = line.indexOf(':');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    fm[key] = val;
  });
  const body = content.slice(match[0].length).trim();
  const firstPara = body.split('\n')
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#') && !l.startsWith('*') && l.length > 40) || '';
  fm._excerpt = firstPara.slice(0, 200);
  fm._body    = body;
  return fm;
}

// ─── Find most recent post in content dir ─────────────────────────────────────
function findLatestPost(contentDir, specifiedFile) {
  if (specifiedFile) {
    const fp = join(contentDir, specifiedFile);
    if (existsSync(fp)) return { path: fp, filename: specifiedFile };
    console.error(`Specified file not found: ${fp}`);
    process.exit(1);
  }
  if (!existsSync(contentDir)) {
    console.error(`Content directory not found: ${contentDir}`);
    process.exit(1);
  }
  const files = readdirSync(contentDir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, mtime: statSync(join(contentDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) return null;
  return { path: join(contentDir, files[0].name), filename: files[0].name };
}

// ─── Generate social captions with Claude ─────────────────────────────────────
async function generateCaptions(config, title, excerpt, body, category) {
  const { client, brand, distribution } = config;
  const biz      = client.businessName;
  const blogUrl  = client.blogUrl || client.website;
  const igTags   = distribution.instagramHashtags || '';
  const city     = brand.city || '';
  const niche    = brand.niche || brand.industry || '';
  const ctaUrl   = brand.ctaUrl || client.website;
  const bodySnip = body.slice(0, 1200); // keep prompt lean

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('[Distributor] No ANTHROPIC_API_KEY — using static caption fallback.');
    return buildStaticCaptions(title, excerpt, blogUrl, category, biz, city, igTags);
  }

  const anthropicClient = new Anthropic({ apiKey });

  const prompt = `You are writing social media captions to promote a new blog post for ${biz}, a ${niche} business in ${city}.

BLOG POST TITLE: ${title}
EXCERPT: ${excerpt}
BLOG URL: ${blogUrl}
CATEGORY: ${category}

POST CONTENT SNIPPET:
${bodySnip}

Write 4 platform-specific captions. Each must:
- Be native to the platform's tone and format
- Drive clicks to the blog post URL
- Sound like the business owner wrote it, NOT a marketer
- Be ready to copy-paste with zero editing

Return your response in this exact JSON format (valid JSON only, no markdown):
{
  "instagram": "caption text here",
  "facebook": "caption text here",
  "twitter": "caption text here",
  "linkedin": "caption text here"
}

Platform rules:
- Instagram: punchy opening line, line breaks for whitespace, 3–5 sentences, end with "Link in bio." — DO NOT include hashtags (they will be added separately)
- Facebook: conversational, 4–6 sentences, include the blog URL inline, end with a question to spark comments
- Twitter/X: max 250 chars, punchy, include the blog URL at the end
- LinkedIn: professional but warm, 4–6 sentences, talk about value for ${niche} customers, include the blog URL`;

  try {
    const message = await anthropicClient.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = message.content[0].text.trim();
    // Strip any markdown code fences if Claude wraps it
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const captions = JSON.parse(jsonStr);

    // Append Instagram hashtags
    if (igTags) {
      captions.instagram = `${captions.instagram}\n\n${igTags}`;
    }

    return captions;
  } catch (err) {
    console.warn(`[Distributor] Claude caption generation failed (${err.message}) — using static fallback.`);
    return buildStaticCaptions(title, excerpt, blogUrl, category, biz, city, igTags);
  }
}

// ─── Static caption fallback (no API key) ────────────────────────────────────
function buildStaticCaptions(title, excerpt, blogUrl, category, biz, city, igTags) {
  const shortExcerpt = excerpt.slice(0, 160);
  const captions = {
    instagram: `New post just dropped.\n\n${title}\n\n${shortExcerpt}\n\nLink in bio.${igTags ? '\n\n' + igTags : ''}`,
    facebook:  `${title}\n\n${shortExcerpt}\n\nRead the full post: ${blogUrl}\n\nWhat are your thoughts? Drop them in the comments.`,
    twitter:   `${title.slice(0, 180)}\n\n${blogUrl}`,
    linkedin:  `${title}\n\n${shortExcerpt}\n\n${biz} serves ${city}. Read the full guide: ${blogUrl}\n\n#SmallBusiness #${city.replace(/\s/g, '')}`,
  };
  return captions;
}

// ─── Email builder ────────────────────────────────────────────────────────────
function buildEmail(config, title, slug, excerpt, captions) {
  const { client, brand } = config;
  const blogUrl = `${client.blogUrl || client.website}/${slug}`;
  const biz     = client.businessName;

  // Clean colors — use brand colors if available, else dark neutral defaults
  const accentColor = '#1a1a2e';
  const goldColor   = '#c8a84b';

  const platformSections = ['instagram', 'facebook', 'twitter', 'linkedin']
    .map(platform => {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      const caption = captions[platform] || '';
      return `<div class="platform">${label}</div><div class="caption">${escapeHtml(caption)}</div><br/>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; color: #1a1a1a; margin: 0; padding: 0; }
  .container { max-width: 640px; margin: 0 auto; padding: 24px; }
  .header { background: ${accentColor}; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
  .badge { background: ${goldColor}; color: #000; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; display: inline-block; margin-bottom: 12px; }
  h1 { font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 8px; line-height: 1.3; }
  .excerpt { color: #aaa; font-size: 14px; line-height: 1.6; margin: 0; }
  .cta { display: inline-block; margin-top: 16px; background: ${goldColor}; color: #000; font-weight: 700; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; }
  .section { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #e0e0e0; }
  .section h2 { font-size: 13px; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 14px; }
  .caption { background: #f9f9f9; border-radius: 8px; padding: 14px; font-size: 13px; line-height: 1.7; color: #333; white-space: pre-wrap; font-family: monospace; border: 1px solid #e8e8e8; }
  .platform { font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; margin-top: 14px; }
  .platform:first-child { margin-top: 0; }
  .footer { text-align: center; font-size: 12px; color: #999; margin-top: 24px; }
  .footer a { color: ${goldColor}; text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="badge">New Blog Post</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="excerpt">${escapeHtml(excerpt)}</p>
    <a class="cta" href="${blogUrl}">View Post</a>
  </div>

  <div class="section">
    <h2>Ready-to-Post Social Captions</h2>
    ${platformSections}
  </div>

  <div class="footer">
    ${escapeHtml(biz)} Auto-Blogger &bull; Powered by <a href="https://crownmediagroup.co">Crown Media Group</a>
  </div>
</div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Send email via Resend ────────────────────────────────────────────────────
async function sendEmail(config, title, slug, excerpt, captions) {
  const { client, distribution } = config;

  if (!distribution.sendEmail) {
    console.log('[Distributor] sendEmail is false in config — skipping email.');
    return;
  }

  const notifyEmail = client.notifyEmail;
  if (!notifyEmail) {
    console.log('[Distributor] No notifyEmail in config — skipping email.');
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log('[Distributor] No RESEND_API_KEY — skipping email.');
    return;
  }

  const subject = `New blog post — ${client.businessName} — ${title.slice(0, 60)}`;
  const html    = buildEmail(config, title, slug, excerpt, captions);

  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from:    'Crown Media Group <king@crownmediagroup.co>',
        to:      [notifyEmail],
        subject,
        html,
      },
      {
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    console.log(`[Distributor] Email sent to ${notifyEmail}`);
  } catch (err) {
    console.error('[Distributor] Email failed:', err.response?.data || err.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const config = loadConfig();
  const { client, github } = config;
  const slug = client.slug || process.env.CLIENT_CONFIG || 'client';

  const clientDir  = process.env.CLIENT_CONFIG_PATH
    ? dirname(process.env.CLIENT_CONFIG_PATH)
    : join(__dirname, 'clients', slug);

  const contentDir = join(clientDir, github.blogContentPath || 'content/blog');

  const fileIdx       = process.argv.indexOf('--file');
  const specifiedFile = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;

  const post = findLatestPost(contentDir, specifiedFile);
  if (!post) {
    console.error('[Distributor] No blog post found in content directory.');
    process.exit(1);
  }

  console.log(`[Distributor] Client: ${client.businessName}`);
  console.log(`[Distributor] Processing: ${post.filename}`);

  const content = readFileSync(post.path, 'utf8');
  const fm      = parseFrontmatter(content);

  const title    = fm.title    || post.filename.replace('.md', '');
  const postSlug = fm.slug     || post.filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
  const excerpt  = fm.excerpt  || fm._excerpt || '';
  const category = fm.category || (config.content.categories?.[0] || 'General');
  const body     = fm._body    || '';

  console.log(`[Distributor] Title: "${title}"`);

  // Generate captions with Claude (falls back to static if no API key)
  console.log('[Distributor] Generating social captions...');
  const captions = await generateCaptions(config, title, excerpt, body, category);

  // Print captions to console for reference
  console.log('\n── Social Captions ──────────────────────────────────────────');
  for (const [platform, caption] of Object.entries(captions)) {
    console.log(`\n[${platform.toUpperCase()}]\n${caption}`);
  }
  console.log('\n─────────────────────────────────────────────────────────────\n');

  // Send email
  await sendEmail(config, title, postSlug, excerpt, captions);

  console.log('[Distributor] Done.');
}

main().catch(err => {
  console.error('[Distributor] Error:', err.message);
  process.exit(1);
});
