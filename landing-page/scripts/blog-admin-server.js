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

// CRM database (node:sqlite — requires --experimental-sqlite flag)
let crmDb = null;
try {
  const { DatabaseSync } = await import('node:sqlite');
  const CRM_DB = join(__dirname, '..', '..', 'tools', 'crm', 'crm.db');
  if (existsSync(CRM_DB)) { crmDb = new DatabaseSync(CRM_DB); log('CRM database connected.'); }
  else log('CRM database not found at ' + CRM_DB);
} catch (e) { log('CRM DB unavailable (run with --experimental-sqlite): ' + e.message); }

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const BLOG_DIR   = join(ROOT, 'content', 'blog');
const QUEUE_FILE = join(BLOG_DIR, 'topics-queue.json');
const SCHED_FILE = join(BLOG_DIR, 'schedule.json');

function log(msg) { console.log(`[Blog] ${new Date().toISOString()} — ${msg}`); }

// ── File helpers ────────────────────────────────────────────────────────────

function readQueue() {
  if (!existsSync(QUEUE_FILE)) return [];
  try { return JSON.parse(readFileSync(QUEUE_FILE, 'utf8')); } catch { return []; }
}
function saveQueue(q) { writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2)); }

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

async function autoFillQueue() {
  const topics = [];
  try {
    for (const sub of ['smallbusiness', 'marketing']) {
      const r = await axios.get(`https://www.reddit.com/r/${sub}/hot.json?limit=6`, {
        headers: { 'User-Agent': 'CrownMediaGroup/1.0' }, timeout: 8000,
      });
      for (const p of (r.data?.data?.children || [])) {
        const t = p.data?.title;
        if (t && t.length > 20)
          topics.push({ topic: `How Columbia SC businesses can address: ${t}`, keyword: 'Columbia SC marketing', category: 'Local Business', source: `r/${sub}`, addedAt: new Date().toISOString() });
      }
    }
  } catch (_) {}
  try {
    const r = await axios.get('https://trends.google.com/trends/trendingsearches/daily/rss?geo=US', { timeout: 8000 });
    const $ = cheerio.load(r.data, { xmlMode: true });
    $('item title').each((_, el) => {
      const t = $(el).text();
      if (t) topics.push({ topic: `${t} — what Columbia SC business owners need to know`, keyword: t, category: 'Marketing', source: 'Google Trends', addedAt: new Date().toISOString() });
    });
  } catch (_) {}
  if (topics.length) {
    const q = readQueue();
    q.push(...topics.slice(0, 8));
    saveQueue(q);
    log(`Auto-filled ${Math.min(topics.length, 8)} topics into queue.`);
  }
}

function generatePost() {
  const sched = readSchedule();
  if (sched.skipSabbath && isSabbath()) { log('Saturday — Sabbath rest. Skipping.'); return; }
  const queue = readQueue();
  if (!queue.length) {
    log('Queue empty — auto-researching...');
    if (sched.autoResearch) autoFillQueue().then(() => {
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
      log(`Post published.`);
    } else {
      log(`Writer failed (code ${code}) — re-queuing.`);
      const q2 = readQueue(); q2.unshift(next); saveQueue(q2);
    }
  });
}

// CRON: 6am, 10am, 2pm, 6pm
for (const time of ['0 6 * * *', '0 10 * * *', '0 14 * * *', '0 18 * * *']) {
  cron.schedule(time, () => { log(`Cron fired — ${time}`); generatePost(); });
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

// ── Start ───────────────────────────────────────────────────────────────────

// ── CRM API ─────────────────────────────────────────────────────────────────

app.get('/api/crm/stats', (_, res) => {
  if (!crmDb) return res.json({ available: false });
  try {
    const today = new Date().toISOString().split('T')[0];
    const total     = crmDb.prepare('SELECT COUNT(*) as n FROM contacts').get().n;
    const clients   = crmDb.prepare("SELECT COUNT(*) as n FROM contacts WHERE status='Client'").get().n;
    const leads     = crmDb.prepare("SELECT COUNT(*) as n FROM contacts WHERE status NOT IN ('Client','Dead')").get().n;
    const overdue   = crmDb.prepare("SELECT COUNT(*) as n FROM contacts WHERE next_followup <= ? AND status NOT IN ('Client','Dead')").get(today).n;
    const pipeline  = crmDb.prepare('SELECT COALESCE(SUM(deal_value),0) as v FROM contacts').get().v;
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

const PORT = 4001;
app.listen(PORT, () => {
  console.log('\n================================================');
  console.log('  Crown Media Group — Blog Admin + Scheduler');
  console.log('================================================');
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log('  Scheduler:  ACTIVE (6am, 10am, 2pm, 6pm)');
  console.log('  Sabbath:    Saturday posts SKIPPED');
  console.log('================================================\n');
  // Auto-open browser (non-blocking)
  try { exec(`start http://localhost:${PORT}`); } catch (_) {}
});
