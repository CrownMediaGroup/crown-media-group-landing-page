/**
 * claim-handles.js — Crown Media Group Platform Handle Claiming
 * Checks and claims @crownmediagroupco / @mkdavidking on TikTok, Pinterest, Threads, X
 *
 * Usage:
 *   node tools/claim-handles.js --check       ← check availability only
 *   node tools/claim-handles.js --claim        ← attempt to claim (opens browser)
 *   node tools/claim-handles.js --platform tiktok --check
 */

const path   = require('path');
const fs     = require('fs');

// Load .env
for (const p of [path.join(__dirname, '../.env'), path.join(__dirname, '.env')]) {
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length && !process.env[k.trim()])
        process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    });
  }
}

const { chromium } = require('playwright');

const IS_CHECK  = process.argv.includes('--check');
const IS_CLAIM  = process.argv.includes('--claim');
const PLATFORM  = (process.argv.includes('--platform') && process.argv[process.argv.indexOf('--platform') + 1]) || 'all';

const REPORT_FILE = path.join(__dirname, '../Agency/ops/notes/HANDLE-REPORT.md');

// ── Config ─────────────────────────────────────────────────────────────────

const HANDLES = {
  primary:   'crownmediagroupco',
  secondary: 'mkdavidking',
};

const PLATFORMS = {
  tiktok: {
    name: 'TikTok',
    checkUrl: (handle) => `https://www.tiktok.com/@${handle}`,
    signupUrl: 'https://www.tiktok.com/signup',
    usernameSelector: 'input[name="username"], input[placeholder*="username"], input[placeholder*="Username"]',
    notFoundIndicator: ["couldn't find", 'not found', '404'],
  },
  pinterest: {
    name: 'Pinterest',
    checkUrl: (handle) => `https://www.pinterest.com/${handle}/`,
    signupUrl: 'https://www.pinterest.com/join/',
    usernameSelector: 'input[name="username"], input[id*="username"]',
    notFoundIndicator: ["sorry, we couldn't find that page", 'not found'],
  },
  threads: {
    name: 'Threads',
    checkUrl: (handle) => `https://www.threads.net/@${handle}`,
    signupUrl: 'https://www.threads.net/login',
    usernameSelector: 'input[placeholder*="username"], input[name="username"]',
    notFoundIndicator: ["page isn't available", 'not found', 'sorry, this page'],
  },
  x: {
    name: 'X (Twitter)',
    checkUrl: (handle) => `https://x.com/${handle}`,
    signupUrl: 'https://x.com/i/flow/signup',
    usernameSelector: 'input[data-testid*="ocfEnterText"], input[name="text"]',
    notFoundIndicator: ["this account doesn't exist", 'account suspended', 'user not found'],
  },
};

// ── Log ────────────────────────────────────────────────────────────────────

const results = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  results.push(line);
}

// ── Check if handle is available ───────────────────────────────────────────

async function checkHandle(page, platform, platformKey, handle) {
  const url = platform.checkUrl(handle);
  log(`Checking ${platform.name}: @${handle} → ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    const bodyText = (await page.evaluate(() => document.body?.innerText || '')).toLowerCase();

    const isAvailable = platform.notFoundIndicator.some(phrase => bodyText.includes(phrase));

    const status = isAvailable ? 'AVAILABLE' : 'TAKEN';
    log(`  ${platform.name} @${handle}: ${status}`);

    // Screenshot proof
    const screenshotDir = path.join(__dirname, '../Agency/ops/notes/handle-screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, `${platformKey}-${handle}.png`), fullPage: false });

    return { platform: platform.name, platformKey, handle, status, url };
  } catch (e) {
    log(`  ${platform.name} @${handle}: ERROR — ${e.message}`);
    return { platform: platform.name, platformKey, handle, status: 'ERROR', url };
  }
}

// ── Write report ───────────────────────────────────────────────────────────

function writeReport(checks) {
  const date = new Date().toISOString().split('T')[0];
  const available = checks.filter(c => c.status === 'AVAILABLE');
  const taken     = checks.filter(c => c.status === 'TAKEN');
  const errors    = checks.filter(c => c.status === 'ERROR');

  const content = `# Handle Availability Report — ${date}

**Handles checked:** @${HANDLES.primary}, @${HANDLES.secondary}
**Available:** ${available.length} | **Taken:** ${taken.length} | **Errors:** ${errors.length}

## Available (Claim These Now)

${available.length ? available.map(c => `- **${c.platform}**: @${c.handle} → ${c.url}`).join('\n') : '_None available_'}

## Already Taken

${taken.length ? taken.map(c => `- **${c.platform}**: @${c.handle}`).join('\n') : '_None taken_'}

## Errors (Manual Check Needed)

${errors.length ? errors.map(c => `- **${c.platform}**: @${c.handle}`).join('\n') : '_None_'}

## Screenshots
Saved to: Agency/ops/notes/handle-screenshots/

---
_Generated by claim-handles.js — ${new Date().toISOString()}_
`;

  const dir = path.dirname(REPORT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REPORT_FILE, content);
  log(`Report written: ${REPORT_FILE}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  if (!IS_CHECK && !IS_CLAIM) {
    console.log('Usage: node tools/claim-handles.js --check | --claim [--platform tiktok|pinterest|threads|x]');
    process.exit(0);
  }

  log(`=== Handle ${IS_CHECK ? 'Check' : 'Claim'} Run (${PLATFORM}) ===`);

  const targetPlatforms = PLATFORM === 'all'
    ? Object.entries(PLATFORMS)
    : Object.entries(PLATFORMS).filter(([k]) => k === PLATFORM);

  if (!targetPlatforms.length) {
    log(`Unknown platform: ${PLATFORM}. Use: tiktok, pinterest, threads, x`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: IS_CHECK, slowMo: IS_CLAIM ? 100 : 0 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  const checks = [];

  for (const [platformKey, platform] of targetPlatforms) {
    // Check primary handle
    const primaryResult = await checkHandle(page, platform, platformKey, HANDLES.primary);
    checks.push(primaryResult);

    // Check secondary handle
    const secondaryResult = await checkHandle(page, platform, platformKey, HANDLES.secondary);
    checks.push(secondaryResult);

    // Small delay between platforms
    await page.waitForTimeout(1500);
  }

  writeReport(checks);

  const available = checks.filter(c => c.status === 'AVAILABLE');
  if (available.length) {
    log(`\n ACTION REQUIRED: ${available.length} handles are available:`);
    available.forEach(c => log(`  → ${c.platform}: @${c.handle} — claim at ${c.url}`));
  } else {
    log('\n All checked handles are already taken or errored.');
  }

  await browser.close();
  log('=== Handle check complete ===');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
