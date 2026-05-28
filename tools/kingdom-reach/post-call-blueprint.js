// tools/kingdom-reach/post-call-blueprint.js
// BB — BLUEPRINT (Agent 5) auto-proposal generator.
// Reads Agency/clients/active/[slug]/call-intel.json + generates a Hormozi-structured
// proposal PDF within 1 hour of King's discovery call.
//
// Usage: SEED_TOKEN=... node tools/kingdom-reach/post-call-blueprint.js <client-slug>

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CLIENTS_DIR = join(REPO_ROOT, 'Agency', 'clients', 'active');

// Brand
const NAVY  = rgb(0.10, 0.10, 0.24);
const GOLD  = rgb(0.79, 0.60, 0.10);
const DARK  = rgb(0.10, 0.10, 0.18);
const MID   = rgb(0.40, 0.40, 0.55);
const WHITE = rgb(1, 1, 1);
const SOFT  = rgb(0.97, 0.96, 0.92);
const GOLD_LIGHT = rgb(0.91, 0.72, 0.20);

const PAGE_W = 612, PAGE_H = 792;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - (2 * MARGIN_X);

function wrap(text, font, fontSize, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) current = test;
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines;
}

const TIER_DETAILS = {
  starter: { monthly: 497, label: 'Starter' },
  growth:  { monthly: 1497, label: 'Growth' },
  premium: { monthly: 2497, label: 'Premium' },
};

function valueStackForTier(tier) {
  if (tier === 'premium') return [
    { item: 'GBP optimization + weekly post', value: 500 },
    { item: 'Daily social management (3 platforms)', value: 1800 },
    { item: '4 video reels/month — edited + captioned', value: 2000 },
    { item: 'Monthly email newsletter + automation', value: 600 },
    { item: 'Sermon/product clip pipeline', value: 1200 },
    { item: 'Paid ads management (you set spend)', value: 1500 },
    { item: 'Monthly strategy call + priority support', value: 400 },
  ];
  if (tier === 'growth') return [
    { item: 'GBP optimization + weekly post', value: 500 },
    { item: '7 social posts/wk (1 platform main + 1 echo)', value: 1100 },
    { item: '1 video reel/wk — edited + captioned', value: 500 },
    { item: 'Monthly email newsletter', value: 300 },
    { item: 'SEO maintenance + schema markup', value: 400 },
    { item: 'Quarterly strategy call', value: 250 },
  ];
  return [
    { item: 'GBP optimization + weekly post', value: 500 },
    { item: '4 social posts/wk (1 platform)', value: 600 },
    { item: 'Monthly analytics summary', value: 200 },
    { item: 'Email + Slack support', value: 150 },
  ];
}

async function build(slug) {
  const clientDir = join(CLIENTS_DIR, slug);
  if (!existsSync(clientDir)) throw new Error(`Client folder not found: ${clientDir}. Run onboard.js first.`);

  const intelPath = join(clientDir, 'call-intel.json');
  if (!existsSync(intelPath)) throw new Error(`call-intel.json missing in ${clientDir}. Create it with prospect details from the call.`);

  const intel = JSON.parse(readFileSync(intelPath, 'utf8'));
  const tier = (intel.recommended_tier || 'growth').toLowerCase();
  const tierInfo = TIER_DETAILS[tier] || TIER_DETAILS.growth;
  const valueStack = valueStackForTier(tier);
  const totalValue = valueStack.reduce((acc, x) => acc + x.value, 0);
  const monthlyPrice = tierInfo.monthly;
  const annualSavings = (totalValue * 12) - (monthlyPrice * 12);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Proposal — ${intel.name}`);
  pdf.setSubject(`Crown Media Group proposal for ${intel.name}`);
  pdf.setAuthor('David King · Crown Media Group');

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItal = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Header
  page.drawRectangle({ x: 0, y: 720, width: PAGE_W, height: 72, color: NAVY });
  page.drawRectangle({ x: 0, y: 716, width: PAGE_W, height: 4, color: GOLD });
  page.drawText('CROWN MEDIA GROUP', { x: MARGIN_X, y: 760, size: 14, font: fontBold, color: GOLD_LIGHT });
  page.drawText('Personalized proposal — built for you', { x: MARGIN_X, y: 740, size: 10, font, color: WHITE });

  // Headline — Dream Outcome
  let y = 680;
  page.drawText('Personalized proposal for', { x: MARGIN_X, y, size: 11, font, color: MID });
  y -= 28;
  const headline = intel.name.length > 32 ? intel.name : intel.name;
  const headlineSize = headline.length > 28 ? 22 : 26;
  page.drawText(headline, { x: MARGIN_X, y, size: headlineSize, font: fontBold, color: NAVY });
  y -= 16;
  page.drawText(`${tierInfo.label} tier · $${monthlyPrice}/month`, { x: MARGIN_X, y, size: 12, font: fontItal, color: GOLD });
  y -= 14;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 2, color: GOLD });
  y -= 22;

  // What we discussed
  page.drawText('What we discussed:', { x: MARGIN_X, y, size: 11, font: fontBold, color: NAVY });
  y -= 16;
  if (intel.pain_points && intel.pain_points.length) {
    for (const pp of intel.pain_points.slice(0, 3)) {
      const lines = wrap('• ' + pp, font, 10, CONTENT_W - 16);
      for (const l of lines) { page.drawText(l, { x: MARGIN_X + 8, y, size: 10, font, color: DARK }); y -= 13; }
    }
  }
  y -= 8;

  // Value stack
  page.drawText('Here\'s the full stack you get every month:', { x: MARGIN_X, y, size: 11, font: fontBold, color: NAVY });
  y -= 18;
  for (const item of valueStack) {
    page.drawCircle({ x: MARGIN_X + 6, y: y + 3, size: 2, color: GOLD });
    page.drawText(item.item, { x: MARGIN_X + 18, y, size: 10, font, color: DARK });
    const valueText = `$${item.value} value`;
    const valueW = fontBold.widthOfTextAtSize(valueText, 10);
    page.drawText(valueText, { x: PAGE_W - MARGIN_X - valueW, y, size: 10, font: fontBold, color: GOLD });
    y -= 16;
  }
  y -= 4;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 1, color: GOLD });
  y -= 12;
  const totalLine = `Total stack value: $${totalValue}/mo · Your price: $${monthlyPrice}/mo · Save $${(totalValue - monthlyPrice).toLocaleString()}/mo`;
  const totalW = fontBold.widthOfTextAtSize(totalLine, 11);
  page.drawText(totalLine, { x: MARGIN_X + (CONTENT_W - totalW) / 2, y, size: 11, font: fontBold, color: NAVY });
  y -= 22;

  // Risk reversal
  page.drawRectangle({ x: MARGIN_X, y: y - 56, width: CONTENT_W, height: 56, color: SOFT, borderColor: GOLD, borderWidth: 0.5 });
  page.drawText('Risk reversal:', { x: MARGIN_X + 14, y: y - 18, size: 11, font: fontBold, color: NAVY });
  const riskLines = wrap('Month-to-month. No annual contract. If we don\'t deliver what we discussed in the first 30 days, you walk and keep everything we made.', font, 10, CONTENT_W - 28);
  let ry = y - 32;
  for (const l of riskLines) { page.drawText(l, { x: MARGIN_X + 14, y: ry, size: 10, font, color: DARK }); ry -= 13; }
  y -= 72;

  // CTA bar (fixed near bottom)
  const CTA_TOP = 140;
  page.drawRectangle({ x: MARGIN_X, y: CTA_TOP - 60, width: CONTENT_W, height: 60, color: NAVY });
  page.drawText('Next step — reply with "yes" and I send the contract today:', { x: MARGIN_X + 14, y: CTA_TOP - 22, size: 11, font: fontBold, color: GOLD_LIGHT });
  page.drawText(`Call (908) 848-1436   |   king@crownmediagroup.co`, { x: MARGIN_X + 14, y: CTA_TOP - 44, size: 11, font, color: WHITE });

  // Footer
  page.drawText('In Christ\'s service,', { x: MARGIN_X, y: 64, size: 11, font: fontItal, color: MID });
  page.drawText('David King', { x: MARGIN_X, y: 46, size: 13, font: fontBold, color: NAVY });
  page.drawText(`Crown Media Group · Doc ID: proposal-${slug}-${Date.now()}`, { x: MARGIN_X, y: 26, size: 8, font, color: MID });
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 8, color: GOLD });

  // Save
  const filename = `proposal-v1.pdf`;
  const outPath = join(clientDir, filename);
  const bytes = await pdf.save();
  writeFileSync(outPath, bytes);

  try {
    appendEvent({
      agent: 'BLUEPRINT',
      entity_type: 'client',
      entity_id: slug,
      action: 'proposal_generated',
      fields: { tier, monthly: monthlyPrice, total_stack_value: totalValue, path: outPath },
      source: 'post-call-blueprint.js',
    });
    emit({
      agent: 'BLUEPRINT',
      severity: 'P1',
      action: `🎯 Proposal ready for ${intel.name}`,
      detail: `${tier} tier · $${monthlyPrice}/mo · ${outPath.replace(REPO_ROOT,'')}`,
      next: 'Review PDF + Gmail draft + send within 1 hour of call (Iannarino momentum rule)',
    });
  } catch {}

  return { path: outPath, monthly: monthlyPrice, totalValue, tier };
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('post-call-blueprint.js') || argv1.endsWith('post-call-blueprint.mjs')) {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node tools/kingdom-reach/post-call-blueprint.js <client-slug>');
    console.error('First ensure Agency/clients/active/<slug>/call-intel.json exists with {name, pain_points[], recommended_tier}.');
    process.exit(1);
  }
  try {
    const result = await build(slug);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
}

export { build };
