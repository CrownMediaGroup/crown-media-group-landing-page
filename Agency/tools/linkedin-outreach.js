/**
 * linkedin-outreach.js — LinkedIn outreach automation
 * Crown Media Group | Playwright headful
 *
 * Usage:
 *   node Agency/tools/linkedin-outreach.js --action connect --user <profile-url> --template connection_request
 *   node Agency/tools/linkedin-outreach.js --action message --user <profile-url> --template follow_up
 *   node Agency/tools/linkedin-outreach.js --dry-run --action connect --user <url> --template columbia_owner
 *   node Agency/tools/linkedin-outreach.js --batch Agency/tools/li-queue.json
 *
 * Actions: connect | message
 * Templates: connection_request | follow_up | columbia_owner | faith_aligned
 *
 * Rate limit: 15 connections/day max (LinkedIn bans at 25+)
 * Logs to Supabase leads table.
 *
 * Requires .env:
 *   LI_USERNAME  — LinkedIn email
 *   LI_PASSWORD  — LinkedIn password
 *   SUPABASE_URL
 *   SUPABASE_KEY
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Supabase ─────────────────────────────────────────────────────────────────
let createClient;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch {
  ({ createClient } = require(
    path.join(__dirname, '../../tools/calls/node_modules/@supabase/supabase-js')
  ));
}

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

if (!supabase) console.warn('[WARN] Supabase not configured — outreach will not be logged');

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  DAILY_MAX: 15,
  RATE_LOG:  path.join(__dirname, '../../security/li-rate.json'),
  SESSION:   path.join(__dirname, '../../security/sessions/linkedin-session.json'),
  SCREENSHOT_DIR: path.join(__dirname, '../../tools/screen'),
  DELAYS: {
    page_load:       [3000, 5000],
    between_actions: [1000, 2500],
    typing:          [60,   180],
    post_send:       [3000, 6000],
    between_sends:   [60000, 120000], // 1-2 min between actions
  }
};

// ── Templates ─────────────────────────────────────────────────────────────────
const TEMPLATES = {
  connection_request: () =>
    `Hi! I'm David King — CEO of Crown Media Group, an AI-powered marketing agency based in Columbia, SC. ` +
    `I help local businesses grow with content, ads, and brand strategy. Would love to connect!`,

  follow_up: () =>
    `Hey! Thanks for connecting. I'd love to offer you a free marketing audit for your business — ` +
    `no strings attached. Takes 15 minutes and could open up some real growth opportunities. Interested?`,

  columbia_owner: () =>
    `Hi! Fellow Columbia, SC business owner here. I run Crown Media Group — ` +
    `we help local businesses grow with AI-powered marketing. ` +
    `Would love to connect and share what's working in our market right now.`,

  faith_aligned: () =>
    `Hi! I noticed your faith-aligned work and wanted to connect. I run Crown Media Group — ` +
    `a faith-driven AI marketing agency here in Columbia, SC. ` +
    `All Glory to Jesus. Would love to be in your network!`,
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const sleep  = ms => new Promise(r => setTimeout(r, ms));
const rand   = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const delay  = ([min, max]) => sleep(rand(min, max));

function loadRateLog() {
  try {
    if (fs.existsSync(CONFIG.RATE_LOG))
      return JSON.parse(fs.readFileSync(CONFIG.RATE_LOG, 'utf8'));
  } catch {}
  return { date: '', count: 0, sent: [], history: [] };
}

function saveRateLog(log) {
  const dir = path.dirname(CONFIG.RATE_LOG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG.RATE_LOG, JSON.stringify(log, null, 2));
}

function checkRateLimit() {
  const today = new Date().toISOString().slice(0, 10);
  const log = loadRateLog();
  if (!log.history) log.history = [];
  if (log.date !== today) {
    // New day — reset daily count but preserve history
    const newLog = { date: today, count: 0, sent: [], history: log.history };
    return { allowed: true, count: 0, log: newLog };
  }
  if (log.count >= CONFIG.DAILY_MAX) return { allowed: false, count: log.count, log };
  return { allowed: true, count: log.count, log };
}

function bumpRateLog(log, profileUrl, action) {
  log.count += 1;
  const entry = { profileUrl, action, at: new Date().toISOString() };
  log.sent.push(entry);
  if (!log.history) log.history = [];
  log.history.push(entry);
  saveRateLog(log);
}

function alreadySentUrls() {
  const log = loadRateLog();
  return new Set((log.history || []).map(e => e.profileUrl));
}

async function logToSupabase(profileUrl, message, action, status) {
  if (!supabase) return;
  const { error } = await supabase.from('leads').upsert({
    li_profile_url: profileUrl,
    message,
    li_action: action,
    status,
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: 'linkedin_outreach',
    platform: 'linkedin',
  }, { onConflict: 'li_profile_url' });
  if (error) console.error('[Supabase]', error.message);
}

async function screenshot(page, label) {
  const dir = CONFIG.SCREENSHOT_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `li-${label}-${Date.now()}.png`);
  await page.screenshot({ path: file });
  console.log(`[SCREENSHOT] ${file}`);
}

async function humanType(page, selector, text) {
  await page.click(selector);
  await delay(CONFIG.DELAYS.between_actions);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(rand(...CONFIG.DELAYS.typing));
  }
}

// ── Session ───────────────────────────────────────────────────────────────────
async function loadSession(context) {
  if (fs.existsSync(CONFIG.SESSION)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(CONFIG.SESSION, 'utf8'));
      await context.addCookies(cookies);
      return true;
    } catch {}
  }
  return false;
}

async function saveSession(context) {
  const dir = path.dirname(CONFIG.SESSION);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG.SESSION, JSON.stringify(await context.cookies(), null, 2));
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function login(page) {
  const { LI_USERNAME, LI_PASSWORD } = process.env;
  if (!LI_USERNAME || !LI_PASSWORD) {
    throw new Error('LI_USERNAME and LI_PASSWORD must be set in .env');
  }

  console.log('[LOGIN] Navigating to LinkedIn...');
  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(CONFIG.DELAYS.page_load);

  await humanType(page, 'input#username', LI_USERNAME);
  await delay(CONFIG.DELAYS.between_actions);
  await humanType(page, 'input#password', LI_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await delay(CONFIG.DELAYS.page_load);

  if (page.url().includes('/checkpoint') || page.url().includes('/login')) {
    await screenshot(page, 'login-challenge');
    throw new Error(`Login failed or security challenge. Check screenshot. URL: ${page.url()}`);
  }

  console.log('[LOGIN] Success');
}

// ── Connect ───────────────────────────────────────────────────────────────────
async function sendConnect(page, profileUrl, note, dryRun) {
  console.log(`\n[CONNECT] Target: ${profileUrl}`);
  console.log(`[CONNECT] Note: ${note.slice(0, 60)}...`);

  if (dryRun) {
    console.log('[DRY RUN] Full note:');
    console.log('─'.repeat(60));
    console.log(note);
    console.log('─'.repeat(60));
    await logToSupabase(profileUrl, note, 'connect', 'dry_run');
    return { success: true, dryRun: true };
  }

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(CONFIG.DELAYS.page_load);
  // Scroll to top so profile header is visible
  await page.evaluate(() => window.scrollTo(0, 0));
  await delay([500, 800]);
  await screenshot(page, `profile-${Date.now()}`);

  // Find Connect button — try direct first, then More actions menu
  // Use stable aria-label selectors that survive LinkedIn UI updates
  let connectBtn = page.locator([
    'button[aria-label*="Invite"][aria-label*="connect"]',
    'button[aria-label="Connect"]',
    '.pvs-profile-actions button:has-text("Connect")',
    '.pv-top-card__non-self-ctas button:has-text("Connect")',
  ].join(', ')).first();

  let visible = await connectBtn.isVisible({ timeout: 5000 }).catch(() => false);

  if (!visible) {
    // Try More actions dropdown — use aria-label not text-match to avoid wrong button
    const moreBtn = page.locator('button[aria-label="More actions"]').first();
    const moreVisible = await moreBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (moreVisible) {
      await moreBtn.click();
      await delay(CONFIG.DELAYS.between_actions);
      connectBtn = page.locator('div[role="option"]:has-text("Connect"), li[role="option"]:has-text("Connect"), [data-control-name="connect"]').first();
      visible = await connectBtn.isVisible({ timeout: 3000 }).catch(() => false);
    }
  }

  if (!visible) {
    console.log('[CONNECT] Connect button not found — already connected or pending');
    await logToSupabase(profileUrl, note, 'connect', 'skipped_no_button');
    return { success: false, reason: 'no_connect_button' };
  }

  await connectBtn.click();
  await delay(CONFIG.DELAYS.between_actions);

  // Add note dialog
  const addNoteBtn = page.locator('button:has-text("Add a note"), button[aria-label="Add a note"]').first();
  if (await addNoteBtn.isVisible({ timeout: 4000 })) {
    await addNoteBtn.click();
    await delay(CONFIG.DELAYS.between_actions);

    const noteBox = page.locator('textarea[name="message"], textarea#custom-message').first();
    await noteBox.waitFor({ timeout: 5000 });
    await noteBox.click();
    for (const char of note) {
      await page.keyboard.type(char);
      await sleep(rand(...CONFIG.DELAYS.typing));
    }
    await delay(CONFIG.DELAYS.between_actions);
  }

  // Send — try multiple selectors
  const sendBtn = page.locator('button:has-text("Send"), button[aria-label="Send now"], button[aria-label="Send invitation"]').first();
  await sendBtn.waitFor({ timeout: 5000 });
  await sendBtn.click();
  await delay(CONFIG.DELAYS.post_send);
  await screenshot(page, 'connect-sent');

  console.log(`[CONNECT] Request sent to ${profileUrl}`);
  await logToSupabase(profileUrl, note, 'connect', 'sent');
  return { success: true };
}

// ── Message ───────────────────────────────────────────────────────────────────
async function sendMessage(page, profileUrl, message, dryRun) {
  console.log(`\n[MESSAGE] Target: ${profileUrl}`);

  if (dryRun) {
    console.log('[DRY RUN] Full message:');
    console.log('─'.repeat(60));
    console.log(message);
    console.log('─'.repeat(60));
    await logToSupabase(profileUrl, message, 'message', 'dry_run');
    return { success: true, dryRun: true };
  }

  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(CONFIG.DELAYS.page_load);

  const msgBtn = page.locator('button:has-text("Message"), a:has-text("Message")').first();
  if (!await msgBtn.isVisible({ timeout: 5000 })) {
    console.log('[MESSAGE] Message button not found — not a connection');
    await logToSupabase(profileUrl, message, 'message', 'skipped_not_connected');
    return { success: false, reason: 'not_connected' };
  }

  await msgBtn.click();
  await delay(CONFIG.DELAYS.page_load);

  const msgBox = page.locator('div[role="textbox"], div[contenteditable="true"]').last();
  await msgBox.waitFor({ timeout: 8000 });
  await msgBox.click();
  for (const char of message) {
    await page.keyboard.type(char);
    await sleep(rand(...CONFIG.DELAYS.typing));
  }
  await delay(CONFIG.DELAYS.between_actions);

  await page.keyboard.press('Enter');
  await delay(CONFIG.DELAYS.post_send);
  await screenshot(page, 'message-sent');

  console.log('[MESSAGE] Sent');
  await logToSupabase(profileUrl, message, 'message', 'sent');
  return { success: true };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    }
  }

  const dryRun    = process.argv.includes('--dry-run') || flags['dry-run'] === true;
  const action    = flags['action'];
  const profileUrl = flags['user'];
  const template  = flags['template'];
  const batchFile = flags['batch'];

  let targets = [];

  if (batchFile) {
    targets = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  } else if (profileUrl && action) {
    const text = TEMPLATES[template] ? TEMPLATES[template]() : null;
    if (!text) {
      console.error('ERROR: Provide --template <name>');
      console.log('Templates:', Object.keys(TEMPLATES).join(', '));
      process.exit(1);
    }
    targets = [{ profileUrl, action, message: text }];
  } else {
    console.error('ERROR: Provide --action <connect|message> --user <url> --template <name>');
    process.exit(1);
  }

  // Rate limit
  const { allowed, count, log: rateLog } = checkRateLimit();
  const remaining = CONFIG.DAILY_MAX - count;
  console.log(`\n[RATE] Today: ${count}/${CONFIG.DAILY_MAX} | Remaining: ${remaining}`);

  if (!dryRun && !allowed) {
    console.log(`[RATE LIMIT] Daily max (${CONFIG.DAILY_MAX}) reached. Try again tomorrow.`);
    process.exit(0);
  }

  // Filter profiles already sent across all previous days
  const sentHistory = alreadySentUrls();
  const unsent = targets.filter(t => !sentHistory.has(t.profileUrl));
  if (sentHistory.size > 0) console.log(`[HISTORY] ${sentHistory.size} already sent, ${unsent.length} remaining`);

  const queue = dryRun ? unsent : unsent.slice(0, remaining);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    slowMo: 50,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();
  const results = [];

  try {
    if (!dryRun) {
      const loaded = await loadSession(context);
      if (!loaded) {
        await login(page);
        await saveSession(context);
      } else {
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (page.url().includes('/login')) {
          await login(page);
          await saveSession(context);
        }
      }
    }

    for (let i = 0; i < queue.length; i++) {
      const { profileUrl: url, action: act, message } = queue[i];
      let result;

      if (act === 'connect') {
        result = await sendConnect(page, url, message, dryRun);
      } else if (act === 'message') {
        result = await sendMessage(page, url, message, dryRun);
      } else {
        console.log(`[SKIP] Unknown action: ${act}`);
        continue;
      }

      results.push({ url, action: act, ...result });

      if (!dryRun && result.success) bumpRateLog(rateLog, url, act);

      if (i < queue.length - 1 && !dryRun) {
        const d = rand(...CONFIG.DELAYS.between_sends);
        console.log(`[WAIT] ${Math.round(d / 1000)}s before next...`);
        await sleep(d);
      }
    }
  } finally {
    if (!dryRun) await saveSession(context);
    await browser.close();
  }

  console.log('\n' + '═'.repeat(60));
  console.log('[SUMMARY]');
  for (const r of results) {
    const status = r.dryRun ? 'DRY RUN' : r.success ? 'SENT' : `FAILED (${r.reason})`;
    console.log(`  ${r.url.slice(0, 50)} → ${r.action.toUpperCase()} → ${status}`);
  }
  const sent = results.filter(r => r.success && !r.dryRun).length;
  console.log(`\nTotal: ${results.length} | Sent: ${sent} | Dry: ${results.filter(r => r.dryRun).length}`);
  console.log('═'.repeat(60));
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
