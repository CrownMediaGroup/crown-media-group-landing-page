#!/usr/bin/env node
/**
 * Crown Media Group — AI Blog Research Engine
 * Scours Reddit, Google Trends, DuckDuckGo + brand files to auto-fill the post queue
 * Usage: node scripts/blog-researcher.js [--count 20] [--force]
 * Also importable: import { research } from './blog-researcher.js'
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = resolve(__dirname, '..');
const REPO_ROOT  = resolve(ROOT, '..');
const CONTENT_DIR = join(ROOT, 'content', 'blog');
const QUEUE_FILE  = join(CONTENT_DIR, 'topics-queue.json');

const CROWN_SERVICES = [
  'social media management',
  'paid advertising (Meta/Facebook/Instagram ads)',
  'Google ads management',
  'brand identity and logo design',
  'content creation and copywriting',
  'website design and landing pages',
  'email marketing sequences',
  'video content and Reels production',
  'SEO and local search optimization',
  'AI-powered marketing automation',
];

const RESEARCH_QUERIES = [
  'small business marketing problems',
  'social media marketing help local business',
  'how to get more customers small business',
  'Facebook ads not working small business',
  'Google Business Profile optimization',
  'content marketing for local businesses',
  'email marketing local business',
  'brand identity small business tips',
  'how to grow Instagram followers small business',
  'AI tools for small business marketing',
];

const SUBREDDITS = [
  'smallbusiness', 'marketing', 'Entrepreneur',
  'socialmedia', 'SEO', 'FacebookAds',
  'digital_marketing', 'juststart', 'growmybusiness',
];

const CATEGORY_MAP = [
  { keywords: ['facebook', 'instagram', 'tiktok', 'social media', 'reels', 'linkedin'], category: 'Social Media' },
  { keywords: ['ads', 'advertising', 'ppc', 'paid', 'meta', 'google ads', 'roas', 'budget'], category: 'Paid Ads' },
  { keywords: ['seo', 'google', 'search', 'ranking', 'keyword', 'local seo', 'maps'], category: 'SEO' },
  { keywords: ['email', 'newsletter', 'mailchimp', 'sequence', 'drip', 'open rate'], category: 'Email Marketing' },
  { keywords: ['video', 'youtube', 'reel', 'shorts', 'tiktok', 'script'], category: 'Video Marketing' },
  { keywords: ['brand', 'logo', 'identity', 'design', 'visual', 'colors', 'typography'], category: 'Branding' },
  { keywords: ['faith', 'christian', 'god', 'church', 'ministry', 'biblical', 'kingdom'], category: 'Faith & Business' },
  { keywords: ['ai', 'artificial intelligence', 'automation', 'chatgpt', 'machine learning'], category: 'AI Marketing' },
  { keywords: ['content', 'blog', 'writing', 'copy', 'caption', 'headline'], category: 'Content Marketing' },
  { keywords: ['website', 'landing page', 'conversion', 'ux', 'web design'], category: 'Web & Design' },
];

function guessCategory(text) {
  const lower = text.toLowerCase();
  for (const { keywords, category } of CATEGORY_MAP) {
    if (keywords.some(k => lower.includes(k))) return category;
  }
  return 'Marketing';
}

const TITLE_FORMATS = [
  (raw) => `How Columbia SC Businesses Can Use This Strategy: ${raw.slice(0, 60)}`,
  (raw) => `The Columbia SC Business Owner's Guide to: ${raw.slice(0, 60)}`,
  (raw) => `What Every Columbia SC Business Needs to Know About ${raw.slice(0, 55)}`,
  (raw) => `Why ${raw.slice(0, 70)} Matters for Your Columbia SC Business`,
  (raw) => `${raw.slice(0, 80)}: A Complete Guide for Columbia SC Business Owners`,
  (raw) => `How to Fix ${raw.slice(0, 65)} (Columbia SC Business Edition)`,
  (raw) => `The Truth About ${raw.slice(0, 65)} for Columbia SC Small Businesses`,
  (raw) => `Is ${raw.slice(0, 70)} Worth It for Columbia SC Businesses?`,
];

const EVERGREEN_TOPICS = [
  { topic: 'How AI Is Transforming Social Media Marketing for Columbia SC Small Businesses in 2026', keyword: 'AI social media marketing Columbia SC', category: 'AI Marketing' },
  { topic: 'The Complete Facebook Ads Guide for Columbia SC Restaurants, Retail, and Service Businesses', keyword: 'Facebook ads Columbia SC restaurants', category: 'Paid Ads' },
  { topic: '5 Reasons Your Columbia SC Business Needs a Professional Instagram Presence Right Now', keyword: 'Instagram marketing Columbia SC business', category: 'Social Media' },
  { topic: 'How to Build a Faith-Driven Brand That Actually Converts: The Crown Media Group Approach', keyword: 'faith-driven business marketing Columbia SC', category: 'Faith & Business' },
  { topic: 'Crown Media Group vs DIY Marketing: What Columbia SC Business Owners Need to Know', keyword: 'marketing agency Columbia SC', category: 'Local Business' },
  { topic: 'The 2026 Local SEO Checklist Every Columbia SC Business Owner Needs', keyword: 'local SEO Columbia SC 2026', category: 'SEO' },
  { topic: 'Why Short-Form Video Is Non-Negotiable for Columbia SC Businesses Right Now', keyword: 'video marketing Columbia SC local business', category: 'Video Marketing' },
  { topic: 'How to Turn Your Google Business Profile Into a Lead Machine for Your Columbia SC Business', keyword: 'Google Business Profile Columbia SC leads', category: 'SEO' },
  { topic: "The Faith-Driven Entrepreneur's Marketing Blueprint: Grow With Integrity", keyword: 'Christian entrepreneur marketing strategy', category: 'Faith & Business' },
  { topic: 'Brand Identity 101: What Columbia SC Small Businesses Get Wrong (And How to Fix It)', keyword: 'brand identity small business Columbia SC', category: 'Branding' },
  { topic: 'How to Run Profitable Meta Ads on a $300-$500/Month Budget for Your Columbia SC Business', keyword: 'Meta ads small budget Columbia SC', category: 'Paid Ads' },
  { topic: 'The Email Marketing Playbook for Columbia SC Service Businesses: Build a List That Buys', keyword: 'email marketing Columbia SC service business', category: 'Email Marketing' },
  { topic: 'TikTok vs Instagram Reels: Which Platform Should Columbia SC Businesses Prioritize?', keyword: 'TikTok Instagram Reels Columbia SC business', category: 'Social Media' },
  { topic: 'How to Create 30 Days of Content in One Afternoon for Your Columbia SC Business', keyword: 'content creation small business batch', category: 'Content Marketing' },
  { topic: 'Why Every Columbia SC Business Needs to Own Their Google Maps Presence in 2026', keyword: 'Google Maps Columbia SC business presence', category: 'SEO' },
  { topic: 'The Real Cost of Bad Marketing for Columbia SC Small Businesses', keyword: 'bad marketing cost Columbia SC small business', category: 'Marketing' },
  { topic: 'How Crown Media Group Helps Columbia SC Businesses Get More Customers With Less Effort', keyword: 'Crown Media Group Columbia SC marketing results', category: 'Local Business' },
  { topic: 'What Columbia SC Business Owners Need to Know About AI-Powered Content Creation in 2026', keyword: 'AI content creation Columbia SC', category: 'AI Marketing' },
  { topic: 'From Zero to 1,000 Followers: The Columbia SC Small Business Social Media Growth Playbook', keyword: 'grow social media followers Columbia SC business', category: 'Social Media' },
  { topic: 'How to Write Ads That Convert for Your Columbia SC Business (Without Being Salesy)', keyword: 'ad copywriting Columbia SC small business', category: 'Paid Ads' },
  { topic: "The Columbia SC Business Owner's Guide to Reputation Management and Google Reviews", keyword: 'Google reviews reputation Columbia SC business', category: 'Local Business' },
  { topic: 'Why Your Columbia SC Business Needs a Marketing Agency (Not Just a Freelancer)', keyword: 'marketing agency vs freelancer Columbia SC', category: 'Local Business' },
  { topic: 'How to Use Testimonials and Social Proof to Grow Your Columbia SC Business', keyword: 'social proof testimonials local business', category: 'Marketing' },
  { topic: 'The Complete Guide to Instagram Reels for Columbia SC Local Businesses in 2026', keyword: 'Instagram Reels Columbia SC local business 2026', category: 'Social Media' },
  { topic: "How Fort Jackson, USC, and Columbia SC's Growing Economy Create Marketing Opportunities", keyword: 'Columbia SC business growth marketing opportunity', category: 'Local Business' },
];

function readQueue() {
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    return Array.isArray(data) ? data : (Array.isArray(data.queue) ? data.queue : []);
  } catch { return []; }
}

function saveQueue(q) {
  writeFileSync(QUEUE_FILE, JSON.stringify({ queue: q }, null, 2));
}

function getPublishedTopics() {
  const topics = new Set();
  if (!existsSync(CONTENT_DIR)) return topics;
  readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md'))
    .forEach(f => {
      try {
        const content = readFileSync(join(CONTENT_DIR, f), 'utf8');
        const match = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
        if (match) topics.add(match[1].toLowerCase().trim());
      } catch {}
    });
  return topics;
}

function getBrandContext() {
  const context = { services: CROWN_SERVICES, recentFocus: [] };
  try {
    const claudeMd = join(REPO_ROOT, 'CLAUDE.md');
    if (existsSync(claudeMd)) {
      const content = readFileSync(claudeMd, 'utf8');
      const sprintMatch = content.match(/Phase 2 Objectives[\s\S]*?(?=\n##)/);
      if (sprintMatch) context.recentFocus.push(sprintMatch[0].slice(0, 300));
    }
  } catch {}
  return context;
}

async function fetchReddit(subreddit) {
  try {
    const r = await axios.get(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=10`,
      { headers: { 'User-Agent': 'CrownMediaGroupResearch/1.0' }, timeout: 8000 }
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
      if (title && title.length > 5) {
        items.push({ rawTitle: title, score: 70, source: 'Google Trends US' });
      }
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

function isRelevant(rawTitle) {
  const lower = rawTitle.toLowerCase();
  const relevantKeywords = [
    'marketing', 'business', 'brand', 'social', 'ads', 'customer', 'sales',
    'email', 'content', 'website', 'seo', 'growth', 'revenue', 'startup',
    'entrepreneur', 'small business', 'local', 'digital', 'online', 'ai',
    'strategy', 'client', 'freelance', 'agency', 'campaign', 'traffic',
  ];
  return relevantKeywords.some(k => lower.includes(k));
}

function makeTitle(rawTitle, index) {
  const format = TITLE_FORMATS[index % TITLE_FORMATS.length];
  const cleaned = rawTitle.replace(/^\[.*?\]\s*/, '').replace(/\?$/, '').trim();
  return format(cleaned).slice(0, 120);
}

function transformRawItems(rawItems, publishedTopics, existingQueue) {
  const existingSet = new Set([
    ...existingQueue.map(t => t.topic.toLowerCase()),
    ...publishedTopics,
  ]);
  const results = [];
  let formatIndex = 0;
  for (const item of rawItems) {
    if (!isRelevant(item.rawTitle)) continue;
    const topic = makeTitle(item.rawTitle, formatIndex++);
    if (existingSet.has(topic.toLowerCase())) continue;
    existingSet.add(topic.toLowerCase());
    results.push({
      topic,
      keyword: `${item.rawTitle.split(' ').slice(0, 5).join(' ')} Columbia SC`.slice(0, 80),
      category: guessCategory(item.rawTitle),
      source: item.source,
      score: item.score,
      addedAt: new Date().toISOString(),
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

function getEvergreenTopics(publishedTopics, existingQueue, count) {
  const existingSet = new Set([
    ...existingQueue.map(t => t.topic.toLowerCase()),
    ...publishedTopics,
  ]);
  const shuffled = [...EVERGREEN_TOPICS].sort(() => Math.random() - 0.5);
  return shuffled
    .filter(t => !existingSet.has(t.topic.toLowerCase()))
    .slice(0, count)
    .map(t => ({ ...t, source: 'Evergreen', addedAt: new Date().toISOString() }));
}

export async function research(targetTotal = 20, force = false) {
  console.log('[Researcher] Starting research engine...');
  const existing = readQueue();
  if (!force && existing.length >= targetTotal) {
    console.log(`[Researcher] Queue already has ${existing.length} topics. Skipping.`);
    return 0;
  }
  const needed = targetTotal - existing.length;
  const publishedTopics = getPublishedTopics();
  console.log(`[Researcher] Queue: ${existing.length} | Published: ${publishedTopics.size} | Need: ${needed} more`);
  console.log('[Researcher] Fetching research sources in parallel...');
  const [redditResults, trends, ddgResults] = await Promise.all([
    Promise.all(SUBREDDITS.slice(0, 5).map(sub => fetchReddit(sub))).then(r => r.flat()),
    fetchGoogleTrends(),
    Promise.all(RESEARCH_QUERIES.slice(0, 3).map(q => fetchDuckDuckGo(q))).then(r => r.flat()),
  ]);
  const allRaw = [...redditResults, ...trends, ...ddgResults];
  console.log(`[Researcher] Raw: ${redditResults.length} Reddit, ${trends.length} Trends, ${ddgResults.length} DDG`);
  const researchedTopics = transformRawItems(allRaw, publishedTopics, existing);
  const researchCount = Math.min(researchedTopics.length, Math.ceil(needed * 0.6));
  const selectedResearched = researchedTopics.slice(0, researchCount);
  const evergreenCount = needed - selectedResearched.length;
  const evergreen = getEvergreenTopics(publishedTopics, [...existing, ...selectedResearched], evergreenCount);
  const newTopics = [...selectedResearched, ...evergreen];
  const merged = [...existing, ...newTopics];
  saveQueue(merged);
  console.log(`[Researcher] Added ${newTopics.length} topics. Queue total: ${merged.length}`);
  return newTopics.length;
}

if (process.argv[1] === __filename) {
  const envFile = join(ROOT, '..', '.env');
  if (existsSync(envFile)) {
    readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.trim().startsWith('#')) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (k && !process.env[k]) process.env[k] = v;
      }
    });
  }
  const countIdx = process.argv.indexOf('--count');
  const count = countIdx !== -1 ? parseInt(process.argv[countIdx + 1]) || 20 : 20;
  const force = process.argv.includes('--force');
  research(count, force).then(() => {
    console.log('[Researcher] Complete.');
    process.exit(0);
  }).catch(err => {
    console.error('[Researcher] Fatal error:', err.message);
    process.exit(1);
  });
}
