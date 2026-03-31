#!/usr/bin/env node
/**
 * Crown Media Group — Blog Distributor
 * After each post publishes: generates social captions + sends email to King
 * Usage: node scripts/blog-distributor.js [--file "2026-03-31-post-slug.md"]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'blog');
const SITE_URL    = 'https://crownmediagroup.co/blog';

(function loadEnv() {
  const envFile = join(ROOT, '..', '.env');
  if (!existsSync(envFile)) return;
  readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trim().startsWith('#')) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !process.env[k]) process.env[k] = v;
    }
  });
})();

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
  fm._body = body;
  return fm;
}

function findLatestPost(specifiedFile) {
  if (specifiedFile) {
    const fp = join(CONTENT_DIR, specifiedFile);
    if (existsSync(fp)) return { path: fp, filename: specifiedFile };
  }
  const files = readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f, mtime: statSync(join(CONTENT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!files.length) return null;
  return { path: join(CONTENT_DIR, files[0].name), filename: files[0].name };
}

function buildCaptions(title, excerpt, slug, category) {
  const url = `${SITE_URL}/${slug}`;
  const shortExcerpt = excerpt.slice(0, 160);
  const categoryHashtags = {
    'Social Media': '#SocialMediaMarketing #InstagramTips #FacebookMarketing',
    'Paid Ads': '#FacebookAds #MetaAds #PaidAdvertising',
    'SEO': '#LocalSEO #GoogleBusiness #SearchMarketing',
    'Email Marketing': '#EmailMarketing #EmailStrategy',
    'Branding': '#BrandIdentity #SmallBusinessBranding',
    'AI Marketing': '#AIMarketing #MarketingAutomation #AITools',
    'Content Marketing': '#ContentMarketing #ContentStrategy',
    'Faith & Business': '#FaithDrivenBusiness #ChristianEntrepreneur',
    'Video Marketing': '#VideoMarketing #Reels #ShortFormVideo',
  };
  const catTags = categoryHashtags[category] || '#MarketingTips #SmallBusinessTips';
  return {
    instagram: `New post just dropped.\n\n${title}\n\n${shortExcerpt}\n\nRead the full guide at the link in bio\n\n${catTags} #ColumbiaScBusiness #CrownMediaGroup #ColumbiaScMarketing #SmallBusiness`,
    facebook: `${title}\n\n${shortExcerpt}\n\nPacked with actionable steps any Columbia SC business owner can use right now.\n\nRead the full post: ${url}\n\nWhat's your biggest marketing challenge? Drop it in the comments.`,
    twitter: `${title.slice(0, 80)}\n\nPractical steps for Columbia SC small businesses.\n\n${url}\n\n#ColumbiaScBusiness #MarketingTips`,
    linkedin: `${title}\n\n${shortExcerpt}\n\nCrown Media Group helps Columbia SC businesses grow with AI-powered marketing, social media management, and paid advertising.\n\nFull article: ${url}\n\n#ColumbiaScMarketing #SmallBusinessGrowth #DigitalMarketing`,
  };
}

async function sendEmail(title, slug, excerpt, category, captions) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) { console.log('[Distributor] No RESEND_API_KEY — skipping email.'); return; }
  const url = `${SITE_URL}/${slug}`;
  const html = `<!DOCTYPE html><html><head><style>body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;margin:0;padding:0}.container{max-width:640px;margin:0 auto;padding:24px}.header{background:#1a1a1a;border-radius:12px;padding:24px;margin-bottom:24px;border:1px solid #333}.badge{background:#c8a84b;color:#000;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;display:inline-block;margin-bottom:12px}h1{font-size:20px;font-weight:700;color:#fff;margin:0 0 8px;line-height:1.3}.excerpt{color:#999;font-size:14px;line-height:1.6;margin:0}.cta{display:inline-block;margin-top:16px;background:#c8a84b;color:#000;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px}.section{background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #333}.section h2{font-size:13px;font-weight:700;color:#c8a84b;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px}.caption{background:#111;border-radius:8px;padding:14px;font-size:13px;line-height:1.7;color:#ccc;white-space:pre-wrap;font-family:monospace}.platform{font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}.footer{text-align:center;font-size:12px;color:#555;margin-top:24px}</style></head><body><div class="container"><div class="header"><div class="badge">New Post Published</div><h1>${title}</h1><p class="excerpt">${excerpt}</p><a class="cta" href="${url}">View Live Post</a></div><div class="section"><h2>Ready-to-Post Social Captions</h2><div class="platform">Instagram</div><div class="caption">${captions.instagram}</div><br/><div class="platform">Facebook</div><div class="caption">${captions.facebook}</div><br/><div class="platform">Twitter / X</div><div class="caption">${captions.twitter}</div><br/><div class="platform">LinkedIn</div><div class="caption">${captions.linkedin}</div></div><div class="footer">Crown Media Group Auto-Blogger &bull; All Glory to Jesus &bull; <a href="https://crownmediagroup.co" style="color:#c8a84b;">crownmediagroup.co</a></div></div></body></html>`;
  try {
    await axios.post('https://api.resend.com/emails', {
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: ['king@crownmediagroup.co'],
      subject: `New post live: ${title.slice(0, 60)}`,
      html,
    }, { headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    console.log('[Distributor] Email sent to king@crownmediagroup.co');
  } catch (err) {
    console.error('[Distributor] Email failed:', err.response?.data || err.message);
  }
}

function writeSocialQueue(title, slug, captions) {
  const queueFile = join(ROOT, '..', 'Agency', 'Content', 'social-post-queue.json');
  let queue = [];
  try { if (existsSync(queueFile)) queue = JSON.parse(readFileSync(queueFile, 'utf8')); } catch {}
  const url = `${SITE_URL}/${slug}`;
  const now = new Date();
  ['instagram', 'facebook', 'twitter', 'linkedin'].forEach((platform, i) => {
    const postTime = new Date(now.getTime() + (i * 2 * 60 * 1000));
    queue.push({ id: `blog-${slug}-${platform}`, platform, caption: captions[platform], scheduledFor: postTime.toISOString(), status: 'pending', source: 'auto-blog', url, createdAt: now.toISOString() });
  });
  writeFileSync(queueFile, JSON.stringify(queue, null, 2));
  console.log(`[Distributor] Social queue written: ${queueFile}`);
}

async function main() {
  const fileIdx = process.argv.indexOf('--file');
  const specifiedFile = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;
  const post = findLatestPost(specifiedFile);
  if (!post) { console.error('[Distributor] No blog post found.'); process.exit(1); }
  console.log(`[Distributor] Processing: ${post.filename}`);
  const content = readFileSync(post.path, 'utf8');
  const fm = parseFrontmatter(content);
  const title    = fm.title || post.filename.replace('.md', '');
  const slug     = fm.slug  || post.filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
  const excerpt  = fm.excerpt || fm._excerpt || '';
  const category = fm.category || 'Marketing';
  console.log(`[Distributor] Title: "${title}"`);
  const captions = buildCaptions(title, excerpt, slug, category);
  await Promise.all([sendEmail(title, slug, excerpt, category, captions), Promise.resolve(writeSocialQueue(title, slug, captions))]);
  console.log('[Distributor] Done.');
}

main().catch(err => { console.error('[Distributor] Error:', err.message); process.exit(1); });
