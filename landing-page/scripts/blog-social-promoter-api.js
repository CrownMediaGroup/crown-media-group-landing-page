#!/usr/bin/env node
/**
 * Crown Media Group — Blog Social Promoter (API-based)
 * Posts each new blog post to X, LinkedIn, Facebook, Reddit, Medium, and Hashnode via their APIs.
 * Runs as a GitHub Actions step — no browser, no computer needed.
 *
 * Required GitHub Secrets (add at github.com/settings/secrets/actions):
 *   X (Twitter):   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
 *   LinkedIn:      LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN  (or LINKEDIN_ORG_ID for Company Page)
 *   Facebook:      FACEBOOK_PAGE_ID, FACEBOOK_PAGE_ACCESS_TOKEN
 *   Reddit:        REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *                  REDDIT_SUBREDDITS (comma-separated: "smallbusiness,columbiasc,marketing")
 *   Medium:        MEDIUM_INTEGRATION_TOKEN  (get at medium.com/me/settings → Integration Tokens)
 *   Hashnode:      HASHNODE_ACCESS_TOKEN, HASHNODE_PUBLICATION_ID  (get at hashnode.com/settings → API)
 *
 * Usage:
 *   node scripts/blog-social-promoter-api.js
 *   node scripts/blog-social-promoter-api.js --dry-run
 *   node scripts/blog-social-promoter-api.js --file 2026-04-01-my-post.md
 */

import { createHmac, createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'blog');
const LOG_FILE    = join(ROOT, 'content', 'blog', '.promotion-log.json');
const SITE_URL    = 'https://crownmediagroup.co/blog';

const DRY_RUN = process.argv.includes('--dry-run');
const fileIdx = process.argv.indexOf('--file');
const SPECIFIED_FILE = fileIdx !== -1 ? process.argv[fileIdx + 1] : null;

// ── Env loader ────────────────────────────────────────────────────────────────
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

// ── Parse frontmatter ─────────────────────────────────────────────────────────
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
  fm._excerpt = body.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && !l.startsWith('*') && l.length > 40) || '';
  return fm;
}

// ── Find latest unposted post ─────────────────────────────────────────────────
function findPost() {
  if (SPECIFIED_FILE) {
    const fp = join(CONTENT_DIR, SPECIFIED_FILE);
    if (existsSync(fp)) return { path: fp, filename: SPECIFIED_FILE };
  }
  const log = loadLog();
  const files = readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md') && f !== 'fallback-post.md')
    .map(f => ({ name: f, mtime: statSync(join(CONTENT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  // Find newest post not yet promoted to all platforms
  for (const file of files) {
    const key = file.name.replace('.md', '');
    const posted = log[key] || {};
    const platforms = ['x', 'linkedin', 'facebook', 'reddit'];
    const allPosted = platforms.every(p => posted[p] === 'done');
    if (!allPosted) return { path: join(CONTENT_DIR, file.name), filename: file.name };
  }
  return null;
}

function loadLog() {
  if (!existsSync(LOG_FILE)) return {};
  try { return JSON.parse(readFileSync(LOG_FILE, 'utf8')); } catch { return {}; }
}

function saveLog(log) {
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Platform-optimized caption generators ────────────────────────────────────
// Rules: max 3 hashtags per platform, algorithm-first, no filler
function buildCaptions(fm) {
  const title   = fm.title || 'New Post';
  const excerpt = (fm.excerpt || fm._excerpt || '').slice(0, 200).replace(/\s\S*$/, '');
  const slug    = fm.slug   || '';
  const url     = `${SITE_URL}/${slug}/`;
  const cat     = fm.category || 'Marketing';

  // One sharp hashtag per category — quality over quantity
  const catTag = {
    'Social Media':      '#SocialMedia',
    'Paid Ads':          '#PaidAds',
    'SEO':               '#SEO',
    'AI Marketing':      '#AIMarketing',
    'Faith & Business':  '#FaithAndBusiness',
    'Content Marketing': '#ContentMarketing',
    'Branding':          '#Branding',
    'Email Marketing':   '#EmailMarketing',
    'Video Marketing':   '#VideoMarketing',
  }[cat] || '#Marketing';

  return {
    // X/Twitter: hook first, link last, 3 targeted hashtags. Short = more reach.
    x: `${title}\n\n${excerpt.slice(0, 100)}...\n\n${url}\n\n${catTag} #SmallBusiness #ColumbiaScBusiness`.slice(0, 280),

    // LinkedIn: professional tone, insight-first, question to drive comments, 3 hashtags
    linkedin: `${title}\n\n${excerpt}\n\nIf you run a business in Columbia SC — this one is for you.\n\n→ ${url}\n\n${catTag} #SmallBusinessGrowth #DigitalMarketing`,

    // Facebook: conversational, relatable, question at the end to trigger algorithm
    // No hashtags on Facebook — they kill organic reach
    facebook: `New post: ${title}\n\n${excerpt}\n\nFull article → ${url}\n\nDrop a comment: what's the #1 thing holding your business back right now?`,

    // Reddit: educational framing, no salesy language, community-first
    reddit: {
      title: `${title} — Practical guide for local business owners`,
      text:  `${excerpt}\n\nFull breakdown here: ${url}\n\nHappy to answer questions in the comments. What's working (or not) for marketing in your area?`,
    },
  };
}

// ── Twitter / X ───────────────────────────────────────────────────────────────
// OAuth 1.0a signing — no extra npm package needed
function buildOAuth1Header(method, url, params, consumer_key, consumer_secret, token, token_secret) {
  const nonce     = randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauth_params = {
    oauth_consumer_key:     consumer_key,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_token:            token,
    oauth_version:          '1.0',
  };
  const all_params = Object.entries({ ...params, ...oauth_params })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const base = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(all_params)].join('&');
  const signing_key = `${encodeURIComponent(consumer_secret)}&${encodeURIComponent(token_secret)}`;
  const signature   = createHmac('sha1', signing_key).update(base).digest('base64');
  oauth_params.oauth_signature = signature;
  const header = 'OAuth ' + Object.entries(oauth_params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(', ');
  return header;
}

async function postToX(text) {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = process.env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
    console.log('[X] Skipping — X_API_KEY not set. See README for setup.');
    return { skipped: true };
  }
  const url = 'https://api.twitter.com/2/tweets';
  const body = { text };
  const header = buildOAuth1Header('POST', url, {}, X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET);
  const res = await axios.post(url, body, {
    headers: { Authorization: header, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return { id: res.data?.data?.id, url: `https://twitter.com/i/web/status/${res.data?.data?.id}` };
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────
async function postToLinkedIn(text) {
  const token  = process.env.LINKEDIN_ACCESS_TOKEN;
  const author = process.env.LINKEDIN_PERSON_URN || process.env.LINKEDIN_ORG_URN;
  if (!token || !author) {
    console.log('[LinkedIn] Skipping — LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN not set.');
    return { skipped: true };
  }
  const isOrg = author.startsWith('urn:li:organization:');
  const res = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary:   { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    timeout: 15000,
  });
  return { id: res.data?.id };
}

// ── Facebook ──────────────────────────────────────────────────────────────────
async function postToFacebook(text) {
  const pageId    = process.env.FACEBOOK_PAGE_ID;
  const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !pageToken) {
    console.log('[Facebook] Skipping — FACEBOOK_PAGE_ID or FACEBOOK_PAGE_ACCESS_TOKEN not set.');
    return { skipped: true };
  }
  const res = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    message: text,
    access_token: pageToken,
  }, { timeout: 15000 });
  return { id: res.data?.id };
}

// ── Reddit ────────────────────────────────────────────────────────────────────
async function postToReddit({ title, text }) {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env;
  const subredditsRaw = process.env.REDDIT_SUBREDDITS || '';
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD || !subredditsRaw) {
    console.log('[Reddit] Skipping — Reddit credentials not set.');
    return { skipped: true };
  }
  // Get access token
  const tokenRes = await axios.post('https://www.reddit.com/api/v1/access_token',
    new URLSearchParams({ grant_type: 'password', username: REDDIT_USERNAME, password: REDDIT_PASSWORD }),
    {
      auth: { username: REDDIT_CLIENT_ID, password: REDDIT_CLIENT_SECRET },
      headers: { 'User-Agent': 'CrownMediaGroup/1.0 (by /u/' + REDDIT_USERNAME + ')' },
      timeout: 10000,
    }
  );
  const accessToken = tokenRes.data?.access_token;
  if (!accessToken) throw new Error('Reddit token exchange failed');

  const subreddits = subredditsRaw.split(',').map(s => s.trim()).filter(Boolean);
  const results = [];
  for (const sub of subreddits) {
    try {
      const res = await axios.post('https://oauth.reddit.com/api/submit',
        new URLSearchParams({ kind: 'self', sr: sub, title, text, resubmit: 'false', nsfw: 'false', spoiler: 'false' }),
        {
          headers: {
            Authorization: `bearer ${accessToken}`,
            'User-Agent': 'CrownMediaGroup/1.0 (by /u/' + REDDIT_USERNAME + ')',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        }
      );
      const permalink = res.data?.json?.data?.url;
      console.log(`[Reddit] Posted to r/${sub}: ${permalink}`);
      results.push({ sub, permalink });
      // Reddit rate limit — wait 2s between subs
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[Reddit] r/${sub} failed: ${err.response?.data?.message || err.message}`);
    }
  }
  return results;
}

// ── Medium ────────────────────────────────────────────────────────────────────
// Publishes full post to Medium as a cross-post linking back to the canonical URL.
async function postToMedium(fm, content, canonicalUrl) {
  const token = process.env.MEDIUM_INTEGRATION_TOKEN;
  if (!token) {
    console.log('[Medium] Skipping — MEDIUM_INTEGRATION_TOKEN not set. Get it at medium.com/me/settings → Integration Tokens');
    return { skipped: true };
  }
  // Get user ID
  const meRes = await axios.get('https://api.medium.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` }, timeout: 10000,
  });
  const userId = meRes.data?.data?.id;
  if (!userId) throw new Error('Medium: could not get user ID');

  const title   = fm.title || 'New Post';
  const tags    = (fm.tags || fm.category || 'Marketing,Small Business,Columbia SC')
    .split(',').map(t => t.trim()).slice(0, 5);
  // Strip frontmatter and use body as markdown content
  const body    = content.replace(/^---[\s\S]*?---\n/, '').trim();

  const res = await axios.post(`https://api.medium.com/v1/users/${userId}/posts`, {
    title,
    contentFormat: 'markdown',
    content:       `# ${title}\n\n${body}`,
    tags,
    canonicalUrl,
    publishStatus: 'public',
  }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  return { id: res.data?.data?.id, url: res.data?.data?.url };
}

// ── Hashnode ──────────────────────────────────────────────────────────────────
// Publishes full post to Hashnode via GraphQL API with canonical URL set.
async function postToHashnode(fm, content, canonicalUrl) {
  const token         = process.env.HASHNODE_ACCESS_TOKEN;
  const publicationId = process.env.HASHNODE_PUBLICATION_ID;
  if (!token || !publicationId) {
    console.log('[Hashnode] Skipping — HASHNODE_ACCESS_TOKEN or HASHNODE_PUBLICATION_ID not set. Get them at hashnode.com/settings → API');
    return { skipped: true };
  }
  const title    = fm.title || 'New Post';
  const body     = content.replace(/^---[\s\S]*?---\n/, '').trim();
  const tags     = (fm.tags || fm.category || 'Marketing')
    .split(',').map(t => ({ name: t.trim(), slug: t.trim().toLowerCase().replace(/\s+/g, '-') })).slice(0, 5);

  const query = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        post { id url title }
      }
    }
  `;
  const variables = {
    input: {
      title,
      publicationId,
      contentMarkdown: body,
      originalArticleURL: canonicalUrl,
      tags,
    },
  };
  const res = await axios.post('https://gql.hashnode.com', { query, variables }, {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  const post = res.data?.data?.createPost?.post;
  if (!post) throw new Error(`Hashnode error: ${JSON.stringify(res.data?.errors)}`);
  return { id: post.id, url: post.url };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const post = findPost();
  if (!post) {
    console.log('[Social Promoter] No new posts to promote.');
    return;
  }

  const rawContent = readFileSync(post.path, 'utf8');
  const fm = parseFrontmatter(rawContent);
  if (fm.draft === 'true') {
    console.log('[Social Promoter] Post is draft — skipping.');
    return;
  }

  const title    = fm.title || post.filename;
  const slug     = fm.slug  || post.filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
  const url      = `${SITE_URL}/${slug}/`;
  const captions = buildCaptions(fm);
  const logKey   = post.filename.replace('.md', '');
  const log      = loadLog();

  console.log(`\n[Social Promoter] Promoting: "${title}"`);
  console.log(`URL: ${url}\n`);

  if (DRY_RUN) {
    console.log('=== DRY RUN — No posts will be made ===\n');
    console.log('[X]:\n' + captions.x);
    console.log('\n[LinkedIn]:\n' + captions.linkedin);
    console.log('\n[Facebook]:\n' + captions.facebook);
    console.log('\n[Reddit title]:\n' + captions.reddit.title);
    console.log('[Reddit body]:\n' + captions.reddit.text);
    console.log('\n[Medium]: Full post published with canonical URL → ' + url);
    console.log('[Hashnode]: Full post published with canonical URL → ' + url);
    return;
  }

  const postLog = log[logKey] || {};

  // Post to each platform
  const tasks = [
    { name: 'x',        fn: () => postToX(captions.x) },
    { name: 'linkedin', fn: () => postToLinkedIn(captions.linkedin) },
    { name: 'facebook', fn: () => postToFacebook(captions.facebook) },
    { name: 'reddit',   fn: () => postToReddit(captions.reddit) },
    { name: 'medium',   fn: () => postToMedium(fm, rawContent, url) },
    { name: 'hashnode', fn: () => postToHashnode(fm, rawContent, url) },
  ];

  for (const task of tasks) {
    if (postLog[task.name] === 'done') {
      console.log(`[${task.name.toUpperCase()}] Already posted — skipping.`);
      continue;
    }
    try {
      const result = await task.fn();
      if (result?.skipped) continue;
      console.log(`[${task.name.toUpperCase()}] Posted successfully.`, result);
      postLog[task.name] = 'done';
    } catch (err) {
      console.error(`[${task.name.toUpperCase()}] Failed: ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`);
      postLog[task.name] = 'failed';
    }
  }

  log[logKey] = postLog;
  saveLog(log);
  console.log('\n[Social Promoter] Done.');
}

main().catch(err => {
  console.error('[Social Promoter] Fatal error:', err.message);
  process.exit(1);
});
