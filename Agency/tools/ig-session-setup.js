#!/usr/bin/env node
/**
 * Instagram Session Setup — One-time manual login
 *
 * Run this once. A real browser opens. Log in manually.
 * Script saves your session so instagram-dm.js never needs to log in again.
 *
 * Usage: node Agency/tools/ig-session-setup.js
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });

const SESSION_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../security/ig-session.json');

(async () => {
  console.log('\n=================================================');
  console.log('  Instagram Session Setup — Crown Media Group');
  console.log('=================================================');
  console.log('\nA browser will open. Log in to @crownmediagroupco.');
  console.log('Once you see your Instagram home feed, come back here.');
  console.log('Press ENTER to save your session and close.\n');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });

  // Wait for King to log in manually
  await new Promise(resolve => {
    process.stdin.resume();
    process.stdin.once('data', resolve);
  });

  // Save cookies + storage
  const cookies = await context.cookies();
  const storage = await page.evaluate(() => ({
    localStorage: Object.fromEntries(Object.entries(localStorage)),
    sessionStorage: Object.fromEntries(Object.entries(sessionStorage))
  }));

  fs.mkdirSync(path.dirname(SESSION_PATH), { recursive: true });
  fs.writeFileSync(SESSION_PATH, JSON.stringify({ cookies, storage }, null, 2));

  console.log('\n[SESSION] Saved to', SESSION_PATH);
  console.log('[SESSION] instagram-dm.js will now use this session — no login needed.');

  await browser.close();
  process.exit(0);
})();
