// _pitch-pdf-builder.mjs — Netlify-side reusable pitch-PDF generator.
// Mirrors Agency/ops/outreach/build-pitch-pdf.mjs for use inside scheduled functions.
// Returns Uint8Array bytes (no filesystem writes inside Netlify functions).

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Brand colors
const NAVY       = rgb(0.10, 0.10, 0.24);
const GOLD       = rgb(0.79, 0.60, 0.10);
const GOLD_LIGHT = rgb(0.91, 0.72, 0.20);
const DARK       = rgb(0.10, 0.10, 0.18);
const MID        = rgb(0.40, 0.40, 0.55);
const WHITE      = rgb(1, 1, 1);
const OFFER_BG   = rgb(0.97, 0.96, 0.92);

const PAGE_W = 612, PAGE_H = 792;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - (2 * MARGIN_X);
const BULLET_INDENT = 18;
const BULLET_TEXT_X = MARGIN_X + BULLET_INDENT;
const BULLET_TEXT_W = CONTENT_W - BULLET_INDENT;

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function firstNameFrom(pastor) {
  if (!pastor) return 'Friend';
  const cleaned = String(pastor).replace(/^(dr\.?|rev\.?|pastor|fr\.?|sr\.?|brother|sister|deacon|elder|bishop|mr\.?|mrs\.?|ms\.?)\s+/i, '');
  const first = cleaned.split(/[\s(]/)[0];
  if (!first) return 'Friend';
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

function pickHeadline(church) {
  const ot = (church.org_type || 'church').toLowerCase();
  if (ot === 'school') return `An offering for ${church.name}`;
  if (['nonprofit','missions','recovery','prison','men','women','mixed','network','media','youth'].includes(ot)) {
    return `An offering for ${church.name}'s mission`;
  }
  return `An offering for ${church.name}`;
}

function pickSubhead(church) {
  const ot = (church.org_type || 'church').toLowerCase();
  if (ot === 'school') return `to help more families discover what you're building`;
  return '';
}

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

function fitHeadline(headline, fontBold, maxWidth) {
  for (const s of [26, 24, 22, 20, 18, 17, 16]) {
    if (fontBold.widthOfTextAtSize(headline, s) <= maxWidth) return s;
  }
  return 16;
}

/**
 * Builds a personalized pitch PDF and returns its bytes.
 * Aborts with throw if guards fail (unsubscribed, no email, no name).
 * @param {object} church — CRM church row
 * @returns {Promise<{bytes: Uint8Array, filename: string}>}
 */
export async function buildPitchPdfBytes(church) {
  if (church.unsubscribed === 1 || church.unsubscribed === true) {
    throw new Error(`ABORT: church id=${church.id} is unsubscribed`);
  }
  if (!church.email || !String(church.email).trim()) {
    throw new Error(`ABORT: church id=${church.id} has no email`);
  }
  if (!church.name || !String(church.name).trim()) {
    throw new Error(`ABORT: church id=${church.id} has no name`);
  }

  const id        = church.id;
  const name      = String(church.name).trim();
  const firstName = firstNameFrom(church.pastor);
  const orgType   = (church.org_type || 'church').toLowerCase();
  const headline  = pickHeadline(church);
  const subhead   = pickSubhead(church);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Crown Media Group — offering for ${name}`);
  pdf.setSubject(`Crown Media Group pitch for ${name} (church_id=${id})`);
  pdf.setAuthor('David King, Crown Media Group');
  pdf.setProducer('Crown Media Group — Kingdom Reach');
  pdf.setCreator(`_pitch-pdf-builder.mjs church_id=${id}`);
  pdf.setKeywords([`church_id=${id}`, `crown-media-group`]);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItal = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Header
  page.drawRectangle({ x: 0, y: 720, width: PAGE_W, height: 72, color: NAVY });
  page.drawRectangle({ x: 0, y: 716, width: PAGE_W, height: 4,  color: GOLD });
  page.drawText('CROWN MEDIA GROUP', { x: MARGIN_X, y: 760, size: 14, font: fontBold, color: GOLD_LIGHT });
  page.drawText('Faith-aligned marketing & media — Columbia, SC', { x: MARGIN_X, y: 740, size: 10, font, color: WHITE });
  const urlText = 'crownmediagroup.co';
  const emailText = 'king@crownmediagroup.co';
  page.drawText(urlText,   { x: PAGE_W - MARGIN_X - font.widthOfTextAtSize(urlText, 10),   y: 760, size: 10, font, color: WHITE });
  page.drawText(emailText, { x: PAGE_W - MARGIN_X - font.widthOfTextAtSize(emailText, 10), y: 740, size: 10, font, color: WHITE });

  // Headline
  let y = 680;
  page.drawText('A free offering for', { x: MARGIN_X, y, size: 12, font, color: MID });
  y -= 30;
  page.drawText(headline, { x: MARGIN_X, y, size: fitHeadline(headline, fontBold, CONTENT_W), font: fontBold, color: NAVY });
  if (subhead) { y -= 22; page.drawText(subhead, { x: MARGIN_X, y, size: 11, font: fontItal, color: MID }); }
  y -= 14;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 2, color: GOLD });

  // Greeting + opener
  y -= 28;
  page.drawText(`${firstName},`, { x: MARGIN_X, y, size: 12, font: fontBold, color: DARK });
  y -= 22;
  const orgTypeLine = (orgType === 'school')
    ? `I'm David King — faith-aligned marketing and media, born and raised in the Columbia area (29229). I'd love to serve ${name}.`
    : (['nonprofit','missions','recovery','prison','men','women','mixed','network','media','youth'].includes(orgType))
      ? `I'm David King — faith-aligned marketing and media, born and raised in the Columbia area (29229). I'd love to come alongside ${name}'s mission.`
      : `I'm David King — faith-aligned marketing and media, born and raised in the Columbia area (29229). I'd love to serve ${name}.`;
  for (const line of wrap(orgTypeLine, font, 11, CONTENT_W)) {
    page.drawText(line, { x: MARGIN_X, y, size: 11, font, color: DARK }); y -= 16;
  }

  // What we offer
  y -= 14;
  page.drawText(`What Crown Media Group can build for ${name}:`, { x: MARGIN_X, y, size: 11, font: fontBold, color: NAVY });
  y -= 20;
  const offerings = [
    'AI-powered video reels — 60-90s, edited, captioned, optimized for Instagram, Facebook, YouTube',
    'Custom website builds — full rebuild or a fresh landing page',
    'Social media management — content calendar, scheduling, growth',
    'Brand identity — logo, color palette, voice',
    "Kingdom Sound — royalty-free music for your videos that won't get taken down",
  ];
  for (const text of offerings) {
    const lines = wrap(text, font, 10, BULLET_TEXT_W);
    page.drawCircle({ x: MARGIN_X + 6, y: y + 3, size: 2, color: GOLD });
    for (const line of lines) { page.drawText(line, { x: BULLET_TEXT_X, y, size: 10, font, color: DARK }); y -= 14; }
    y -= 3;
  }

  // Free options box
  y -= 8;
  const freeOptions = [
    'A free 60-90 second video reel — pulled from your most recent service or vision',
    'A free sample landing page mockup for your ministry',
    'A free social media audit + 30-day content plan',
    'Or something else we offer that would actually serve you — you pick, we build',
  ];
  const freeOptionLineCount = freeOptions.reduce((sum, t) => sum + wrap(t, font, 10, BULLET_TEXT_W - 8).length, 0);
  const boxHeight = 16 + 22 + (freeOptionLineCount * 14) + ((freeOptions.length - 1) * 3) + 16;
  const boxTop = y;
  page.drawRectangle({ x: MARGIN_X, y: boxTop - boxHeight, width: CONTENT_W, height: boxHeight, color: OFFER_BG, borderColor: GOLD, borderWidth: 1.5 });
  y = boxTop - 22;
  page.drawText('Pick anything below — we build it free. No strings.', { x: MARGIN_X + 14, y, size: 12, font: fontBold, color: NAVY });
  y -= 20;
  for (const text of freeOptions) {
    const lines = wrap(text, font, 10, BULLET_TEXT_W - 8);
    page.drawCircle({ x: MARGIN_X + 20, y: y + 3, size: 2, color: GOLD });
    for (const line of lines) { page.drawText(line, { x: MARGIN_X + 30, y, size: 10, font, color: DARK }); y -= 14; }
    y -= 3;
  }
  y = boxTop - boxHeight - 16;

  // Why free
  page.drawText('Why free:', { x: MARGIN_X, y, size: 11, font: fontBold, color: NAVY });
  y -= 18;
  for (const line of wrap(`We give first. Kingdom economy (Luke 6:38). If it serves ${name}, we talk. If not, you keep the work — no obligation.`, font, 10, CONTENT_W)) {
    page.drawText(line, { x: MARGIN_X, y, size: 10, font, color: MID }); y -= 14;
  }

  // CTA bar
  const CTA_TOP = 158, CTA_HEIGHT = 60;
  page.drawRectangle({ x: MARGIN_X, y: CTA_TOP - CTA_HEIGHT, width: CONTENT_W, height: CTA_HEIGHT, color: NAVY });
  page.drawText("If anything resonates — we'd love to partner with you:", { x: MARGIN_X + 16, y: CTA_TOP - 22, size: 11, font: fontBold, color: GOLD_LIGHT });
  page.drawText('Call (908) 848-1436   |   Email king@crownmediagroup.co', { x: MARGIN_X + 16, y: CTA_TOP - 44, size: 11, font, color: WHITE });

  // Footer
  page.drawText("In Christ's service,", { x: MARGIN_X, y: 76, size: 11, font: fontItal, color: MID });
  page.drawText('David King', { x: MARGIN_X, y: 58, size: 14, font: fontBold, color: NAVY });
  page.drawText('Founder, Crown Media Group  |  Columbia, SC  |  All Glory to Jesus Global LLC', { x: MARGIN_X, y: 42, size: 9, font, color: MID });
  page.drawText(`Doc ID: pitch-${id}-${slugify(name)}`, { x: MARGIN_X, y: 18, size: 7, font, color: MID });
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 8, color: GOLD });

  const bytes = await pdf.save();
  const filename = `pitch-${id}-${slugify(name)}.pdf`;
  return { bytes, filename };
}
