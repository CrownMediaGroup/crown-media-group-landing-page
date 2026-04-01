#!/usr/bin/env node
/**
 * Crown Media Group — Auto-Blogger Service
 * Client Blog Researcher — fills the topic queue for a specific client
 *
 * Usage:
 *   CLIENT_CONFIG=client-slug node blog-researcher-client.js [--count 20] [--force]
 *   CLIENT_CONFIG_PATH=/abs/path/config.json node blog-researcher-client.js [--count 20]
 *
 * Env vars:
 *   CLIENT_CONFIG       — slug matching clients/[slug]/config.json (relative to this script)
 *   CLIENT_CONFIG_PATH  — absolute path to config.json (overrides CLIENT_CONFIG)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

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

// ─── Category guesser built from client config ────────────────────────────────
function buildCategoryMap(categories) {
  // Generic fallback keyword mapping by category name
  const genericMap = {
    'Social Media':      ['facebook', 'instagram', 'tiktok', 'social media', 'reels', 'linkedin'],
    'Paid Ads':          ['ads', 'advertising', 'ppc', 'paid', 'meta', 'google ads', 'roas', 'budget'],
    'SEO':               ['seo', 'google', 'search', 'ranking', 'keyword', 'local seo', 'maps'],
    'Email Marketing':   ['email', 'newsletter', 'mailchimp', 'sequence', 'drip', 'open rate'],
    'Video Marketing':   ['video', 'youtube', 'reel', 'shorts', 'tiktok', 'script'],
    'Branding':          ['brand', 'logo', 'identity', 'design', 'visual', 'colors'],
    'AI Marketing':      ['ai', 'artificial intelligence', 'automation', 'chatgpt'],
    'Content Marketing': ['content', 'blog', 'writing', 'copy', 'caption', 'headline'],
    'Web & Design':      ['website', 'landing page', 'conversion', 'ux', 'web design'],
    'Events':            ['event', 'catering', 'venue', 'party', 'wedding', 'gathering'],
    'Community':         ['community', 'local', 'neighborhood', 'charity', 'volunteer'],
    'Tips':              ['tips', 'guide', 'how to', 'advice', 'best practices'],
    'News':              ['news', 'update', 'announcement', 'new', 'launch'],
  };
  return categories.map(cat => ({
    keywords: genericMap[cat] || [cat.toLowerCase()],
    category: cat,
  }));
}

function guessCategory(text, categoryMap) {
  const lower = text.toLowerCase();
  for (const { keywords, category } of categoryMap) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return 'General';
}

// ─── Research queries built from client keywords + niche ─────────────────────
function buildResearchQueries(config) {
  const { brand } = config;
  const city    = brand.city || '';
  const niche   = brand.niche || brand.industry || '';
  const queries = [];

  // From primary keywords
  if (Array.isArray(brand.primaryKeywords)) {
    brand.primaryKeywords.forEach(kw => {
      queries.push(kw);
      queries.push(`${kw} tips`);
    });
  }

  // Generic intent queries for the niche
  if (niche) {
    queries.push(`best ${niche} tips`);
    queries.push(`how to choose ${niche}`);
    queries.push(`${niche} near me`);
    queries.push(`${city} ${niche}`);
  }

  return queries.slice(0, 12);
}

// ─── Subreddits to check ──────────────────────────────────────────────────────
const SUBREDDITS = [
  'smallbusiness', 'Entrepreneur', 'marketing',
  'socialmedia', 'SEO', 'growmybusiness',
];

// ─── Title formatters using city + business name ──────────────────────────────
function buildTitleFormats(config) {
  const city = config.brand.city || 'your city';
  const biz  = config.client.businessName;
  return [
    (raw) => `How ${city} Residents Can Benefit From: ${raw.slice(0, 60)}`,
    (raw) => `The ${city} Guide to: ${raw.slice(0, 65)}`,
    (raw) => `What You Need to Know About ${raw.slice(0, 60)} in ${city}`,
    (raw) => `Why ${raw.slice(0, 70)} Matters for ${city} Locals`,
    (raw) => `${raw.slice(0, 80)}: A Complete Guide for ${city}`,
    (raw) => `The Truth About ${raw.slice(0, 65)} in ${city}`,
    (raw) => `How to Find the Best ${raw.slice(0, 55)} in ${city}`,
    (raw) => `Is ${raw.slice(0, 65)} Right for You? (${city} Perspective)`,
    (raw) => `${raw.slice(0, 70)}: Tips From ${biz}`,
  ];
}

// ─── Evergreen topics built from client content pillars ───────────────────────
function buildEvergreenTopics(config) {
  const { client, brand, content } = config;
  const city     = brand.city || '';
  const biz      = client.businessName;
  const niche    = brand.niche || brand.industry || '';
  const services = Array.isArray(brand.services) ? brand.services : [];
  const pillars  = Array.isArray(content.contentPillars) ? content.contentPillars : [];
  const cats     = Array.isArray(content.categories) ? content.categories : [];

  const topics = [];

  // One topic per content pillar
  pillars.forEach((pillar, i) => {
    const cat = cats[i % cats.length] || 'General';
    topics.push({
      topic: `${pillar}: What ${city} Customers Want to Know`,
      keyword: `${pillar.toLowerCase()} ${city}`,
      category: cat,
    });
  });

  // One topic per service
  services.slice(0, 6).forEach((service, i) => {
    const cat = cats[i % cats.length] || 'General';
    topics.push({
      topic: `Everything You Need to Know About ${service} at ${biz} in ${city}`,
      keyword: `${service} ${city}`,
      category: cat,
    });
  });

  // Niche-specific evergreens
  if (niche) {
    topics.push(
      {
        topic: `Why ${city} Locals Choose ${biz} for ${niche}`,
        keyword: `${niche} ${city}`,
        category: cats[0] || 'General',
      },
      {
        topic: `The Ultimate ${niche} Guide for ${city} Residents`,
        keyword: `${niche} guide ${city}`,
        category: cats[0] || 'General',
      },
      {
        topic: `Top Questions ${city} Customers Ask About ${niche}`,
        keyword: `${niche} questions ${city}`,
        category: cats[1] || cats[0] || 'General',
      },
      {
        topic: `How ${biz} is Serving the ${city} Community`,
        keyword: `${biz} ${city}`,
        category: cats[0] || 'General',
      }
    );
  }

  return topics;
}

// ─── Avoid-topics filter ──────────────────────────────────────────────────────
function isAllowed(text, avoidTopics) {
  if (!Array.isArray(avoidTopics) || avoidTopics.length === 0) return true;
  const lower = text.toLowerCase();
  return !avoidTopics.some(avoid => lower.includes(avoid.toLowerCase()));
}

// ─── Relevance check (broad) ──────────────────────────────────────────────────
function isRelevant(rawTitle) {
  const lower = rawTitle.toLowerCase();
  const relevantKeywords = [
    'business', 'marketing', 'customer', 'local', 'service', 'product', 'tip',
    'guide', 'best', 'how to', 'why', 'what', 'choose', 'review', 'buy',
    'small business', 'growth', 'community', 'health', 'food', 'event', 'help',
  ];
  return relevantKeywords.some(k => lower.includes(k));
}

// ─── Reddit fetcher ───────────────────────────────────────────────────────────
async function fetchReddit(subreddit) {
  try {
    const r = await axios.get(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=10`,
      { headers: { 'User-Agent': 'AutoBloggerClientResearch/1.0' }, timeout: 8000 }
    );
    return (r.data?.data?.children || [])
      .map(p => p.data)
      .filter(p => p.title && p.title.length > 25 && p.score > 5)
      .map(p => ({ rawTitle: p.title, score: p.score, source: `Reddit r/${subreddit}` }));
  } catch { return []; }
}

async function fetchGoogleTrends() {
  try {
    const r = await axios.get(
      'https://trends.google.com/trends/trendingsearches/daily/rss?geo=US',
      { timeout: 8000 }
    );
    const $ = cheerio.load(r.data, { xmlMode: true });
    const items = [];
    $('item').each((_, el) => {
      const title = $(el).find('title').first().text();
      if (title && title.length > 5) items.push({ rawTitle: title, score: 70, source: 'Google Trends US' });
    });
    return items.slice(0, 12);
  } catch { return []; }
}

async function fetchDuckDuckGo(query) {
  try {
    const q = encodeURIComponent(query);
    const r = await axios.get(
      `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`,
      { timeout: 8000 }
    );
    return (r.data?.RelatedTopics || [])
      .filter(t => t.Text && t.Text.length > 20)
      .slice(0, 5)
      .map(t => ({ rawTitle: t.Text.substring(0, 100), score: 40, source: `Search: ${query}` }));
  } catch { return []; }
}

// ─── Queue I/O ────────────────────────────────────────────────────────────────
function readQueue(queueFile) {
  if (!existsSync(queueFile)) return [];
  try {
    const data = JSON.parse(readFileSync(queueFile, 'utf8'));
    return Array.isArray(data) ? data : (Array.isArray(data.queue) ? data.queue : []);
  } catch { return []; }
}

function saveQueue(queueFile, q) {
  const dir = dirname(queueFile);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(queueFile, JSON.stringify({ queue: q }, null, 2));
}

function getPublishedTopics(contentDir) {
  const topics = new Set();
  if (!existsSync(contentDir)) return topics;
  readdirSync(contentDir)
    .filter(f => f.endsWith('.md'))
    .forEach(f => {
      try {
        const content = readFileSync(join(contentDir, f), 'utf8');
        const match = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
        if (match) topics.add(match[1].toLowerCase().trim());
      } catch {}
    });
  return topics;
}

// ─── Transform raw research into client-branded topics ────────────────────────
function transformRawItems(rawItems, publishedTopics, existingQueue, config, titleFormats, categoryMap) {
  const { brand } = config;
  const avoidTopics = brand.avoidTopics || [];
  const existingSet = new Set([
    ...existingQueue.map(t => t.topic.toLowerCase()),
    ...publishedTopics,
  ]);
  const results = [];
  let formatIndex = 0;

  for (const item of rawItems) {
    if (!isRelevant(item.rawTitle)) continue;
    if (!isAllowed(item.rawTitle, avoidTopics)) continue;

    const format  = titleFormats[formatIndex % titleFormats.length];
    const cleaned = item.rawTitle.replace(/^\[.*?\]\s*/, '').replace(/\?$/, '').trim();
    const topic   = format(cleaned).slice(0, 120);

    if (existingSet.has(topic.toLowerCase())) continue;
    if (!isAllowed(topic, avoidTopics)) continue;

    existingSet.add(topic.toLowerCase());
    formatIndex++;

    results.push({
      topic,
      keyword: `${item.rawTitle.split(' ').slice(0, 5).join(' ')} ${brand.city || ''}`.trim().slice(0, 80),
      category: guessCategory(item.rawTitle, categoryMap),
      source: item.source,
      score: item.score,
      addedAt: new Date().toISOString(),
    });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Main research function ───────────────────────────────────────────────────
async function research(config, targetTotal, force, queueFile, contentDir) {
  const { client } = config;
  console.log(`[Researcher] Client: ${client.businessName}`);
  console.log('[Researcher] Starting research engine...');

  const existing = readQueue(queueFile);
  if (!force && existing.length >= targetTotal) {
    console.log(`[Researcher] Queue already has ${existing.length} topics. Skipping. Use --force to override.`);
    return 0;
  }

  const needed = Math.max(0, targetTotal - existing.length);
  const publishedTopics = getPublishedTopics(contentDir);
  console.log(`[Researcher] Queue: ${existing.length} | Published: ${publishedTopics.size} | Need: ${needed} more`);

  const titleFormats = buildTitleFormats(config);
  const categoryMap  = buildCategoryMap(config.content.categories || []);
  const queries      = buildResearchQueries(config);

  console.log('[Researcher] Fetching research sources in parallel...');

  const [redditResults, trends, ddgResults] = await Promise.all([
    Promise.all(SUBREDDITS.slice(0, 4).map(sub => fetchReddit(sub))).then(r => r.flat()),
    fetchGoogleTrends(),
    Promise.all(queries.slice(0, 4).map(q => fetchDuckDuckGo(q))).then(r => r.flat()),
  ]);

  const allRaw = [...redditResults, ...trends, ...ddgResults];
  console.log(`[Researcher] Raw: ${redditResults.length} Reddit, ${trends.length} Trends, ${ddgResults.length} DDG`);

  const researchedTopics = transformRawItems(allRaw, publishedTopics, existing, config, titleFormats, categoryMap);
  const researchCount    = Math.min(researchedTopics.length, Math.ceil(needed * 0.6));
  const selectedResearched = researchedTopics.slice(0, researchCount);

  const evergreenCount  = needed - selectedResearched.length;
  const allEvergreen    = buildEvergreenTopics(config).map(t => ({
    ...t,
    source: 'Evergreen',
    addedAt: new Date().toISOString(),
  }));

  // Filter evergreen against existing and avoid list
  const existingSet = new Set([
    ...existing.map(t => t.topic.toLowerCase()),
    ...selectedResearched.map(t => t.topic.toLowerCase()),
    ...publishedTopics,
  ]);
  const filteredEvergreen = allEvergreen
    .filter(t => !existingSet.has(t.topic.toLowerCase()))
    .filter(t => isAllowed(t.topic, config.brand.avoidTopics || []))
    .slice(0, Math.max(0, evergreenCount));

  const newTopics = [...selectedResearched, ...filteredEvergreen];
  const merged    = [...existing, ...newTopics];
  saveQueue(queueFile, merged);

  console.log(`[Researcher] Added ${newTopics.length} topics. Queue total: ${merged.length}`);
  console.log(`[Researcher] Queue file: ${queueFile}`);
  return newTopics.length;
}

// ─── Entrypoint ───────────────────────────────────────────────────────────────
const config = loadConfig();
const { client, github } = config;
const slug = client.slug || process.env.CLIENT_CONFIG || 'client';

const clientDir  = process.env.CLIENT_CONFIG_PATH
  ? dirname(process.env.CLIENT_CONFIG_PATH)
  : join(__dirname, 'clients', slug);

const contentDir = join(clientDir, github.blogContentPath || 'content/blog');
const queueFile  = join(clientDir, github.queuePath || 'content/blog/topics-queue.json');

const countIdx  = process.argv.indexOf('--count');
const count     = countIdx !== -1 ? parseInt(process.argv[countIdx + 1]) || 20 : 20;
const force     = process.argv.includes('--force');

research(config, count, force, queueFile, contentDir).then(() => {
  console.log('[Researcher] Complete.');
  process.exit(0);
}).catch(err => {
  console.error('[Researcher] Fatal error:', err.message);
  process.exit(1);
});
