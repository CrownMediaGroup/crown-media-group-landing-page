/**
 * social-post.js — Social media posting engine
 * Crown Media Group | Playwright headful
 *
 * Usage:
 *   node Agency/tools/social-post.js --platform instagram --caption "Your caption" --image path/to/image.jpg
 *   node Agency/tools/social-post.js --platform facebook --caption "Your caption"
 *   node Agency/tools/social-post.js --platform x --caption "Your tweet"
 *   node Agency/tools/social-post.js --platform tiktok --video path/to/video.mp4 --caption "Your caption"
 *   node Agency/tools/social-post.js --platform all --caption "Your caption" --image path/to/image.jpg
 *   node Agency/tools/social-post.js --dry-run --platform instagram --caption "Test"
 *
 * Platforms: instagram | facebook | x | tiktok | threads | all
 *
 * Logs every post to Supabase content table.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { chromium: playwrightChromium } = require('playwright');
let chromium;
try {
  const { chromium: extraChromium } = require('playwright-extra');
  const stealth = require('puppeteer-extra-plugin-stealth');
  extraChromium.use(stealth());
  chromium = extraChromium;
  console.log('[STEALTH] Stealth mode active');
} catch {
  chromium = playwrightChromium;
}
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

// ── Config ────────────────────────────────────────────────────────────────────
const SCREENSHOT_DIR = path.join(__dirname, '../../tools/screen');

const DELAYS = {
  page_load:       [2000, 4000],
  between_actions: [800,  2000],
  typing:          [50,   150],
  post_confirm:    [3000, 5000],
};

// ── Utilities ─────────────────────────────────────────────────────────────────
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const rand    = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const delay   = ([min, max]) => sleep(rand(min, max));

async function screenshot(page, label) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `social-${label}-${Date.now()}.png`);
  await page.screenshot({ path: file });
  console.log(`[SCREENSHOT] ${file}`);
}

async function logPost(platform, caption, mediaPath, status, error = null) {
  console.log(`[LOG] ${platform} → ${status}`);
  if (!supabase) return;
  await supabase.from('content').upsert({
    platform,
    caption,
    media_path: mediaPath || null,
    status,
    error_msg: error,
    posted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

async function humanType(page, selector, text) {
  await page.click(selector);
  await delay(DELAYS.between_actions);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(rand(...DELAYS.typing));
  }
}

// ── Browser factory ───────────────────────────────────────────────────────────
// Persistent automation profile — King logs in once, stays logged in forever
const AUTOMATION_PROFILE = path.join(__dirname, '../../security/browser-profile');

async function launchBrowser() {
  if (!fs.existsSync(AUTOMATION_PROFILE)) fs.mkdirSync(AUTOMATION_PROFILE, { recursive: true });
  // Clear stale lock files that cause immediate crash on Windows
  for (const lockFile of ['SingletonLock', 'lockfile', 'LOCK']) {
    const lockPath = path.join(AUTOMATION_PROFILE, lockFile);
    try { fs.unlinkSync(lockPath); } catch {}
  }
  // Use system Edge (always installed on Windows 11) — avoids Playwright Chromium SwiftShader crash
  return playwrightChromium.launchPersistentContext(AUTOMATION_PROFILE, {
    channel: 'msedge',
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    slowMo: 30,
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTAGRAM — Playwright + stealth + persistent profile
// King logs in once manually; all future posts are fully automated.
// ─────────────────────────────────────────────────────────────────────────────
async function postInstagram(caption, imagePath, dryRun) {
  console.log('\n[INSTAGRAM] Starting...');

  if (dryRun) {
    console.log('[DRY RUN] Instagram post:');
    console.log(`Caption: ${caption}`);
    console.log(`Image: ${imagePath || 'none'}`);
    await logPost('instagram', caption, imagePath, 'dry_run');
    return { success: true, dryRun: true };
  }

  if (!imagePath) {
    console.log('[INSTAGRAM] Image required for Instagram posts');
    return { success: false, reason: 'image_required' };
  }

  const absImage = path.resolve(imagePath);
  if (!fs.existsSync(absImage)) {
    console.log(`[INSTAGRAM] Image not found: ${absImage}`);
    return { success: false, reason: 'image_not_found' };
  }

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(DELAYS.page_load);
    await screenshot(page, 'ig-home');

    // ── Check login ────────────────────────────────────────────────────────
    const needsLogin = (url) => ['/accounts/login', '/accounts/onetap', '/login', 'accounts/signup'].some(p => url.includes(p));
    if (needsLogin(page.url())) {
      console.log('\n[INSTAGRAM] NOT LOGGED IN — browser is open.');
      console.log('>>> Log in to Instagram in the browser window using your IG username/password.');
      console.log('>>> After you see the Instagram home feed, press ENTER here to continue.\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
      // Wait for full home feed load
      await page.waitForURL(url => !needsLogin(url.toString()), { timeout: 60000 }).catch(() => {});
      await delay(DELAYS.page_load);
      console.log('[INSTAGRAM] Login confirmed. Session saved in automation profile permanently.');
    }

    await screenshot(page, 'ig-logged-in');

    // ── Click "New post" / "Create" button ────────────────────────────────
    console.log('[INSTAGRAM] Looking for New Post button...');
    const createSelectors = [
      'svg[aria-label="New post"]',
      '[aria-label="New post"]',
      'svg[aria-label="Create"]',
      '[aria-label="Create"]',
      'a[href="/create/style/"]',
    ];
    let clicked = false;
    for (const sel of createSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          clicked = true;
          console.log(`[INSTAGRAM] Clicked: ${sel}`);
          break;
        }
      } catch {}
    }
    if (!clicked) {
      // Try navigating directly to create URL
      await page.goto('https://www.instagram.com/create/style/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    await delay(DELAYS.page_load);
    await screenshot(page, 'ig-create-modal');

    // ── Upload file ───────────────────────────────────────────────────────
    console.log('[INSTAGRAM] Uploading image...');
    // Prepare image: ensure it's 1080x1080 JPEG
    const sharp = require('sharp');
    const tmpPath = path.join(__dirname, '../../security/ig-upload-tmp.jpg');
    await sharp(absImage)
      .resize(1080, 1080, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 92 })
      .toFile(tmpPath);

    // Wait for file input (may be hidden)
    const fileInput = page.locator('input[type="file"]').first();
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);

    // Try clicking "Select from computer" button first
    const selectBtns = [
      'button:has-text("Select from computer")',
      'button:has-text("Select from")',
      'div[role="button"]:has-text("Select from")',
    ];
    let btnClicked = false;
    for (const sel of selectBtns) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 3000 })) {
          await btn.click();
          btnClicked = true;
          break;
        }
      } catch {}
    }
    if (!btnClicked) {
      try { await fileInput.click({ force: true }); } catch {}
    }

    const fileChooser = await fileChooserPromise;
    if (fileChooser) {
      await fileChooser.setFiles(tmpPath);
    } else {
      await fileInput.setInputFiles(tmpPath, { force: true });
    }
    await delay([2000, 3000]);
    await screenshot(page, 'ig-file-selected');

    // ── Next → Next → Caption → Share ────────────────────────────────────
    for (let step = 0; step < 2; step++) {
      const nextBtn = page.locator('button:has-text("Next"), [aria-label="Next"]').last();
      if (await nextBtn.isVisible({ timeout: 5000 })) {
        await nextBtn.click();
        await delay(DELAYS.between_actions);
        await screenshot(page, `ig-next-${step}`);
      }
    }

    // Add caption
    const captionBox = page.locator('div[aria-label*="caption"], div[aria-label*="Caption"], textarea[placeholder*="caption"]').first();
    if (await captionBox.isVisible({ timeout: 5000 })) {
      await captionBox.click();
      for (const char of caption) {
        await page.keyboard.type(char);
        await sleep(rand(...DELAYS.typing));
      }
    }
    await screenshot(page, 'ig-caption');

    // Click Share
    const shareBtn = page.locator('div[role="button"]:has-text("Share"), button:has-text("Share")').last();
    await shareBtn.waitFor({ timeout: 10000 });
    await shareBtn.click();
    await delay(DELAYS.post_confirm);
    await screenshot(page, 'ig-posted');

    try { fs.unlinkSync(tmpPath); } catch {}

    console.log('[INSTAGRAM] Posted successfully');
    await logPost('instagram', caption, imagePath, 'posted');
    return { success: true };

  } catch (e) {
    await screenshot(page, 'ig-error').catch(() => {});
    console.log(`[INSTAGRAM] Failed: ${e.message}`);
    await logPost('instagram', caption, imagePath, 'failed', e.message);
    return { success: false, reason: e.message };
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FACEBOOK — Playwright + persistent profile
// King logs in once manually; all future posts are fully automated.
// Posts to the Crown Media Group Page (crownmediagroupco).
// ─────────────────────────────────────────────────────────────────────────────
async function postFacebook(caption, imagePath, dryRun) {
  console.log('\n[FACEBOOK] Starting...');

  if (dryRun) {
    console.log('[DRY RUN] Facebook post:');
    console.log(`Caption: ${caption}`);
    await logPost('facebook', caption, imagePath, 'dry_run');
    return { success: true, dryRun: true };
  }

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(DELAYS.page_load);
    await screenshot(page, 'fb-home');

    // ── Check login ────────────────────────────────────────────────────────
    const needsLogin = (url) => ['/login', 'login.php', 'accounts/login'].some(p => url.includes(p));
    if (needsLogin(page.url())) {
      console.log('\n[FACEBOOK] NOT LOGGED IN — browser is open.');
      console.log('>>> Log in to Facebook in the browser window.');
      console.log('>>> After you see the Facebook home feed, press ENTER here to continue.\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
      await page.waitForURL(url => !needsLogin(url.toString()), { timeout: 60000 }).catch(() => {});
      await delay(DELAYS.page_load);
      console.log('[FACEBOOK] Login confirmed. Session saved permanently.');
    }

    // ── Navigate to the Page ───────────────────────────────────────────────
    await page.goto('https://www.facebook.com/crownmediagroupco', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(DELAYS.page_load);
    await screenshot(page, 'fb-page');

    // ── Click composer ─────────────────────────────────────────────────────
    const composerSelectors = [
      '[aria-label*="Write something"]',
      '[aria-label*="what\'s on your mind"]',
      '[aria-label*="Create a post"]',
      'div[role="button"][tabindex="0"]:has-text("Write something")',
      'div[role="button"][tabindex="0"]:has-text("What")',
    ];
    let composerClicked = false;
    for (const sel of composerSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          composerClicked = true;
          console.log(`[FACEBOOK] Opened composer: ${sel}`);
          break;
        }
      } catch {}
    }
    if (!composerClicked) {
      // Try clicking the text area placeholder directly
      const placeholder = page.getByPlaceholder(/Write something|What's on your mind/i).first();
      if (await placeholder.isVisible({ timeout: 5000 })) {
        await placeholder.click();
        composerClicked = true;
      }
    }
    await delay(DELAYS.page_load);
    await screenshot(page, 'fb-composer');

    // ── Type caption ───────────────────────────────────────────────────────
    const textArea = page.locator('div[contenteditable="true"][role="textbox"], div[data-lexical-editor="true"]').first();
    await textArea.waitFor({ timeout: 10000 });
    await textArea.click();
    for (const char of caption) {
      await page.keyboard.type(char);
      await sleep(rand(...DELAYS.typing));
    }

    // ── Upload image if provided ───────────────────────────────────────────
    if (imagePath && fs.existsSync(path.resolve(imagePath))) {
      const photoBtnSelectors = [
        '[aria-label="Photo/video"]',
        '[aria-label*="Photo"]',
        'div[role="button"]:has-text("Photo")',
      ];
      for (const sel of photoBtnSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 3000 })) {
            await btn.click();
            await delay(DELAYS.between_actions);
            const fileInput = page.locator('input[type="file"]').first();
            await fileInput.setInputFiles(path.resolve(imagePath));
            await delay(DELAYS.page_load);
            break;
          }
        } catch {}
      }
    }

    await screenshot(page, 'fb-ready');

    // ── Post ───────────────────────────────────────────────────────────────
    const postBtn = page.locator('[aria-label="Post"], button:has-text("Post"), div[role="button"]:has-text("Post")').last();
    await postBtn.waitFor({ timeout: 10000 });
    await postBtn.click();
    await delay(DELAYS.post_confirm);
    await screenshot(page, 'fb-posted');

    console.log('[FACEBOOK] Posted successfully');
    await logPost('facebook', caption, imagePath, 'posted');
    return { success: true };

  } catch (e) {
    await screenshot(page, 'fb-error').catch(() => {});
    console.log(`[FACEBOOK] Failed: ${e.message}`);
    await logPost('facebook', caption, imagePath, 'failed', e.message);
    return { success: false, reason: e.message };
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// X (TWITTER) — Playwright + persistent profile
// King logs in once manually; all future posts are fully automated.
// ─────────────────────────────────────────────────────────────────────────────
async function postX(caption, imagePath, dryRun) {
  console.log('\n[X] Starting...');

  if (caption.length > 280) {
    console.log(`[X] Caption too long (${caption.length} chars). Truncating to 277 + ...`);
    caption = caption.slice(0, 277) + '...';
  }

  if (dryRun) {
    console.log('[DRY RUN] X post:');
    console.log(`Caption (${caption.length}/280): ${caption}`);
    await logPost('x', caption, imagePath, 'dry_run');
    return { success: true, dryRun: true };
  }

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(DELAYS.page_load);
    await screenshot(page, 'x-home');

    // ── Check login ────────────────────────────────────────────────────────
    const needsLogin = (url) => ['/login', '/i/flow', 'signin'].some(p => url.includes(p));
    if (needsLogin(page.url())) {
      console.log('\n[X] NOT LOGGED IN — browser is open.');
      console.log('>>> Log in to X in the browser window using crownmedia_co.');
      console.log('>>> After you see the X home feed, press ENTER here to continue.\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
      await page.waitForURL(url => !needsLogin(url.toString()), { timeout: 60000 }).catch(() => {});
      await delay(DELAYS.page_load);
      console.log('[X] Login confirmed. Session saved permanently.');
    }

    await screenshot(page, 'x-logged-in');

    // ── Click compose button ───────────────────────────────────────────────
    console.log('[X] Looking for compose button...');
    const composeBtns = [
      'a[data-testid="SideNav_NewTweet_Button"]',
      'a[aria-label="Post"]',
      'button[aria-label="Post"]',
      '[data-testid="SideNav_NewTweet_Button"]',
    ];
    let composeClicked = false;
    for (const sel of composeBtns) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          composeClicked = true;
          console.log(`[X] Clicked compose: ${sel}`);
          break;
        }
      } catch {}
    }
    if (!composeClicked) {
      // Try the floating compose button on mobile-ish layout
      await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    await delay(DELAYS.between_actions);

    // ── Type caption ───────────────────────────────────────────────────────
    const tweetBox = page.locator('[data-testid="tweetTextarea_0"], div[role="textbox"][aria-label*="Post"]').first();
    await tweetBox.waitFor({ timeout: 10000 });
    await tweetBox.click();
    for (const char of caption) {
      await page.keyboard.type(char);
      await sleep(rand(...DELAYS.typing));
    }

    // ── Upload image if provided ───────────────────────────────────────────
    if (imagePath && fs.existsSync(path.resolve(imagePath))) {
      const fileInput = page.locator('input[data-testid="fileInput"]').first();
      try {
        if (await fileInput.isVisible({ timeout: 3000 })) {
          await fileInput.setInputFiles(path.resolve(imagePath));
        } else {
          await fileInput.setInputFiles(path.resolve(imagePath), { force: true });
        }
        await delay(DELAYS.page_load);
        await screenshot(page, 'x-image-added');
      } catch {}
    }

    await screenshot(page, 'x-ready');

    // ── Post ───────────────────────────────────────────────────────────────
    const postBtn = page.locator('button[data-testid="tweetButton"], button[data-testid="tweetButtonInline"]').first();
    await postBtn.waitFor({ timeout: 10000 });
    await postBtn.click();
    await delay(DELAYS.post_confirm);
    await screenshot(page, 'x-posted');

    console.log('[X] Posted successfully');
    await logPost('x', caption, imagePath, 'posted');
    return { success: true };

  } catch (e) {
    await screenshot(page, 'x-error').catch(() => {});
    console.log(`[X] Failed: ${e.message}`);
    await logPost('x', caption, imagePath, 'failed', e.message);
    return { success: false, reason: e.message };
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIKTOK — Playwright + persistent profile
// King logs in once manually; all future posts are fully automated.
// ─────────────────────────────────────────────────────────────────────────────
async function postTikTok(caption, videoPath, dryRun) {
  console.log('\n[TIKTOK] Starting...');

  if (dryRun) {
    console.log('[DRY RUN] TikTok post:');
    console.log(`Caption: ${caption}`);
    console.log(`Video: ${videoPath || 'none'}`);
    await logPost('tiktok', caption, videoPath, 'dry_run');
    return { success: true, dryRun: true };
  }

  if (!videoPath) {
    console.log('[TIKTOK] Video required for TikTok posts');
    return { success: false, reason: 'video_required' };
  }

  const absVideo = path.resolve(videoPath);
  if (!fs.existsSync(absVideo)) {
    console.log(`[TIKTOK] Video not found: ${absVideo}`);
    return { success: false, reason: 'video_not_found' };
  }

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(DELAYS.page_load);
    await screenshot(page, 'tt-home');

    // ── Check login ────────────────────────────────────────────────────────
    const needsLogin = (url) => ['/login', '/signup'].some(p => url.includes(p));
    // TikTok doesn't always redirect — check for login button presence
    const loginBtn = page.locator('a[href*="/login"], button:has-text("Log in")').first();
    const isLoggedOut = await loginBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (needsLogin(page.url()) || isLoggedOut) {
      console.log('\n[TIKTOK] NOT LOGGED IN — browser is open.');
      console.log('>>> Log in to TikTok in the browser window using crownmediagroupco.');
      console.log('>>> After you see the TikTok home feed, press ENTER here to continue.\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
      await delay(DELAYS.page_load);
      console.log('[TIKTOK] Login confirmed. Session saved permanently.');
    }

    // ── Navigate to upload ─────────────────────────────────────────────────
    await page.goto('https://www.tiktok.com/upload', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await delay(DELAYS.page_load);
    await screenshot(page, 'tt-upload-page');

    // ── Upload video ───────────────────────────────────────────────────────
    console.log('[TIKTOK] Uploading video...');
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ timeout: 15000 });
    await fileInput.setInputFiles(absVideo);
    await delay([6000, 10000]); // video processing time
    await screenshot(page, 'tt-upload');

    // ── Caption ────────────────────────────────────────────────────────────
    const captionSelectors = [
      'div[contenteditable="true"][data-contents="true"]',
      'div[contenteditable="true"]',
      '[placeholder*="caption"]',
    ];
    let captionDone = false;
    for (const sel of captionSelectors) {
      try {
        const captionBox = page.locator(sel).first();
        if (await captionBox.isVisible({ timeout: 5000 })) {
          await captionBox.click();
          await page.keyboard.selectAll();
          await page.keyboard.press('Backspace');
          for (const char of caption) {
            await page.keyboard.type(char);
            await sleep(rand(...DELAYS.typing));
          }
          captionDone = true;
          break;
        }
      } catch {}
    }
    if (captionDone) console.log('[TIKTOK] Caption added');
    await delay(DELAYS.between_actions);
    await screenshot(page, 'tt-caption');

    // ── Post ───────────────────────────────────────────────────────────────
    const postBtn = page.locator('button:has-text("Post"), button[data-e2e="post-button"]').last();
    await postBtn.waitFor({ timeout: 15000 });
    await postBtn.click();
    await delay([5000, 8000]); // TikTok takes a moment to confirm
    await screenshot(page, 'tt-posted');

    console.log('[TIKTOK] Posted successfully');
    await logPost('tiktok', caption, videoPath, 'posted');
    return { success: true };

  } catch (e) {
    await screenshot(page, 'tt-error').catch(() => {});
    console.log(`[TIKTOK] Failed: ${e.message}`);
    await logPost('tiktok', caption, videoPath, 'failed', e.message);
    return { success: false, reason: e.message };
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THREADS — Playwright + persistent profile (shares Instagram login via Meta)
// King logs in once manually; all future posts are fully automated.
// Character limit: 500 chars
// ─────────────────────────────────────────────────────────────────────────────
async function postThreads(caption, imagePath, dryRun) {
  console.log('\n[THREADS] Starting...');

  if (caption.length > 500) {
    console.log(`[THREADS] Caption too long (${caption.length} chars). Truncating to 497 + ...`);
    caption = caption.slice(0, 497) + '...';
  }

  if (dryRun) {
    console.log('[DRY RUN] Threads post:');
    console.log(`Caption (${caption.length}/500): ${caption}`);
    await logPost('threads', caption, imagePath, 'dry_run');
    return { success: true, dryRun: true };
  }

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(DELAYS.page_load);
    await screenshot(page, 'threads-home');

    // ── Check login ────────────────────────────────────────────────────────
    const needsLogin = (url) => ['/login', '/accounts/login', 'signup'].some(p => url.includes(p));
    const loginEl = page.locator('a[href*="/login"], button:has-text("Log in"), a:has-text("Log in")').first();
    const isLoggedOut = await loginEl.isVisible({ timeout: 3000 }).catch(() => false);

    if (needsLogin(page.url()) || isLoggedOut) {
      console.log('\n[THREADS] NOT LOGGED IN — browser is open.');
      console.log('>>> Log in to Threads (use your Instagram account).');
      console.log('>>> After you see the Threads home feed, press ENTER here to continue.\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
      await delay(DELAYS.page_load);
      console.log('[THREADS] Login confirmed. Session saved permanently.');
    }

    // ── Click compose ──────────────────────────────────────────────────────
    const composeBtns = [
      '[aria-label="New thread"]',
      'a[href*="/new"]',
      'button[aria-label*="Create"]',
      'div[role="button"]:has-text("Start a thread")',
      '[data-testid="new-thread-btn"]',
    ];
    let composerClicked = false;
    for (const sel of composeBtns) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 3000 })) {
          await el.click();
          composerClicked = true;
          console.log(`[THREADS] Opened composer: ${sel}`);
          break;
        }
      } catch {}
    }
    if (!composerClicked) {
      // Try navigating directly to compose URL
      await page.goto('https://www.threads.net/new', { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    await delay(DELAYS.between_actions);
    await screenshot(page, 'threads-compose');

    // ── Type caption ───────────────────────────────────────────────────────
    const textArea = page.locator(
      'div[contenteditable="true"][role="textbox"], div[contenteditable="true"][aria-label*="thread"], textarea[placeholder*="thread"]'
    ).first();
    await textArea.waitFor({ timeout: 10000 });
    await textArea.click();
    for (const char of caption) {
      await page.keyboard.type(char);
      await sleep(rand(...DELAYS.typing));
    }

    // ── Upload image if provided ───────────────────────────────────────────
    if (imagePath && fs.existsSync(path.resolve(imagePath))) {
      const fileInput = page.locator('input[type="file"]').first();
      try {
        await fileInput.setInputFiles(path.resolve(imagePath), { force: true });
        await delay(DELAYS.page_load);
        await screenshot(page, 'threads-image-added');
      } catch {}
    }

    await screenshot(page, 'threads-ready');

    // ── Post ───────────────────────────────────────────────────────────────
    const postBtn = page.locator(
      'button:has-text("Post"), div[role="button"]:has-text("Post"), button[type="submit"]'
    ).last();
    await postBtn.waitFor({ timeout: 10000 });
    await postBtn.click();
    await delay(DELAYS.post_confirm);
    await screenshot(page, 'threads-posted');

    console.log('[THREADS] Posted successfully');
    await logPost('threads', caption, imagePath, 'posted');
    return { success: true };

  } catch (e) {
    await screenshot(page, 'threads-error').catch(() => {});
    console.log(`[THREADS] Failed: ${e.message}`);
    await logPost('threads', caption, imagePath, 'failed', e.message);
    return { success: false, reason: e.message };
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
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

  const platform = flags['platform'];
  const caption  = flags['caption'] || '';
  const image    = flags['image'];
  const video    = flags['video'];
  const dryRun   = process.argv.includes('--dry-run') || flags['dry-run'] === true;

  // ── Login-only mode ────────────────────────────────────────────────────────
  // Opens the automation browser for a specific platform so King can log in once.
  // Session is saved permanently in security/browser-profile.
  // Usage: node social-post.js --login-only facebook
  const loginOnly = flags['login-only'];
  if (loginOnly) {
    const loginPlatform = (typeof loginOnly === 'string' ? loginOnly : platform) || '';
    const LOGIN_URLS = {
      instagram: 'https://www.instagram.com/accounts/login/',
      facebook:  'https://www.facebook.com/login/',
      x:         'https://x.com/login',
      tiktok:    'https://www.tiktok.com/login',
      threads:   'https://www.threads.net/login',
    };
    const loginUrl = LOGIN_URLS[loginPlatform];
    if (!loginUrl) {
      console.log(`[LOGIN] Unknown platform: "${loginPlatform}". Options: instagram, facebook, x, tiktok`);
      process.exit(1);
    }
    // Success URL patterns — once King lands here, login is confirmed
    const SUCCESS_URLS = {
      instagram: url => !url.includes('/login') && !url.includes('/accounts/'),
      facebook:  url => url.includes('facebook.com') && !url.includes('/login') && !url.includes('login.php'),
      x:         url => (url.includes('x.com') || url.includes('twitter.com')) && !url.includes('/login') && !url.includes('/i/flow'),
      tiktok:    url => url.includes('tiktok.com') && !url.includes('/login') && !url.includes('/signup'),
      threads:   url => url.includes('threads.net') && !url.includes('/login') && !url.includes('/accounts/'),
    };
    const isSuccess = SUCCESS_URLS[loginPlatform];

    console.log(`\n[LOGIN] Opening ${loginPlatform.toUpperCase()} in automation browser...`);
    console.log('[LOGIN] Log in with your credentials in the browser window.');
    console.log('[LOGIN] Session will be saved permanently — browser will close automatically after login.\n');
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Auto-detect login success — poll every second for up to 3 minutes
    console.log('[LOGIN] Waiting for you to log in...');
    const maxWait = 180000;
    const start   = Date.now();
    while (Date.now() - start < maxWait) {
      await sleep(1000);
      const url = page.url();
      if (isSuccess(url)) {
        await sleep(2000); // let page settle
        console.log(`[LOGIN] Login detected at: ${url}`);
        break;
      }
    }

    await screenshot(page, `login-${loginPlatform}-saved`);
    await browser.close();
    console.log(`[LOGIN] ${loginPlatform.toUpperCase()} session saved. You're locked in.`);
    process.exit(0);
  }

  // ── Per-platform captions (from social-creator.js) ────────────────────────
  const captionsFile = flags['captions-file'];
  let platformCaptions = null;
  if (captionsFile && fs.existsSync(captionsFile)) {
    platformCaptions = JSON.parse(fs.readFileSync(captionsFile, 'utf8'));
    console.log(`[CAPTIONS] Loaded platform-specific captions from: ${captionsFile}`);
  }
  const getCaption = (p) => (platformCaptions && platformCaptions[p]) ? platformCaptions[p] : caption;

  if (!platform) {
    console.log('Usage: node social-post.js --platform <instagram|facebook|x|tiktok|all> --caption "text" [--image path] [--video path] [--dry-run]');
    console.log('       node social-post.js --login-only <instagram|facebook|x|tiktok>');
    console.log('       node social-post.js --platform all --captions-file path/to/captions.json --image path');
    process.exit(1);
  }

  if (!caption && !captionsFile) {
    console.log('ERROR: --caption or --captions-file is required');
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`SOCIAL POST | Platform: ${platform.toUpperCase()} | Dry run: ${dryRun}`);
  const displayCaption = getCaption('instagram') || caption;
  console.log(`Caption: ${displayCaption.slice(0, 80)}${displayCaption.length > 80 ? '...' : ''}`);
  console.log('═'.repeat(60));

  const results = {};

  if (platform === 'instagram' || platform === 'all') {
    results.instagram = await postInstagram(getCaption('instagram'), image, dryRun);
  }
  if (platform === 'facebook' || platform === 'all') {
    results.facebook = await postFacebook(getCaption('facebook'), image, dryRun);
  }
  if (platform === 'x' || platform === 'all') {
    results.x = await postX(getCaption('x'), image, dryRun);
  }
  if (platform === 'tiktok' || platform === 'all') {
    results.tiktok = await postTikTok(getCaption('tiktok'), video, dryRun);
  }
  if (platform === 'threads' || platform === 'all') {
    results.threads = await postThreads(getCaption('threads'), image, dryRun);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('[RESULTS]');
  for (const [p, r] of Object.entries(results)) {
    const status = r.dryRun ? 'DRY RUN' : r.success ? 'POSTED' : `FAILED (${r.reason})`;
    console.log(`  ${p.padEnd(12)} → ${status}`);
  }
  console.log('═'.repeat(60));
}

// Export functions for use by social-creator.js
module.exports = { postInstagram, postFacebook, postX, postTikTok, postThreads };

// Only run main() when executed directly (not when require()'d)
if (require.main === module) {
  main().catch(e => {
    console.error('[FATAL]', e.message);
    process.exit(1);
  });
}
