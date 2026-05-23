#!/usr/bin/env node
// send-rehoboth-touch3.mjs — autonomous Touch-3 reply to Rehoboth Baptist Church admin
// Uses the same nodemailer + Gmail SMTP pattern that fired tonight's 130-email blast successfully.
// Attaches the personalized PDF (rehoboth-baptist-free-project-offer.pdf) and marks CRM record.

import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

// Load env from .env at repo root
function loadEnv() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) { console.error('.env not found at', envPath); process.exit(1); }
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    env[k.trim()] = rest.join('=').trim();
  }
  return env;
}
const env = loadEnv();

const GMAIL_USER = env.GMAIL_USER;
const GMAIL_APP_PASSWORD = env.GMAIL_APP_PASSWORD;
const SEED_TOKEN = process.env.SEED_TOKEN || env.SEED_TOKEN;

if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('GMAIL_USER + GMAIL_APP_PASSWORD must be in .env');
  process.exit(1);
}
if (!SEED_TOKEN) {
  console.error('SEED_TOKEN env var or .env entry required');
  process.exit(1);
}

const CRM_URL = 'https://crm.crownmediagroup.co';
const REHOBOTH_ID = 1;  // resolved via CRM lookup if needed
const REHOBOTH_EMAIL = 'admin@rehoboth-baptist.com';
const PDF_PATH = join(__dirname, 'leave-behinds', 'rehoboth-baptist-free-project-offer.pdf');

if (!existsSync(PDF_PATH)) {
  console.error('PDF missing at', PDF_PATH);
  process.exit(1);
}

// Lookup Rehoboth's actual CRM id (in case 1 is wrong)
const churchesResp = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${SEED_TOKEN}&limit=2000`);
const churchesData = await churchesResp.json();
const rehoboth = (churchesData.churches || []).find(c =>
  (c.email || '').toLowerCase().trim() === REHOBOTH_EMAIL ||
  /rehoboth/i.test(c.name || '')
);

if (!rehoboth) {
  console.error('Rehoboth not found in CRM');
  process.exit(1);
}

console.log('Target: id=' + rehoboth.id + ' ' + rehoboth.name + ' <' + rehoboth.email + '>');

// Email body — matches the Gmail draft tone
const subject = 'Re: Helping Rehoboth Baptist Church reach more people online';
const body = `Thank you for taking the time to forward it — I really appreciate it. No pressure at all on timing.

To make it easier for whoever decides at Rehoboth, I've attached a one-page summary of what I'd love to offer. The short version:

— I'm David King, faith-aligned marketing and media, based here in Columbia (29229). Crown Media Group.
— What I'd do for free, no commitment: one short reel (60-90 seconds) for Rehoboth from a recent service or vision piece — edited, captioned, hashtag-optimized, ready to post. You see the engagement firsthand before any conversation about ongoing work.
— Why free: I believe in giving first. If the result helps Rehoboth reach more people, we can talk. If it doesn't, you keep the video and we go our ways.

Attached: a one-page summary you can pass to Dr. Thigpen (or whoever you forward to).

Whenever you have an answer — whether it's yes, no, or "not now" — I'll respect it. king@crownmediagroup.co or (908) 848-1436.

Praying for fruitful ministry at Rehoboth,

King
David King
Founder, Crown Media Group
crownmediagroup.co
`;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD.replace(/\s/g, '') },
});

console.log('Verifying SMTP...');
await transporter.verify();
console.log('SMTP OK. Sending...');

const info = await transporter.sendMail({
  from: `"David King — Crown Media Group" <${GMAIL_USER}>`,
  to: REHOBOTH_EMAIL,
  subject,
  text: body,
  attachments: [{
    filename: 'rehoboth-baptist-free-project-offer.pdf',
    path: PDF_PATH,
  }],
});

console.log('SENT. messageId:', info.messageId);

// PATCH CRM record — append note
const patchResp = await fetch(`${CRM_URL}/api/kingdom-reach/churches/${rehoboth.id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: SEED_TOKEN,
    follow_up_sent: 1,
    follow_up_sent_at: new Date().toISOString(),
    notes: ` [TOUCH-3 SENT ${new Date().toISOString()} — personalized PDF attached, msgId=${info.messageId.slice(0,40)}]`,
  }),
});
const patchResult = await patchResp.json();
console.log('CRM marked:', patchResult.ok ? 'OK' : 'FAILED ' + JSON.stringify(patchResult));
