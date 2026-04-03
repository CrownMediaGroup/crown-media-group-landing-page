// CRM Mobile Smoke Test — iPhone 14 viewport
// Usage: node test-mobile.js
// Live:  CRM_URL=https://crm.crownmediagroup.co node test-mobile.js
// Requires: npm install -D playwright && npx playwright install chromium

import { chromium, devices } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL   = process.env.CRM_URL || 'http://localhost:3001';
const iPhone14   = devices['iPhone 14'];
const SHOTS_DIR  = path.join(__dirname, 'test-screenshots');

if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...iPhone14, ignoreHTTPSErrors: true });
  const page    = await context.newPage();

  console.log(`\nCRM Mobile Test — ${BASE_URL}`);
  console.log(`Viewport: ${iPhone14.viewport.width}x${iPhone14.viewport.height} (iPhone 14)\n`);

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});

  if (page.url().includes('login')) {
    console.log('  INFO: Login wall detected — auto-logging in...');
    await page.screenshot({ path: path.join(SHOTS_DIR, '00-login.png') });
    // Fill login form
    const emailField = page.locator('#email').first();
    const passField  = page.locator('#password').first();
    const submitBtn  = page.locator('#loginBtn');
    await emailField.fill(process.env.CRM_EMAIL || 'king@crownmediagroup.co');
    await passField.fill(process.env.CRM_PASS   || 'AllGlory2026!');
    await submitBtn.click();
    await page.waitForURL(url => !url.includes('login'), { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);
    console.log('  INFO: Login submitted — current URL:', page.url());
  }

  // Check bottom nav visible
  const nav = page.locator('#mobileBottomNav');
  const navOk = await nav.isVisible().catch(() => false);
  console.log(navOk ? '  PASS: bottom nav visible' : '  FAIL: bottom nav NOT visible');

  // Screenshot each tab via bottom nav
  const tabs = ['contacts', 'pipeline', 'reports', 'settings', 'leads'];
  for (const tab of tabs) {
    const btn = page.locator(`.mbn-tab[data-tab="${tab}"]`);
    const ok  = await btn.isVisible().catch(() => false);
    if (!ok) { console.log(`  FAIL: .mbn-tab[data-tab="${tab}"] not found`); continue; }
    await btn.tap();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS_DIR, `tab-${tab}.png`) });
    console.log(`  PASS: ${tab} tab — screenshot saved`);
  }

  // Scroll down to see contact cards
  await page.locator('.mbn-tab[data-tab="contacts"]').tap().catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const main = document.querySelector('.main') || document.querySelector('.crm-content') || document.body;
    main.scrollTop = 600;
    window.scrollY && window.scrollTo(0, 600);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'contacts-cards.png') });
  console.log('  INFO: contact card list screenshot saved');

  // Go back to contacts, open contact modal
  await page.locator('.mbn-tab[data-tab="contacts"]').tap().catch(() => {});
  await page.waitForTimeout(400);
  const firstRow = page.locator('#contactsBody tr').first();
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.tap();
    await page.waitForTimeout(500);
    const modal = page.locator('#contactModal');
    const modalOk = await modal.isVisible().catch(() => false);
    console.log(modalOk ? '  PASS: contact modal opens' : '  FAIL: contact modal did not open');
    if (modalOk) {
      await page.screenshot({ path: path.join(SHOTS_DIR, 'modal-contact.png') });
    }
  }

  // Check body does NOT scroll behind modal
  const bodyOverflow = await page.evaluate(() => document.body.style.overflow);
  console.log(bodyOverflow === 'hidden' ? '  PASS: scroll lock active' : `  INFO: body.overflow = "${bodyOverflow}"`);

  // Close modal, go back to contacts, check speed-dial FAB
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('.mbn-tab[data-tab="contacts"]').tap().catch(() => {});
  await page.waitForTimeout(400);
  const speedDial = page.locator('#mobileSpeedDial');
  const sdOk = await speedDial.isVisible().catch(() => false);
  console.log(sdOk ? '  PASS: speed-dial FAB visible' : '  FAIL: speed-dial FAB NOT visible');
  // Tap speed-dial to open
  if (sdOk) {
    await page.locator('#msdTrigger').tap();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'speed-dial-open.png') });
    console.log('  INFO: speed-dial open — screenshot saved');
    await page.locator('#msdTrigger').tap(); // close
    await page.waitForTimeout(200);
  }

  await page.screenshot({ path: path.join(SHOTS_DIR, 'final.png') });
  console.log(`\nScreenshots: ${SHOTS_DIR}`);
  await browser.close();
}

run().catch(err => { console.error('Test error:', err.message); process.exit(1); });
