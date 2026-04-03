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
  SESSION_FILE: path.join(__dirname, '../../security/ig-session.json'),
  RATE_LOG:     path.join(__dirname, '../../security/ig-rate.json'),
  SCREENSHOT_DIR: path.join(__dirname, '../../tools/screen'),
  BASE_URL: 'https://www.instagram.com',
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

  // Click Message button
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

  // Type message in DM composer
  try {
    const composer = page.locator('div[aria-label="Message"], textarea[placeholder*="essage"], div[data-lexical-editor="true"]');
    await composer.first().waitFor({ timeout: 8000 });
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

  // ── Setup mode: open browser for manual login, save session ─────────────────
  if (flags['setup']) {
    console.log('\n════════════════════════════════════════════════════');
    console.log('  Instagram Session Setup — Crown Media Group');
    console.log('════════════════════════════════════════════════════');
    console.log('\nOpening browser. Log in to @crownmediagroupco.');
    console.log('Once you see your Instagram home feed — press ENTER.\n');

    let setupLauncher = chromium;
    try {
      const { chromium: sc } = await import('playwright-extra');
      const SP = (await import('playwright-extra-plugin-stealth')).default;
      sc.use(SP());
      setupLauncher = sc;
    } catch {}

    const setupBrowser = await setupLauncher.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
      slowMo: 50,
    });
    const setupCtx = await setupBrowser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });
    const setupPage = await setupCtx.newPage();
    await setupPage.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

    await new Promise(resolve => {
      process.stdin.resume();
      process.stdin.once('data', resolve);
    });

    const cookies = await setupCtx.cookies();
    const dir = path.dirname(CONFIG.SESSION_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG.SESSION_FILE, JSON.stringify(cookies, null, 2));

    console.log('\n[SESSION] Saved to', CONFIG.SESSION_FILE);
    console.log('[SESSION] Run DMs now: node Agency/tools/instagram-dm.js --user <target> --template cold_outreach\n');
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

  // Launch Playwright with stealth (bypasses Instagram bot detection)
  let chromiumLauncher = chromium;
  try {
    const { chromium: stealthChromium } = await import('playwright-extra');
    const StealthPlugin = (await import('playwright-extra-plugin-stealth')).default;
    stealthChromium.use(StealthPlugin());
    chromiumLauncher = stealthChromium;
  } catch {
    console.log('[STEALTH] Plugin not available, using standard Playwright');
  }

  const browser = await chromiumLauncher.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-web-security'],
    slowMo: 50,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = await context.newPage();
  const results = [];

  try {
    if (!dryRun) {
      const sessionLoaded = await loadSession(context);

      if (!sessionLoaded) {
        await login(page);
        await saveSession(context);
      } else {
        // Verify session is still valid
        await page.goto(CONFIG.BASE_URL, { waitUntil: 'domcontentloaded' });
        await randDelay(CONFIG.DELAYS.page_load);
        if (page.url().includes('/login')) {
          console.log('[SESSION] Expired — logging in fresh');
          await login(page);
          await saveSession(context);
        } else {
          console.log('[SESSION] Valid');
        }
      }
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
    if (!dryRun) await saveSession(context);
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
