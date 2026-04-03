/**
 * instagram-dm.js — Instagram DM automation engine
 * Crown Media Group | Playwright headful + Supabase logging
 *
 * Usage:
 *   node Agency/tools/instagram-dm.js --user <username> --msg "<message>"
 *   node Agency/tools/instagram-dm.js --user <username> --template cold_outreach
 *   node Agency/tools/instagram-dm.js --dry-run --user <username> --template cold_outreach
 *   node Agency/tools/instagram-dm.js --batch Agency/tools/dm-queue.json
 *
 * Rate limit: 5–10 DMs/day max (configurable). Random human-like delays throughout.
 *
 * Requires .env:
 *   IG_USERNAME      — Instagram username (no @)
 *   IG_PASSWORD      — Instagram password
 *   SUPABASE_URL
 *   SUPABASE_KEY
 *
 * Logs every attempt to Supabase leads table:
 *   ig_username, message, sent_at, status (sent|dry_run|failed|rate_limited)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// ── Supabase (resolve from calls/node_modules if not global) ────────────────
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

if (!supabase) console.warn('[WARN] Supabase not configured — DMs will not be logged');

// ── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  DAILY_MAX: 8,                    // max DMs per day (stay 5–10)
  PROFILE_DIR:  path.join(__dirname, '../../security/browser-profile'),  // persistent browser state
  SESSION_FILE: path.join(__dirname, '../../security/ig-session.json'),  // legacy (kept for migration)
  RATE_LOG:     path.join(__dirname, '../../security/ig-rate.json'),
  SCREENSHOT_DIR: path.join(__dirname, '../../tools/screen'),
  BASE_URL: 'https://www.instagram.com',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  DELAYS: {
    page_load:    [2500, 4500],
    between_actions: [800, 2000],
    typing:       [60, 180],       // ms per character
    post_send:    [3000, 6000],
    between_dms:  [45000, 90000],  // 45–90s between each DM
  }
};

// ── King-approved message templates ─────────────────────────────────────────
const TEMPLATES = {
  cold_outreach: (username) =>
    `Hey! I came across your page and love what you're building. ` +
    `I'm David King — I run Crown Media Group here in Columbia, SC. ` +
    `We help local businesses grow with AI-powered marketing. ` +
    `I'd love to offer you a free content audit — no strings attached. ` +
    `Interested?`,

  follow_up: (username) =>
    `Hey, just wanted to follow up on my last message! ` +
    `Still offering that free audit for local Columbia businesses. ` +
    `Takes 15 minutes and could be a game-changer. Let me know!`,

  faith_intro: (username) =>
    `Hey! Love your page. I'm David King — faith-driven marketing strategist in Columbia, SC. ` +
    `Crown Media Group helps businesses like yours grow with AI + authentic content. ` +
    `Would love to connect and share a free audit if you're open to it. God bless!`,

  shatiea_proof: (username) =>
    `Hey! I run Crown Media Group in Columbia — we just helped a local juice brand rebrand ` +
    `and build their full social presence from scratch. ` +
    `I'd love to do a free content audit for your business. ` +
    `Takes 15 min. Interested?`,
};

// ── Utilities ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDelay([min, max]) {
  return sleep(randInt(min, max));
}

function loadRateLog() {
  try {
    if (fs.existsSync(CONFIG.RATE_LOG)) {
      return JSON.parse(fs.readFileSync(CONFIG.RATE_LOG, 'utf8'));
    }
  } catch {}
  return { date: '', count: 0, sent: [] };
}

function saveRateLog(log) {
  const dir = path.dirname(CONFIG.RATE_LOG);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG.RATE_LOG, JSON.stringify(log, null, 2));
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function checkRateLimit() {
  const log = loadRateLog();
  const today = getTodayStr();
  if (log.date !== today) return { allowed: true, count: 0, log: { date: today, count: 0, sent: [] } };
  if (log.count >= CONFIG.DAILY_MAX) return { allowed: false, count: log.count, log };
  return { allowed: true, count: log.count, log };
}

function bumpRateLog(log, username) {
  log.count += 1;
  log.sent.push({ username, at: new Date().toISOString() });
  saveRateLog(log);
}

async function logToSupabase(username, message, status) {
  if (!supabase) return;
  const { error } = await supabase.from('leads').upsert({
    ig_username: username,
    business_name: username,   // satisfies NOT NULL constraint
    notes: message,
    status,
    sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source: 'instagram_dm',
  }, { onConflict: 'ig_username' });
  if (error) console.error('[Supabase]', error.message);
}

async function takeScreenshot(page, label) {
  const dir = CONFIG.SCREENSHOT_DIR;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ig-dm-${label}-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`[SCREENSHOT] ${file}`);
}

// ── Human-like typing ────────────────────────────────────────────────────────
async function humanType(page, selector, text) {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(randInt(...CONFIG.DELAYS.typing));
  }
}

// ── Instagram session (persist cookies) ─────────────────────────────────────
async function loadSession(context) {
  if (fs.existsSync(CONFIG.SESSION_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG.SESSION_FILE, 'utf8'));
      // Handle both formats: bare cookie array OR {cookies, storage} object
      const cookies = Array.isArray(raw) ? raw : raw.cookies;
      if (cookies && cookies.length) {
        await context.addCookies(cookies);
        console.log('[SESSION] Loaded existing session');
        return true;
      }
    } catch {}
  }
  return false;
}

async function saveSession(context) {
  const cookies = await context.cookies();
  const dir = path.dirname(CONFIG.SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG.SESSION_FILE, JSON.stringify(cookies, null, 2));
  console.log('[SESSION] Saved');
}

// ── Login ────────────────────────────────────────────────────────────────────
async function login(page) {
  const { IG_USERNAME, IG_PASSWORD } = process.env;
  if (!IG_USERNAME || !IG_PASSWORD) {
    throw new Error('IG_USERNAME and IG_PASSWORD must be set in .env');
  }

  console.log('[LOGIN] Navigating to Instagram...');
  await page.goto(`${CONFIG.BASE_URL}/accounts/login/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await randDelay(CONFIG.DELAYS.page_load);

  // Handle cookie consent if present
  try {
    const allowBtn = page.locator('button:has-text("Allow all cookies"), button:has-text("Allow essential"), button:has-text("Accept all")');
    if (await allowBtn.first().isVisible({ timeout: 3000 })) {
      await allowBtn.first().click();
      await randDelay(CONFIG.DELAYS.between_actions);
    }
  } catch {}

  await humanType(page, 'input[name="username"]', IG_USERNAME);
  await randDelay(CONFIG.DELAYS.between_actions);
  await humanType(page, 'input[name="password"]', IG_PASSWORD);
  await randDelay(CONFIG.DELAYS.between_actions);

  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await randDelay(CONFIG.DELAYS.page_load);

  // Check login success
  const url = page.url();
  if (url.includes('/login') || url.includes('/challenge')) {
    await takeScreenshot(page, 'login-fail');
    throw new Error(`Login failed or challenge required. Check screenshot. URL: ${url}`);
  }

  // Dismiss "Save login info" prompt
  try {
    const notNow = page.locator('button:has-text("Not now"), button:has-text("Save info")');
    if (await notNow.first().isVisible({ timeout: 4000 })) {
      await notNow.first().click();
      await randDelay(CONFIG.DELAYS.between_actions);
    }
  } catch {}

  // Dismiss notifications prompt
  try {
    const notNow2 = page.locator('button:has-text("Not Now")');
    if (await notNow2.first().isVisible({ timeout: 3000 })) {
      await notNow2.first().click();
    }
  } catch {}

  console.log('[LOGIN] Success');
}

// ── Send a single DM ─────────────────────────────────────────────────────────
async function sendDM(page, username, message, dryRun = false) {
  console.log(`\n[DM] Target: @${username}`);
  console.log(`[DM] Message preview: ${message.slice(0, 80)}...`);

  if (dryRun) {
    console.log('[DRY RUN] Skipping actual send. Full message:');
    console.log('─'.repeat(60));
    console.log(message);
    console.log('─'.repeat(60));
    await logToSupabase(username, message, 'dry_run');
    return { success: true, dryRun: true };
  }

  // Navigate to profile
  await page.goto(`${CONFIG.BASE_URL}/${username}/`, { waitUntil: 'domcontentloaded' });
  await randDelay(CONFIG.DELAYS.page_load);

  // Dismiss login wall popup if present (Instagram shows this to non-logged-in sessions)
  try {
    const closeBtn = page.locator('button[aria-label="Close"], svg[aria-label="Close"]').first();
    if (await closeBtn.isVisible({ timeout: 3000 })) {
      await closeBtn.click();
      await randDelay([500, 1000]);
    }
  } catch {}

  // Check if still showing login wall
  if (page.url().includes('/login') || await page.locator('text=Sign up to see photos').isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[DM] Session expired — login wall detected`);
    await logToSupabase(username, message, 'failed_session_expired');
    return { success: false, reason: 'session_expired' };
  }

  // Check if profile exists
  if (await page.locator('h2:has-text("Page Not Found")').isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log(`[DM] Profile @${username} not found`);
    await logToSupabase(username, message, 'failed_not_found');
    return { success: false, reason: 'profile_not_found' };
  }

  await takeScreenshot(page, `profile-${username}`);

  // Click Message button on profile
  try {
    const msgBtn = page.locator('button:has-text("Message"), div[role="button"]:has-text("Message"), a:has-text("Message")');
    await msgBtn.first().waitFor({ timeout: 10000 });
    await msgBtn.first().click();
    await randDelay(CONFIG.DELAYS.page_load);
  } catch (e) {
    console.log(`[DM] Could not find Message button for @${username}: ${e.message}`);
    await takeScreenshot(page, `no-msg-btn-${username}`);
    await logToSupabase(username, message, 'failed_no_message_button');
    return { success: false, reason: 'no_message_button' };
  }

  // Instagram's new UI: Message button → general inbox → need to open new conversation
  // If we landed on the inbox (not a direct thread), use the new-message flow
  await randDelay([1500, 2500]);
  const onInbox = page.url().includes('/direct/inbox') || page.url().includes('/direct/t/') === false;

  if (onInbox || page.url().includes('/direct/inbox')) {
    console.log(`[DM] Inbox opened — starting new conversation with @${username}`);

    // Click the compose/pencil icon or "Send message" button to open new message dialog
    try {
      const newMsgBtn = page.locator('button[aria-label="New message"], a[aria-label="New message"], button:has-text("Send message"), svg[aria-label="New message"]');
      await newMsgBtn.first().waitFor({ timeout: 6000 });
      await newMsgBtn.first().click();
      await randDelay([1000, 2000]);
    } catch {
      // Try clicking the pencil/compose icon in the DM inbox header
      try {
        const pencil = page.locator('[aria-label="New Message"], [aria-label="Compose"]').first();
        await pencil.click({ timeout: 4000 });
        await randDelay([800, 1500]);
      } catch {}
    }

    // Search for the username in the new message dialog
    try {
      const searchInput = page.locator('input[placeholder*="Search"], input[name="queryBox"], input[aria-label*="Search"]');
      await searchInput.first().waitFor({ timeout: 8000 });
      await searchInput.first().click();
      await randDelay([500, 1000]);
      await page.keyboard.type(username, { delay: 80 });
      await randDelay([1500, 2500]);

      // Click the first search result
      const result = page.locator(`button:has-text("${username}"), div[role="button"]:has-text("${username}"), span:has-text("${username}")`);
      await result.first().waitFor({ timeout: 8000 });
      await result.first().click();
      await randDelay([800, 1500]);

      // Click Chat/Next button to open conversation
      const chatBtn = page.locator('button:has-text("Chat"), button:has-text("Next"), div[role="button"]:has-text("Next")');
      await chatBtn.first().waitFor({ timeout: 5000 });
      await chatBtn.first().click();
      await randDelay(CONFIG.DELAYS.page_load);
    } catch (e) {
      console.log(`[DM] New message dialog failed for @${username}: ${e.message}`);
      await takeScreenshot(page, `new-msg-fail-${username}`);
      await logToSupabase(username, message, 'failed_compose');
      return { success: false, reason: 'new_message_dialog_failed' };
    }
  }

  // Type message in DM composer (handles both Lexical editor and standard inputs)
  try {
    await takeScreenshot(page, `before-compose-${username}`);
    const composer = page.locator([
      'div[contenteditable="true"]',
      'div[role="textbox"]',
      'div[aria-label="Message"]',
      'div[data-lexical-editor="true"]',
      'textarea[placeholder*="essage"]',
    ].join(', '));
    await composer.first().waitFor({ timeout: 10000 });
    await composer.first().click();
    await randDelay(CONFIG.DELAYS.between_actions);

    for (const char of message) {
      await page.keyboard.type(char);
      await sleep(randInt(...CONFIG.DELAYS.typing));
    }
    await randDelay(CONFIG.DELAYS.between_actions);

    await takeScreenshot(page, `composed-${username}`);

    // Send with Enter
    await page.keyboard.press('Enter');
    await randDelay(CONFIG.DELAYS.post_send);

    await takeScreenshot(page, `sent-${username}`);
    console.log(`[DM] Sent to @${username}`);
    await logToSupabase(username, message, 'sent');
    return { success: true };
  } catch (e) {
    console.log(`[DM] Compose failed for @${username}: ${e.message}`);
    await takeScreenshot(page, `compose-fail-${username}`);
    await logToSupabase(username, message, 'failed_compose');
    return { success: false, reason: e.message };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }

  // ── Setup mode: manual login → save cookies + localStorage ──────────────────
  // Run once: node Agency/tools/instagram-dm.js --setup
  // Log in manually, press Enter — full session saved (cookies + localStorage).
  if (flags['setup']) {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  Instagram Session Setup — Crown Media Group');
    console.log('════════════════════════════════════════════════════');
    console.log('\nOpening browser. Log in to @crownmediagroupco.');
    console.log('Once you see your Instagram home feed — press ENTER here.\n');

    const setupBrowser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      slowMo: 50,
    });
    const setupCtx = await setupBrowser.newContext({
      userAgent: CONFIG.USER_AGENT,
      viewport: { width: 1280, height: 900 },
    });

    // Override automation signals before any page loads
    await setupCtx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
    });

    const setupPage = await setupCtx.newPage();
    await setupPage.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

    // Auto-detect login — poll for sessionid cookie (no Enter needed)
    console.log('[SETUP] Waiting for login... (log in to @crownmediagroupco in the browser)');
    console.log('[SETUP] Session saves automatically once your home feed loads.\n');

    await new Promise(resolve => {
      const check = setInterval(async () => {
        try {
          const cookies = await setupCtx.cookies('https://www.instagram.com');
          const hasSession = cookies.some(c => c.name === 'sessionid' && c.value);
          if (hasSession) {
            clearInterval(check);
            resolve();
          }
        } catch { clearInterval(check); resolve(); }
      }, 2000);
      // Safety timeout: 5 minutes
      setTimeout(() => { clearInterval(check); resolve(); }, 300000);
    });

    console.log('[SETUP] Login detected — saving session...');
    await sleep(2000); // let Instagram finish setting all cookies/localStorage

    // Save cookies AND localStorage
    const cookies = await setupCtx.cookies();
    let storage = {};
    try {
      storage = await setupPage.evaluate(() => {
        const ls = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          ls[k] = localStorage.getItem(k);
        }
        return ls;
      });
    } catch {}

    const dir = path.dirname(CONFIG.SESSION_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG.SESSION_FILE, JSON.stringify({ cookies, storage }, null, 2));

    console.log(`\n[SESSION] Saved ${cookies.length} cookies + ${Object.keys(storage).length} localStorage keys`);
    const hasSessionid = cookies.some(c => c.name === 'sessionid');
    console.log(`[SESSION] sessionid present: ${hasSessionid ? 'YES — fully authenticated' : 'NO — try logging in again'}`);
    console.log('[SESSION] Run DMs: node Agency/tools/instagram-dm.js --user <target> --template cold_outreach\n');
    await setupBrowser.close();
    process.exit(0);
  }

  const dryRun    = process.argv.includes('--dry-run') || flags['dry-run'] === true;
  const username  = flags['user'];
  const msgText   = flags['msg'];
  const template  = flags['template'];
  const batchFile = flags['batch'];

  // Build target list
  let targets = [];

  if (batchFile) {
    const raw = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
    targets = raw; // [{ username, message?, template? }]
  } else if (username) {
    const message = msgText || (template && TEMPLATES[template]
      ? TEMPLATES[template](username)
      : null);
    if (!message) {
      console.error('ERROR: Provide --msg "<text>" or --template <name>');
      console.log('Available templates:', Object.keys(TEMPLATES).join(', '));
      process.exit(1);
    }
    targets = [{ username, message }];
  } else {
    console.error('ERROR: Provide --user <username> or --batch <file.json>');
    process.exit(1);
  }

  // Rate limit check
  const { allowed, count, log: rateLog } = checkRateLimit();
  const remaining = CONFIG.DAILY_MAX - count;

  console.log(`\n[RATE] Today: ${count}/${CONFIG.DAILY_MAX} DMs sent | Remaining: ${remaining}`);

  if (!dryRun && !allowed) {
    console.log(`[RATE LIMIT] Daily max (${CONFIG.DAILY_MAX}) reached. Try again tomorrow.`);
    for (const t of targets) {
      await logToSupabase(t.username, t.message, 'rate_limited');
    }
    process.exit(0);
  }

  const queue = dryRun ? targets : targets.slice(0, remaining);
  if (!dryRun && queue.length < targets.length) {
    console.log(`[RATE] Only sending ${queue.length} of ${targets.length} (daily cap)`);
  }

  // Launch browser with stealth overrides
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    slowMo: 50,
  });

  const context = await browser.newContext({
    userAgent: CONFIG.USER_AGENT,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Load session file (cookies + localStorage)
  let savedCookies = [];
  let savedStorage = {};
  if (!dryRun) {
    if (!fs.existsSync(CONFIG.SESSION_FILE)) {
      console.error('[SESSION] No session found. Run: node Agency/tools/instagram-dm.js --setup');
      await browser.close();
      process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(CONFIG.SESSION_FILE, 'utf8'));
    savedCookies = Array.isArray(raw) ? raw : (raw.cookies || []);
    savedStorage = Array.isArray(raw) ? {} : (raw.storage || {});
    if (savedCookies.length) await context.addCookies(savedCookies);
  }

  // addInitScript runs before EVERY page's JS — injects localStorage + stealth BEFORE Instagram reads them
  await context.addInitScript((storageData) => {
    // Restore Instagram session storage keys before their JS checks them
    // Key keys: ig_did, ig_nonce, mid, ds_user_id
    for (const [k, v] of Object.entries(storageData)) {
      try { localStorage.setItem(k, v); } catch {}
    }
    // Hide automation fingerprints
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
  }, savedStorage);

  const page = await context.newPage();
  const results = [];

  try {
    if (!dryRun) {
      // Warmup sequence (research-confirmed): home → explore → profile
      // Cold-hitting a profile directly always triggers Instagram's login wall
      console.log('[WARMUP] Home...');
      await page.goto(CONFIG.BASE_URL, { waitUntil: 'domcontentloaded' });
      await randDelay([2500, 4000]);

      if (page.url().includes('/login')) {
        console.log('[SESSION] Expired — run --setup again');
        await browser.close();
        process.exit(1);
      }

      console.log('[WARMUP] Explore...');
      await page.goto(`${CONFIG.BASE_URL}/explore/`, { waitUntil: 'domcontentloaded' });
      await randDelay([3000, 5000]);

      console.log('[SESSION] Authenticated — ready to send DMs');
    }

    for (let i = 0; i < queue.length; i++) {
      const { username: user, message, template: tmpl } = queue[i];
      const msg = message || (tmpl && TEMPLATES[tmpl] ? TEMPLATES[tmpl](user) : null);

      if (!msg) {
        console.log(`[SKIP] @${user} — no message or invalid template`);
        continue;
      }

      const result = await sendDM(page, user, msg, dryRun);
      results.push({ username: user, ...result });

      if (!dryRun && result.success) {
        bumpRateLog(rateLog, user);
      }

      // Human-like delay between DMs (skip after last one)
      if (i < queue.length - 1 && !dryRun) {
        const delay = randInt(...CONFIG.DELAYS.between_dms);
        console.log(`[WAIT] ${Math.round(delay / 1000)}s before next DM...`);
        await sleep(delay);
      }
    }

  } finally {
    await browser.close();
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('[SUMMARY]');
  for (const r of results) {
    const status = r.dryRun ? 'DRY RUN' : r.success ? 'SENT' : `FAILED (${r.reason})`;
    console.log(`  @${r.username} → ${status}`);
  }
  const sent = results.filter(r => r.success && !r.dryRun).length;
  const dry  = results.filter(r => r.dryRun).length;
  console.log(`\nTotal: ${results.length} | Sent: ${sent} | Dry runs: ${dry} | Failed: ${results.length - sent - dry}`);
  console.log('═'.repeat(60));

  return results;
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
