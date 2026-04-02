// blog-scheduler.js — Crown Media Group Daily Blog Scheduler
// Runs 4 posts/day at 6am, 10am, 2pm, 6pm. Skips Saturday (Sabbath).
// Start: node scripts/blog-scheduler.js

import cron from 'node-cron';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import axios from 'axios';
import * as cheerio from 'cheerio';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const QUEUE_FILE  = join(ROOT, 'content', 'blog', 'topics-queue.json');
const SCHED_FILE  = join(ROOT, 'content', 'blog', 'schedule.json');

function log(msg) { console.log(`[Blog Scheduler] ${new Date().toISOString()} — ${msg}`); }

function readQueue() {
  if (!existsSync(QUEUE_FILE)) return [];
  try { return JSON.parse(readFileSync(QUEUE_FILE, 'utf8')); } catch { return []; }
}
function saveQueue(q) { writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2)); }

function readSchedule() {
  if (!existsSync(SCHED_FILE)) return { postsPerDay: 4, skipSabbath: true, autoResearch: true };
  try { return JSON.parse(readFileSync(SCHED_FILE, 'utf8')); } catch { return {}; }
}
function saveSchedule(s) { writeFileSync(SCHED_FILE, JSON.stringify(s, null, 2)); }

function isSabbath() {
  return new Date().getDay() === 6; // Saturday = 6
}

async function generatePost() {
  const sched = readSchedule();

  if (sched.skipSabbath && isSabbath()) {
    log('Saturday (Sabbath) — skipping generation. Rest day.');
    return;
  }

  const queue = readQueue();
  if (!queue.length) {
    log('Queue empty. Attempting auto-research...');
    if (sched.autoResearch) {
      await autoFillQueue();
    } else {
      log('Auto-research disabled. Add topics manually in Blog Admin.');
    }
    return;
  }

  const next = queue.shift();
  saveQueue(queue);
  log(`Generating: "${next.topic}"`);

  const args = ['--topic', next.topic, '--publish'];
  if (next.keyword) args.push('--keyword', next.keyword);
  if (next.category) args.push('--category', next.category);

  const proc = spawn('node', [join(__dirname, 'blog-writer.js'), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });

  proc.on('close', (code) => {
    if (code === 0) {
      log(`Post published successfully.`);
      // Update lastRun
      const s = readSchedule();
      s.lastRun = new Date().toISOString();
      saveSchedule(s);
    } else {
      log(`blog-writer.js exited with code ${code} — re-queuing topic.`);
      const q2 = readQueue();
      q2.unshift(next);
      saveQueue(q2);
    }
  });
}

async function autoFillQueue() {
  log('Auto-researching trending topics for queue...');
  const topics = [];
  try {
    const subreddits = ['smallbusiness', 'marketing'];
    for (const sub of subreddits) {
      const r = await axios.get(`https://www.reddit.com/r/${sub}/hot.json?limit=6`, {
        headers: { 'User-Agent': 'CrownMediaGroup/1.0' }, timeout: 8000,
      });
      const posts = r.data?.data?.children || [];
      for (const p of posts) {
        const t = p.data?.title;
        if (t && t.length > 20) topics.push({ topic: `How small business owners can use AI to address: ${t}`, keyword: 'AI marketing for small business', category: 'AI Marketing', source: `Reddit r/${sub}`, addedAt: new Date().toISOString() });
      }
    }
  } catch (e) { log('Reddit fetch failed: ' + e.message); }

  try {
    const r = await axios.get('https://trends.google.com/trends/trendingsearches/daily/rss?geo=US', { timeout: 8000 });
    const $ = cheerio.load(r.data, { xmlMode: true });
    $('item title').each((_, el) => {
      const t = $(el).text();
      if (t) topics.push({ topic: `${t} — what small business owners need to know in 2026`, keyword: t, category: 'AI Marketing', source: 'Google Trends', addedAt: new Date().toISOString() });
    });
  } catch (_) {}

  if (topics.length) {
    const q = readQueue();
    q.push(...topics.slice(0, 8));
    saveQueue(q);
    log(`Auto-filled queue with ${Math.min(topics.length, 8)} topics.`);
  } else {
    log('No trending topics found. Add manually in Blog Admin at http://localhost:4001');
  }
}

// ── CRON SCHEDULE: Optimized for global AI/marketing niche audience ────────────
// All times EST. Research: B2B/marketing content peaks Tue–Thu.
// 9 AM EST  = US morning commute + UK afternoon + EU afternoon (peak global window)
// 12 PM EST = US lunch scroll peak
// 4 PM EST  = US end-of-day + UK evening
// 8 PM EST  = US evening + AU morning (catches APAC)
// Saturday = Sabbath (skipped). Sunday included — "Monday prep" mindset readers.

const TIMES = [
  '0 9  * * 0,1,2,3,4,7',  // 9:00 AM  — Sun–Fri (peak global window)
  '0 12 * * 0,1,2,3,4,7',  // 12:00 PM — Sun–Fri (US lunch peak)
  '0 16 * * 2,3,4',        // 4:00 PM  — Tue–Thu only (end-of-day, highest engagement days)
  '0 20 * * 0,1,2,3,4',    // 8:00 PM  — Sun–Fri (US evening + APAC morning)
];

log('Blog Scheduler started. Optimized schedule: 9AM/12PM/4PM/8PM EST. Saturday (Sabbath) skipped.');
log('Open Blog Admin at http://localhost:4001 to manage topics.');
log('Press Ctrl+C to stop.\n');

for (const time of TIMES) {
  cron.schedule(time, () => {
    log(`Cron fired — ${time}`);
    generatePost();
  });
}

// ── Test run flag ──────────────────────────────────────────────────────────────
if (process.argv.includes('--run-now')) {
  log('--run-now flag detected. Generating immediately...');
  generatePost();
}
