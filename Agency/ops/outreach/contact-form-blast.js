#!/usr/bin/env node
// contact-form-blast.js — submits contact forms on church/org websites
// For orgs where email scraping found nothing — message goes to their inbox via their own form
// Run: node Agency/ops/outreach/contact-form-blast.js

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN = 'KingdomSeed2026';
const DELAY_MS = [2000, 4000];
const TIMEOUT_MS = 15000;
const SCREENSHOT_DIR = path.join(__dirname, '../../../tools/screen');
const LOG_FILE = path.join(__dirname, 'contact-form-results.json');
const DAILY_MAX = 20;

const SENDER = {
  name: 'David King',
  email: 'king@crownmediagroup.co',
  phone: '',
  subject: 'Helping your ministry grow its reach online',
};

function buildMessage(orgName) {
  const first = orgName.split(' ')[0];
  return `Hi there,\n\nMy name is David King — I run Crown Media Group, a faith-aligned marketing agency based in Columbia, SC.\n\nI came across ${orgName} and wanted to reach out personally. I work exclusively with churches, schools, and faith-based nonprofits to help them grow their online presence — websites, social media, and digital outreach — so more people can find and connect with your mission.\n\nI'd love to share a few ideas tailored specifically to ${orgName}. Takes about 10 minutes and there's zero commitment.\n\nYou can learn more at crownmediagroup.co or just reply here.\n\nAll glory to Jesus,\nDavid King\nCrown Media Group\nColumbia, SC`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const delay = ([min, max]) => sleep(rand(min, max));

function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch {}
  return { submitted: [], failed: [] };
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

async function screenshot(page, label) {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `cf-${label}-${Date.now()}.png`);
  await page.screenshot({ path: file }).catch(() => {});
}

async function findAndFillForm(page, orgName) {
  // Try common contact page paths
  const baseUrl = page.url().replace(/\/[^/]*$/, '').replace(/\/$/, '');
  const contactPaths = ['/contact', '/contact-us', '/about', '/reach-us', '/get-in-touch', '/connect'];

  for (const contactPath of contactPaths) {
    try {
      await page.goto(`${baseUrl}${contactPath}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      await sleep(1500);

      // Detect a form with name + message fields
      const form = page.locator('form').first();
      if (!await form.isVisible({ timeout: 3000 }).catch(() => false)) continue;

      // Fill name field
      const nameField = page.locator([
        'input[name*="name" i]:not([type="hidden"])',
        'input[placeholder*="name" i]',
        'input[id*="name" i]',
        'input[autocomplete="name"]',
      ].join(', ')).first();
      if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameField.click();
        await page.keyboard.type(SENDER.name, { delay: rand(50, 120) });
      }

      // Fill email field
      const emailField = page.locator([
        'input[type="email"]',
        'input[name*="email" i]',
        'input[placeholder*="email" i]',
        'input[id*="email" i]',
      ].join(', ')).first();
      if (await emailField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await emailField.click();
        await page.keyboard.type(SENDER.email, { delay: rand(50, 120) });
      } else {
        // No email field — form probably requires logged-in account, skip
        console.log(`    No email field found on ${contactPath}`);
        continue;
      }

      // Fill subject if present
      const subjectField = page.locator([
        'input[name*="subject" i]',
        'input[placeholder*="subject" i]',
        'input[id*="subject" i]',
      ].join(', ')).first();
      if (await subjectField.isVisible({ timeout: 1500 }).catch(() => false)) {
        await subjectField.click();
        await page.keyboard.type(SENDER.subject, { delay: rand(50, 120) });
      }

      // Fill phone if present (optional)
      const phoneField = page.locator([
        'input[type="tel"]',
        'input[name*="phone" i]',
        'input[placeholder*="phone" i]',
      ].join(', ')).first();
      if (await phoneField.isVisible({ timeout: 1000 }).catch(() => false)) {
        await phoneField.click();
        await page.keyboard.type('803-555-0100', { delay: rand(50, 120) });
      }

      // Fill message
      const msg = buildMessage(orgName);
      const msgField = page.locator([
        'textarea',
        'div[contenteditable="true"]',
        'input[name*="message" i]',
      ].join(', ')).first();
      if (!await msgField.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`    No message field on ${contactPath}`);
        continue;
      }
      await msgField.click();
      await page.keyboard.type(msg, { delay: rand(30, 80) });

      await delay(DELAY_MS);
      await screenshot(page, `before-submit-${orgName.slice(0, 20)}`);

      // Submit
      const submitBtn = page.locator([
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Send")',
        'button:has-text("Submit")',
        'button:has-text("Send Message")',
      ].join(', ')).first();

      if (!await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`    No submit button on ${contactPath}`);
        continue;
      }

      await submitBtn.click();
      await sleep(3000);
      await screenshot(page, `after-submit-${orgName.slice(0, 20)}`);

      // Check for success indicators
      const pageText = await page.textContent('body').catch(() => '');
      const success = /thank you|message sent|received|we.ll be in touch|success/i.test(pageText);

      return { success, url: page.url(), path: contactPath };
    } catch {
      continue;
    }
  }
  return null;
}

async function main() {
  console.log('CONTACT FORM BLAST — Crown Media Group');
  console.log('=======================================');

  // Load existing log to skip already-submitted
  const log = loadLog();
  const alreadyDone = new Set([
    ...log.submitted.map((e) => e.name.toLowerCase()),
    ...log.failed.map((e) => e.name.toLowerCase()),
  ]);

  console.log(`Already processed: ${alreadyDone.size}`);

  // Fetch records from CRM: have website, no email (deep-scrape didn't find email either)
  const res = await fetch(`${BASE_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=500`);
  const data = await res.json();
  const churches = data.churches || data;

  const targets = churches.filter((c) =>
    c.website && c.website.trim() !== '' &&
    (!c.email || c.email.trim() === '') &&
    !alreadyDone.has(c.name?.toLowerCase())
  );

  console.log(`Orgs with website but no email (not yet form-blasted): ${targets.length}`);
  const batch = targets.slice(0, DAILY_MAX);
  console.log(`Processing ${batch.length} today\n`);

  if (batch.length === 0) {
    console.log('Nothing to do. All targetable orgs have been processed.');
    return;
  }

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    slowMo: 30,
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  const page = await context.newPage();

  for (let i = 0; i < batch.length; i++) {
    const org = batch[i];
    console.log(`[${i + 1}/${batch.length}] ${org.name}`);

    try {
      const website = org.website.startsWith('http') ? org.website : `https://${org.website}`;
      await page.goto(website, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      await sleep(1500);

      const result = await findAndFillForm(page, org.name);

      if (result && result.success) {
        console.log(`  SUBMITTED (${result.path}) — ${result.url}`);
        log.submitted.push({ name: org.name, website: org.website, url: result.url, at: new Date().toISOString() });
      } else if (result) {
        console.log(`  FORM FOUND but no success confirm — may have sent (${result.path})`);
        log.submitted.push({ name: org.name, website: org.website, url: result.url, at: new Date().toISOString(), uncertain: true });
      } else {
        console.log(`  No usable contact form found`);
        log.failed.push({ name: org.name, website: org.website, reason: 'no_form', at: new Date().toISOString() });
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message.slice(0, 80)}`);
      log.failed.push({ name: org.name, website: org.website, reason: err.message.slice(0, 80), at: new Date().toISOString() });
    }

    saveLog(log);

    if (i < batch.length - 1) {
      const d = rand(4000, 8000);
      console.log(`  Waiting ${Math.round(d / 1000)}s...\n`);
      await sleep(d);
    }
  }

  await browser.close();

  console.log('\n=== RESULTS ===');
  console.log(`Submitted: ${log.submitted.length}`);
  console.log(`Failed:    ${log.failed.length}`);
  if (log.submitted.length > 0) {
    console.log('\nSubmitted forms:');
    for (const s of log.submitted) {
      console.log(`  ${s.name.padEnd(50)} ${s.uncertain ? '(uncertain)' : 'OK'}`);
    }
  }
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
