// blog-admin-server.js — Crown Media Group Blog Admin + Scheduler (Combined)
// Run: node scripts/blog-admin-server.js
// Opens at http://localhost:4001

import express from 'express';
import cron from 'node-cron';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import axios from 'axios';
import * as cheerio from 'cheerio';

// ── Path constants (must be defined FIRST before any use) ───────────────────
const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const BLOG_DIR   = join(ROOT, 'content', 'blog');
const QUEUE_FILE = join(BLOG_DIR, 'topics-queue.json');
const SCHED_FILE = join(BLOG_DIR, 'schedule.json');

function log(msg) { console.log(`[Blog] ${new Date().toISOString()} — ${msg}`); }

// CRM database (node:sqlite — requires --experimental-sqlite flag)
let crmDb = null;
try {
  const { DatabaseSync } = await import('node:sqlite');
  const CRM_DB = join(__dirname, '..', '..', 'tools', 'crm', 'crm.db');
  if (existsSync(CRM_DB)) { crmDb = new DatabaseSync(CRM_DB); log('CRM database connected.'); }
  else log('CRM database not found at ' + CRM_DB);
} catch (e) { log('CRM DB unavailable (run with --experimental-sqlite): ' + e.message); }

// ── File helpers ────────────────────────────────────────────────────────────

function readQueue() {
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    const data = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    // Queue file uses {queue:[...]} format (blog-writer.js expects this)
    return Array.isArray(data) ? data : (Array.isArray(data.queue) ? data.queue : []);
  } catch { return []; }
}
function saveQueue(q) {
  // Always persist in {queue:[...]} format so blog-writer.js stays compatible
  writeFileSync(QUEUE_FILE, JSON.stringify({ queue: q }, null, 2));
}

function readSchedule() {
  const defaults = { postsPerDay: 4, skipSabbath: true, autoResearch: true, lastRun: null };
  if (!existsSync(SCHED_FILE)) return defaults;
  try { return { ...defaults, ...JSON.parse(readFileSync(SCHED_FILE, 'utf8')) }; } catch { return defaults; }
}
function saveSchedule(s) { writeFileSync(SCHED_FILE, JSON.stringify(s, null, 2)); }

function getPosts() {
  if (!existsSync(BLOG_DIR)) return [];
  return readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const content = readFileSync(join(BLOG_DIR, f), 'utf8');
      const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
      const dateMatch  = content.match(/^date:\s*(.+?)\s*$/m);
      const catMatch   = content.match(/^category:\s*(.+?)\s*$/m);
      return {
        file: f,
        title: titleMatch?.[1] || f.replace('.md', ''),
        date:  dateMatch?.[1]  || '',
        category: catMatch?.[1] || 'General',
        wordCount: content.split(/\s+/).length,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ── Scheduler logic ────────────────────────────────────────────────────────

function isSabbath() { return new Date().getDay() === 6; }

// ── Auto-researcher helper ───────────────────────────────────────────────────
async function ensureQueue() {
  const q = readQueue();
  if (q.length >= 10) return; // Queue is healthy
  log(`Queue low (${q.length} topics) — running researcher...`);
  try {
    const { research } = await import('./blog-researcher.js');
    const added = await research(20);
    log(`Researcher added ${added} topics. Queue now: ${readQueue().length}`);
  } catch (e) {
    log(`Researcher failed: ${e.message}`);
  }
}

function generatePost() {
  const sched = readSchedule();
  if (sched.skipSabbath && isSabbath()) { log('Saturday — Sabbath rest. Skipping.'); return; }
  const queue = readQueue();
  if (!queue.length) {
    log('Queue empty — auto-researching...');
    if (sched.autoResearch) ensureQueue().then(() => {
      const q2 = readQueue();
      if (q2.length) generatePost();
    });
    return;
  }
  const next = queue.shift();
  saveQueue(queue);
  log(`Generating: "${next.topic}"`);
  const args = ['--topic', next.topic, '--publish'];
  if (next.keyword)  args.push('--keyword', next.keyword);
  if (next.category) args.push('--category', next.category);
  const proc = spawn('node', [join(__dirname, 'blog-writer.js'), ...args], {
    cwd: ROOT, stdio: 'inherit', env: { ...process.env },
  });
  proc.on('close', (code) => {
    if (code === 0) {
      const s = readSchedule(); s.lastRun = new Date().toISOString(); saveSchedule(s);
      log('Post published.');
    } else {
      log(`Writer failed (code ${code}) — re-queuing.`);
      const q2 = readQueue(); q2.unshift(next); saveQueue(q2);
    }
  });
}

// ── CRON: 8am, 12pm, 4pm, 8pm EST — Skip Saturday ────────────────────────────
for (const time of ['0 8 * * 0-5', '0 12 * * 0-5', '0 16 * * 0-5', '0 20 * * 0-5']) {
  cron.schedule(time, async () => {
    const day = new Date().getDay();
    if (day === 6) { log('Saturday — Sabbath rest. Skipping post.'); return; }
    log(`Cron fired — ${time}`);
    await ensureQueue();
    generatePost();
  });
}

// ── Express API ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, 'admin-public')));

app.get('/api/posts',    (_, res) => res.json(getPosts()));
app.get('/api/queue',    (_, res) => res.json(readQueue()));
app.get('/api/schedule', (_, res) => res.json(readSchedule()));

app.get('/api/stats', (_, res) => {
  const posts  = getPosts();
  const queue  = readQueue();
  const sched  = readSchedule();
  const today  = new Date().toISOString().split('T')[0];
  res.json({
    totalPosts:  posts.length,
    queueCount:  queue.length,
    todayPosts:  posts.filter(p => p.date.startsWith(today)).length,
    postsPerDay: sched.postsPerDay || 4,
    skipSabbath: sched.skipSabbath ?? true,
    lastRun:     sched.lastRun,
    schedulerActive: true,
  });
});

app.post('/api/queue', (req, res) => {
  const { topic, keyword, category } = req.body;
  if (!topic) return res.status(400).json({ error: 'Topic required' });
  const q = readQueue();
  q.push({ topic, keyword: keyword || '', category: category || 'Marketing', addedAt: new Date().toISOString() });
  saveQueue(q);
  res.json({ ok: true, count: q.length });
});

app.delete('/api/queue/:i', (req, res) => {
  const q = readQueue();
  const i = parseInt(req.params.i);
  if (isNaN(i) || i < 0 || i >= q.length) return res.status(400).json({ error: 'Bad index' });
  q.splice(i, 1);
  saveQueue(q);
  res.json({ ok: true });
});

app.post('/api/queue/from-research', (req, res) => {
  const { title, source } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const q = readQueue();
  const topic = `How Columbia SC businesses can address: ${title}`;
  q.push({ topic, keyword: '', category: 'Local Business', addedAt: new Date().toISOString(), source });
  saveQueue(q);
  res.json({ ok: true, topic, count: q.length });
});

app.post('/api/generate', (req, res) => {
  const { topic, keyword, category, fromQueue } = req.body;
  res.json({ ok: true, message: 'Generation started — check posts list in ~30 seconds' });
  const args = fromQueue
    ? ['--from-queue', '--publish']
    : ['--topic', topic || 'Marketing tips for Columbia SC businesses', '--publish',
       ...(keyword ? ['--keyword', keyword] : []),
       ...(category ? ['--category', category] : [])];
  const proc = spawn('node', [join(__dirname, 'blog-writer.js'), ...args], {
    cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env },
  });
  proc.unref();
});

app.post('/api/schedule', (req, res) => {
  const s = { ...readSchedule(), ...req.body };
  saveSchedule(s);
  res.json({ ok: true, schedule: s });
});

app.get('/api/research', async (req, res) => {
  const niche  = req.query.niche || 'small business marketing Columbia SC';
  const topics = [];
  try {
    for (const sub of ['smallbusiness', 'marketing', 'Entrepreneur']) {
      const r = await axios.get(`https://www.reddit.com/r/${sub}/hot.json?limit=8`, {
        headers: { 'User-Agent': 'CrownMediaGroup/1.0' }, timeout: 8000,
      });
      for (const p of (r.data?.data?.children || [])) {
        const t = p.data?.title;
        if (t && t.length > 20 && t.length < 200)
          topics.push({ source: `Reddit r/${sub}`, title: t, url: `https://reddit.com${p.data.permalink}`, score: p.data.score });
      }
    }
  } catch (_) {}
  try {
    const r = await axios.get('https://trends.google.com/trends/trendingsearches/daily/rss?geo=US', { timeout: 8000 });
    const $ = cheerio.load(r.data, { xmlMode: true });
    $('item').each((_, el) => {
      const t = $(el).find('title').first().text();
      if (t) topics.push({ source: 'Google Trends', title: t, url: '', score: 0 });
    });
  } catch (_) {}
  try {
    const q  = encodeURIComponent(`${niche} problems questions site:quora.com`);
    const r  = await axios.get(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1`, { timeout: 8000 });
    for (const rt of (r.data?.RelatedTopics || []).slice(0, 5)) {
      if (rt.Text) topics.push({ source: 'DuckDuckGo', title: rt.Text.substring(0, 120), url: rt.FirstURL || '', score: 0 });
    }
  } catch (_) {}
  res.json({ topics: topics.slice(0, 40), niche });
});

// ── Analytics API (Supabase) ─────────────────────────────────────────────────

async function supaQuery(path, params = '') {
  const url  = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const r = await axios.get(`${url}/rest/v1/${path}${params}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    return r.data;
  } catch (e) { log(`Supabase error: ${e.message}`); return null; }
}

app.get('/api/analytics/overview', async (_, res) => {
  const today  = new Date().toISOString().split('T')[0];
  const weekAgo  = new Date(Date.now() - 7  * 86400000).toISOString();
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [total, todayRows, weekRows, monthRows] = await Promise.all([
    supaQuery('blog_analytics', '?select=id&limit=1&order=id.desc'),
    supaQuery('blog_analytics', `?select=id&viewed_at=gte.${today}T00:00:00Z`),
    supaQuery('blog_analytics', `?select=id&viewed_at=gte.${weekAgo}`),
    supaQuery('blog_analytics', `?select=id&viewed_at=gte.${monthAgo}`),
  ]);

  if (!total) return res.json({ available: false });
  // Supabase returns rows but we need count — use head + Prefer:count header via direct call
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_ANON_KEY;
  try {
    const [t, d, w, m] = await Promise.all([
      axios.get(`${url}/rest/v1/blog_analytics?select=id`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }, timeout: 8000 }),
      axios.get(`${url}/rest/v1/blog_analytics?select=id&viewed_at=gte.${today}T00:00:00Z`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }, timeout: 8000 }),
      axios.get(`${url}/rest/v1/blog_analytics?select=id&viewed_at=gte.${weekAgo}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }, timeout: 8000 }),
      axios.get(`${url}/rest/v1/blog_analytics?select=id&viewed_at=gte.${monthAgo}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }, timeout: 8000 }),
    ]);
    const parseCount = r => parseInt(r.headers['content-range']?.split('/')[1] || '0', 10);
    res.json({ available: true, total: parseCount(t), today: parseCount(d), week: parseCount(w), month: parseCount(m) });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

app.get('/api/analytics/top-posts', async (_, res) => {
  const data = await supaQuery('blog_analytics', '?select=slug,title&limit=1000&order=viewed_at.desc');
  if (!data) return res.json([]);
  const counts = {};
  const titles = {};
  for (const row of data) {
    counts[row.slug] = (counts[row.slug] || 0) + 1;
    if (row.title && !titles[row.slug]) titles[row.slug] = row.title;
  }
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug, views]) => ({ slug, views, title: titles[slug] || slug }));
  res.json(sorted);
});

app.get('/api/analytics/referrers', async (_, res) => {
  const data = await supaQuery('blog_analytics', '?select=platform&limit=2000&order=viewed_at.desc');
  if (!data) return res.json([]);
  const counts = {};
  for (const row of data) counts[row.platform || 'direct'] = (counts[row.platform || 'direct'] || 0) + 1;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([platform, views]) => ({ platform, views, pct: total ? Math.round(views / total * 100) : 0 }));
  res.json(sorted);
});

app.get('/api/analytics/timeline', async (_, res) => {
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const data = await supaQuery('blog_analytics', `?select=viewed_at&viewed_at=gte.${monthAgo}&order=viewed_at.asc&limit=5000`);
  if (!data) return res.json([]);
  const days = {};
  for (const row of data) {
    const d = row.viewed_at?.split('T')[0];
    if (d) days[d] = (days[d] || 0) + 1;
  }
  // Fill in missing days with 0
  const result = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    result.push({ date: d, views: days[d] || 0 });
  }
  res.json(result);
});

app.get('/api/analytics/categories', async (_, res) => {
  const data = await supaQuery('blog_analytics', '?select=slug&limit=2000');
  if (!data) return res.json([]);
  // Match slugs to published posts to get category
  const posts = getPosts();
  const catMap = {};
  for (const p of posts) {
    const slug = p.file.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
    catMap[slug] = p.category;
  }
  const counts = {};
  for (const row of data) {
    const cat = catMap[row.slug] || 'Other';
    counts[cat] = (counts[cat] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  res.json(Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, views]) => ({ cat, views, pct: total ? Math.round(views / total * 100) : 0 })));
});

// ── CRM API ─────────────────────────────────────────────────────────────────

app.get('/api/crm/stats', (_, res) => {
  if (!crmDb) return res.json({ available: false });
  try {
    const today = new Date().toISOString().split('T')[0];
    const total      = crmDb.prepare('SELECT COUNT(*) as n FROM contacts').get().n;
    const clients    = crmDb.prepare("SELECT COUNT(*) as n FROM contacts WHERE status='Client'").get().n;
    const leads      = crmDb.prepare("SELECT COUNT(*) as n FROM contacts WHERE status NOT IN ('Client','Dead')").get().n;
    const overdue    = crmDb.prepare("SELECT COUNT(*) as n FROM contacts WHERE next_followup <= ? AND status NOT IN ('Client','Dead')").get(today).n;
    const pipeline   = crmDb.prepare('SELECT COALESCE(SUM(deal_value),0) as v FROM contacts').get().v;
    const newThisWeek = crmDb.prepare("SELECT COUNT(*) as n FROM contacts WHERE date(created_at) >= date(?,'weekday 0','-7 days')").get(today).n;
    res.json({ available: true, total, clients, leads, overdue, pipeline, newThisWeek });
  } catch (e) { res.json({ available: false, error: e.message }); }
});

app.get('/api/crm/contacts', (_, res) => {
  if (!crmDb) return res.json([]);
  try {
    const rows = crmDb.prepare("SELECT id,name,business,phone,status,priority,next_followup,deal_value FROM contacts ORDER BY priority DESC, next_followup ASC LIMIT 20").all();
    res.json(rows);
  } catch (e) { res.json([]); }
});

app.get('/api/crm/followups', (_, res) => {
  if (!crmDb) return res.json([]);
  try {
    const today = new Date().toISOString().split('T')[0];
    const rows = crmDb.prepare("SELECT id,name,business,phone,status,next_followup FROM contacts WHERE next_followup <= date(?,'start of day','+3 days') AND status NOT IN ('Client','Dead') ORDER BY next_followup ASC LIMIT 10").all(today);
    res.json(rows);
  } catch (e) { res.json([]); }
});

// ── Automation Log API ───────────────────────────────────────────────────────

const DAILY_LOG  = join(__dirname, '..', '..', 'Agency', 'ops', 'notes', 'DAILY-LOG.md');
const SOCIAL_Q   = join(__dirname, '..', '..', 'Agency', 'Content', 'social-post-queue.json');
const VIDEO_LOG_FILE = join(BLOG_DIR, '.video-log.json');

app.get('/api/automation-log', (_, res) => {
  let lines = [];
  if (existsSync(DAILY_LOG)) {
    const raw = readFileSync(DAILY_LOG, 'utf8').split('\n').filter(Boolean);
    lines = raw.slice(-150).reverse().map(line => {
      const m = line.match(/^\[(.+?)\]\s*(.+)$/);
      if (!m) return { time: '', raw: line, type: 'info' };
      const msg = m[2];
      const type = /ERROR|FATAL|failed|error/i.test(msg) ? 'error'
                 : /success|done|published|complete|started/i.test(msg) ? 'success'
                 : 'info';
      return { time: m[1], message: msg, type };
    });
  }
  res.json(lines);
});

app.get('/api/social-queue', (_, res) => {
  if (!existsSync(SOCIAL_Q)) return res.json([]);
  try { res.json(JSON.parse(readFileSync(SOCIAL_Q, 'utf8'))); } catch { res.json([]); }
});

app.get('/api/video-log', (_, res) => {
  if (!existsSync(VIDEO_LOG_FILE)) return res.json({ videos: [] });
  try {
    const data = JSON.parse(readFileSync(VIDEO_LOG_FILE, 'utf8'));
    res.json(data);
  } catch { res.json({ videos: [] }); }
});

// ── Start ───────────────────────────────────────────────────────────────────

const PORT = 4001;
app.listen(PORT, () => {
  console.log('\n================================================');
  console.log('  Crown Media Group — Blog Admin + Scheduler');
  console.log('================================================');
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log('  Scheduler:  ACTIVE (8am, 12pm, 4pm, 8pm EST)');
  console.log('  Sabbath:    Saturday posts SKIPPED');
  console.log('================================================\n');
  try { exec(`start http://localhost:${PORT}`); } catch (_) {}
});
