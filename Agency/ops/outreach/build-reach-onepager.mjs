#!/usr/bin/env node
// build-reach-onepager.mjs — Crown Media Group reach summary PDF for discovery calls
// Shows King's current footprint: CRM size, outreach volume, active conversations.
// One-page navy + gold leave-behind, designed to drop into a discovery call as social proof.
//
// Usage: SEED_TOKEN=... node Agency/ops/outreach/build-reach-onepager.mjs

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.SEED_TOKEN;
if (!TOKEN) { console.error('SEED_TOKEN env var not set'); process.exit(1); }

const CRM_URL = 'https://crm.crownmediagroup.co';
const OUT_DIR = join(__dirname, 'leave-behinds');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const NAVY       = rgb(0.10, 0.10, 0.24);
const GOLD       = rgb(0.79, 0.60, 0.10);
const GOLD_LIGHT = rgb(0.91, 0.72, 0.20);
const DARK       = rgb(0.10, 0.10, 0.18);
const MID        = rgb(0.40, 0.40, 0.55);
const WHITE      = rgb(1, 1, 1);
const SOFT_BG    = rgb(0.97, 0.96, 0.92);

const PAGE_W = 612, PAGE_H = 792;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - (2 * MARGIN_X);

async function fetchStats() {
  // Total counts
  const churchesR = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=2000`);
  const churchesData = await churchesR.json();
  const churches = churchesData.churches || [];

  const total = churches.length;
  const withEmail = churches.filter(c => c.email && c.email.includes('@')).length;
  const sent = churches.filter(c => c.email_sent === 1).length;
  const opened = churches.filter(c => c.email_opened === 1).length;
  const followedUp = churches.filter(c => c.follow_up_sent === 1).length;
  const replied = churches.filter(c => c.replied === 1).length;
  const pitched = churches.filter(c => (c.status || '').toLowerCase() === 'pitched').length;
  const unsubscribed = churches.filter(c => c.unsubscribed === 1).length;
  const bounced = churches.filter(c => c.email_bounced === 1).length;

  // City coverage
  const cities = new Set();
  for (const c of churches) {
    if (c.city) cities.add(c.city.trim());
  }

  // Org types
  const orgTypes = {};
  for (const c of churches) {
    const t = c.org_type || 'church';
    orgTypes[t] = (orgTypes[t] || 0) + 1;
  }

  return { total, withEmail, sent, opened, followedUp, replied, pitched, unsubscribed, bounced, cities: cities.size, orgTypes };
}

const stats = await fetchStats();

const pdf = await PDFDocument.create();
pdf.setTitle('Crown Media Group — Current Reach (2026-05-22)');
pdf.setSubject('Crown Media Group reach summary for discovery calls');
pdf.setAuthor('David King, Crown Media Group');

const page = pdf.addPage([PAGE_W, PAGE_H]);
const font     = await pdf.embedFont(StandardFonts.Helvetica);
const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
const fontItal = await pdf.embedFont(StandardFonts.HelveticaOblique);

// HEADER
page.drawRectangle({ x: 0, y: 720, width: PAGE_W, height: 72, color: NAVY });
page.drawRectangle({ x: 0, y: 716, width: PAGE_W, height: 4,  color: GOLD });
page.drawText('CROWN MEDIA GROUP', { x: MARGIN_X, y: 760, size: 14, font: fontBold, color: GOLD_LIGHT });
page.drawText('Current Reach — Columbia, SC + Pee Dee Region', { x: MARGIN_X, y: 740, size: 10, font, color: WHITE });
const dateText = 'May 2026';
page.drawText(dateText, { x: PAGE_W - MARGIN_X - font.widthOfTextAtSize(dateText, 11), y: 750, size: 11, font, color: GOLD_LIGHT });

// TITLE
let y = 680;
page.drawText('Where we are today', { x: MARGIN_X, y, size: 12, font, color: MID });
y -= 30;
page.drawText('A faith-aligned marketing engine,', { x: MARGIN_X, y, size: 22, font: fontBold, color: NAVY });
y -= 26;
page.drawText('serving Columbia\'s Kingdom community.', { x: MARGIN_X, y, size: 22, font: fontBold, color: NAVY });

y -= 18;
page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 2, color: GOLD });

// KEY STATS (3 large numbers in a row)
y -= 40;
const STAT_W = CONTENT_W / 3;
const drawStat = (x, big, label) => {
  page.drawText(String(big), { x, y, size: 36, font: fontBold, color: NAVY });
  page.drawText(label, { x, y: y - 18, size: 9, font, color: MID });
};
drawStat(MARGIN_X,                 stats.total,      'organizations in our CRM');
drawStat(MARGIN_X + STAT_W,        stats.sent,       'personalized outreach sent');
drawStat(MARGIN_X + STAT_W * 2,    stats.replied + (stats.opened - stats.replied >= 0 ? stats.opened : 0), 'active engagement signals');

y -= 60;

// FUNNEL SECTION
page.drawText('The funnel, end to end', { x: MARGIN_X, y, size: 13, font: fontBold, color: NAVY });
y -= 6;
page.drawRectangle({ x: MARGIN_X, y, width: 80, height: 2, color: GOLD });
y -= 22;

const funnel = [
  { label: 'Records in CRM (every faith-based org we serve)', value: stats.total },
  { label: 'Valid email captured', value: stats.withEmail },
  { label: 'Personalized outreach sent (Touch-1 + follow-up + pitch PDF)', value: stats.sent },
  { label: 'Opened (warm signal)', value: stats.opened },
  { label: 'Follow-up touchpoint sent', value: stats.followedUp },
  { label: 'Personalized pitch PDF delivered', value: stats.pitched },
  { label: 'Active conversations (replied)', value: stats.replied },
];

for (const row of funnel) {
  page.drawText(row.label, { x: MARGIN_X + 4, y, size: 10, font, color: DARK });
  const valStr = String(row.value);
  page.drawText(valStr, { x: PAGE_W - MARGIN_X - fontBold.widthOfTextAtSize(valStr, 11), y, size: 11, font: fontBold, color: NAVY });
  y -= 18;
}

// HOW WE OPERATE
y -= 20;
page.drawText('How we operate', { x: MARGIN_X, y, size: 13, font: fontBold, color: NAVY });
y -= 6;
page.drawRectangle({ x: MARGIN_X, y, width: 80, height: 2, color: GOLD });
y -= 22;

const operations = [
  '24/7 automated outreach cadence with built-in safety brakes',
  'Single-record PDF generation — zero cross-contamination by design',
  'Auto-bounce + auto-unsubscribe handling (no recipient ever gets emailed twice in error)',
  'Live inbox scanning every 6 hours — replies surfaced in real time',
  'Auto-pause if reply rate or bounce rate crosses safety thresholds',
];
for (const line of operations) {
  page.drawCircle({ x: MARGIN_X + 6, y: y + 3, size: 2, color: GOLD });
  page.drawText(line, { x: MARGIN_X + 16, y, size: 10, font, color: DARK });
  y -= 16;
}

// COVERAGE BOX
y -= 16;
const boxTop = y;
const boxH = 64;
page.drawRectangle({ x: MARGIN_X, y: boxTop - boxH, width: CONTENT_W, height: boxH, color: SOFT_BG, borderColor: GOLD, borderWidth: 1.5 });
y = boxTop - 22;
page.drawText('Geographic & ministry coverage', { x: MARGIN_X + 14, y, size: 11, font: fontBold, color: NAVY });
y -= 18;
const summary = `${stats.cities}+ cities across the Midlands and Pee Dee. ${stats.total} organizations total — churches, schools, missions, recovery ministries, nonprofits, and youth orgs.`;
const wrapText = (text, max) => {
  const words = text.split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(t, 10) <= max) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
};
for (const line of wrapText(summary, CONTENT_W - 28)) {
  page.drawText(line, { x: MARGIN_X + 14, y, size: 10, font, color: DARK });
  y -= 14;
}

// CTA BAR
const CTA_TOP = 130;
const CTA_H = 60;
page.drawRectangle({ x: MARGIN_X, y: CTA_TOP - CTA_H, width: CONTENT_W, height: CTA_H, color: NAVY });
page.drawText("If anything we do would serve your ministry — let's talk:", { x: MARGIN_X + 16, y: CTA_TOP - 22, size: 11, font: fontBold, color: GOLD_LIGHT });
page.drawText('Call (908) 848-1436   |   Email king@crownmediagroup.co', { x: MARGIN_X + 16, y: CTA_TOP - 44, size: 11, font, color: WHITE });

// FOOTER
page.drawText("In Christ's service,", { x: MARGIN_X, y: 50, size: 11, font: fontItal, color: MID });
page.drawText('David King', { x: MARGIN_X, y: 32, size: 13, font: fontBold, color: NAVY });
page.drawText('Founder, Crown Media Group  |  Columbia, SC  |  All Glory to Jesus Global LLC', { x: MARGIN_X, y: 18, size: 8, font, color: MID });
page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 8, color: GOLD });

const out = join(OUT_DIR, `crown-media-reach-${new Date().toISOString().slice(0,10)}.pdf`);
const bytes = await pdf.save();
writeFileSync(out, bytes);
console.log('Built:', out);
console.log('Size:', (bytes.length / 1024).toFixed(1) + ' KB');
console.log('');
console.log('Stats captured:');
console.log('  Total orgs:        ', stats.total);
console.log('  With email:        ', stats.withEmail);
console.log('  Emails sent:       ', stats.sent);
console.log('  Opens:             ', stats.opened);
console.log('  Pitched:           ', stats.pitched);
console.log('  Active replies:    ', stats.replied);
console.log('  Cities covered:    ', stats.cities);
