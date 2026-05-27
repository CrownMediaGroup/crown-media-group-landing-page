#!/usr/bin/env node
// build-pitch-pdf.mjs — single-record personalized pitch PDF generator
// Strict anti-cross-contamination architecture:
//   - One church_id in, one PDF out
//   - PDF metadata embeds church_id (auditable)
//   - Filename includes church_id (auditable)
//   - SHA256 hash returned for downstream verification
//
// Usage: SEED_TOKEN=... node Agency/ops/outreach/build-pitch-pdf.mjs <churchId>

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.SEED_TOKEN;
if (!TOKEN) { console.error('SEED_TOKEN env var not set'); process.exit(1); }

const CRM_URL = 'https://crm.crownmediagroup.co';
const OUT_DIR = join(__dirname, 'leave-behinds');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Brand colors
const NAVY       = rgb(0.10, 0.10, 0.24);
const GOLD       = rgb(0.79, 0.60, 0.10);
const GOLD_LIGHT = rgb(0.91, 0.72, 0.20);
const DARK       = rgb(0.10, 0.10, 0.18);
const MID        = rgb(0.40, 0.40, 0.55);
const WHITE      = rgb(1, 1, 1);
const OFFER_BG   = rgb(0.97, 0.96, 0.92);

// ─── Page geometry ─────────────────────────────────────────────────────────
const PAGE_W = 612, PAGE_H = 792;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - (2 * MARGIN_X);          // 516 px
const BULLET_INDENT = 18;
const BULLET_TEXT_X = MARGIN_X + BULLET_INDENT;     // 66
const BULLET_TEXT_W = CONTENT_W - BULLET_INDENT;    // 498 px

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function firstNameFrom(pastor) {
  if (!pastor) return 'Friend';
  const cleaned = String(pastor).replace(/^(dr\.?|rev\.?|pastor|fr\.?|sr\.?|brother|sister|deacon|elder|bishop|mr\.?|mrs\.?|ms\.?)\s+/i, '');
  const first = cleaned.split(/[\s\(]/)[0];
  if (!first) return 'Friend';
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

function pickHeadline(church) {
  // Grand Slam Dream Outcome — what they GET, framed concretely
  const ot = (church.org_type || 'church').toLowerCase();
  const name = church.name;
  if (ot === 'school') return `Help ${name} reach more families this season`;
  if (['nonprofit','missions','recovery','prison','men','women','mixed','network','media','youth'].includes(ot)) {
    return `Help ${name}'s mission reach more people online`;
  }
  return `Help ${name} reach more families in ${church.city || 'Columbia'}`;
}

function pickSubhead(church) {
  // Time Delay × Effort line — Hormozi value equation
  return `Live in 14 days. Zero effort on your end. Free first project.`;
}

// Word-wrap helper
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

// Auto-shrink headline if too long for content width
function fitHeadline(headline, fontBold, maxWidth) {
  const sizes = [26, 24, 22, 20, 18, 17, 16];
  for (const s of sizes) {
    if (fontBold.widthOfTextAtSize(headline, s) <= maxWidth) return s;
  }
  return 16;
}

async function fetchChurch(id) {
  const url = `${CRM_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=2000`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`CRM fetch failed: HTTP ${resp.status}`);
  const data = await resp.json();
  const match = (data.churches || []).find(c => String(c.id) === String(id));
  if (!match) throw new Error(`No church with id=${id} found in CRM`);
  return match;
}

async function buildPdf(church) {
  // ── ABORT GUARDS ──────────────────────────────────────────────────────────
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
  const city      = String(church.city || 'Columbia').trim();
  const orgType   = (church.org_type || 'church').toLowerCase();
  const headline  = pickHeadline(church);
  const subhead   = pickSubhead(church);

  // ── PDF SETUP ─────────────────────────────────────────────────────────────
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Crown Media Group — offering for ${name}`);
  pdf.setSubject(`Crown Media Group pitch for ${name} (church_id=${id})`);
  pdf.setAuthor('David King, Crown Media Group');
  pdf.setProducer('Crown Media Group — Kingdom Reach');
  pdf.setCreator(`build-pitch-pdf.mjs church_id=${id}`);
  pdf.setKeywords([`church_id=${id}`, `crown-media-group`]);

  const page  = pdf.addPage([PAGE_W, PAGE_H]);
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItal = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // ── HEADER (navy bar + gold accent) ───────────────────────────────────────
  page.drawRectangle({ x: 0, y: 720, width: PAGE_W, height: 72, color: NAVY });
  page.drawRectangle({ x: 0, y: 716, width: PAGE_W, height: 4,  color: GOLD });

  page.drawText('CROWN MEDIA GROUP', { x: MARGIN_X, y: 760, size: 14, font: fontBold, color: GOLD_LIGHT });
  page.drawText('Faith-aligned marketing & media — Columbia, SC', { x: MARGIN_X, y: 740, size: 10, font, color: WHITE });

  // Right-aligned contact in header
  const urlText = 'crownmediagroup.co';
  const emailText = 'king@crownmediagroup.co';
  const urlW = font.widthOfTextAtSize(urlText, 10);
  const emailW = font.widthOfTextAtSize(emailText, 10);
  page.drawText(urlText,   { x: PAGE_W - MARGIN_X - urlW,   y: 760, size: 10, font, color: WHITE });
  page.drawText(emailText, { x: PAGE_W - MARGIN_X - emailW, y: 740, size: 10, font, color: WHITE });

  // ── HEADLINE ──────────────────────────────────────────────────────────────
  let y = 680;
  page.drawText('A free offering for', { x: MARGIN_X, y, size: 12, font, color: MID });

  y -= 30;
  const headlineSize = fitHeadline(headline, fontBold, CONTENT_W);
  page.drawText(headline, { x: MARGIN_X, y, size: headlineSize, font: fontBold, color: NAVY });

  if (subhead) {
    y -= 22;
    page.drawText(subhead, { x: MARGIN_X, y, size: 11, font: fontItal, color: MID });
  }

  // Gold divider
  y -= 14;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 2, color: GOLD });

  // ── GREETING + OPENER ─────────────────────────────────────────────────────
  y -= 28;
  page.drawText(`${firstName},`, { x: MARGIN_X, y, size: 12, font: fontBold, color: DARK });
  y -= 22;

  const orgTypeLine = (orgType === 'school')
    ? `I'm David King — faith-aligned marketing and media, born and raised in the Columbia area (29229). I'd love to serve ${name}.`
    : (['nonprofit','missions','recovery','prison','men','women','mixed','network','media','youth'].includes(orgType))
      ? `I'm David King — faith-aligned marketing and media, born and raised in the Columbia area (29229). I'd love to come alongside ${name}'s mission.`
      : `I'm David King — faith-aligned marketing and media, born and raised in the Columbia area (29229). I'd love to serve ${name}.`;

  for (const line of wrap(orgTypeLine, font, 11, CONTENT_W)) {
    page.drawText(line, { x: MARGIN_X, y, size: 11, font, color: DARK });
    y -= 16;
  }

  // ── VALUE STACK (Hormozi Grand Slam Offer) ───────────────────────────────
  // Each item is paired with its market $ value. Total stack value > $4,000.
  y -= 14;
  page.drawText('What you get — full value stack:', { x: MARGIN_X, y, size: 11, font: fontBold, color: NAVY });
  y -= 20;

  const offerings = [
    { text: 'AI-powered 60-90s video reel — edited, captioned, ready for IG/FB/YouTube', value: '$500 value' },
    { text: 'Custom landing page or full website build — mobile-first, SEO-tuned', value: '$1,500 value' },
    { text: 'Social media management — 1 month content calendar + posts', value: '$800 value' },
    { text: 'Brand identity refresh — logo, color palette, voice guide', value: '$1,200 value' },
    { text: "Kingdom Sound — royalty-free music for your videos (no takedowns)", value: '$300 value' },
  ];
  for (const item of offerings) {
    const lines = wrap(item.text, font, 10, BULLET_TEXT_W - 70);
    // Gold dot aligned with first line of text
    page.drawCircle({ x: MARGIN_X + 6, y: y + 3, size: 2, color: GOLD });
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], { x: BULLET_TEXT_X, y, size: 10, font, color: DARK });
      // $ value on first line only, right-aligned
      if (i === 0) {
        const valueW = fontBold.widthOfTextAtSize(item.value, 10);
        page.drawText(item.value, { x: PAGE_W - MARGIN_X - valueW, y, size: 10, font: fontBold, color: GOLD });
      }
      y -= 14;
    }
    y -= 3;
  }

  // Total value bar
  y -= 4;
  const totalText = 'Total stack value: $4,300+   |   Your cost on first project: $0';
  const totalW = fontBold.widthOfTextAtSize(totalText, 11);
  page.drawText(totalText, { x: MARGIN_X + (CONTENT_W - totalW) / 2, y, size: 11, font: fontBold, color: NAVY });
  y -= 4;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 1, color: GOLD });

  // ── PICK ANYTHING FREE BOX ────────────────────────────────────────────────
  y -= 8;
  // Pre-compute box height based on actual wrapped content
  const freeOptions = [
    'A free 60-90 second video reel — pulled from your most recent service or vision',
    'A free sample landing page mockup for your ministry',
    'A free social media audit + 30-day content plan',
    'Or something else we offer that would actually serve you — you pick, we build',
  ];
  const freeOptionLineCount = freeOptions.reduce((sum, t) => sum + wrap(t, font, 10, BULLET_TEXT_W - 8).length, 0);
  const boxHeight = 16 + 22 + (freeOptionLineCount * 14) + ((freeOptions.length - 1) * 3) + 16;

  // Save y as top-of-box; draw box below it
  const boxTop = y;
  page.drawRectangle({
    x: MARGIN_X, y: boxTop - boxHeight, width: CONTENT_W, height: boxHeight,
    color: OFFER_BG, borderColor: GOLD, borderWidth: 1.5,
  });

  // Header inside box
  y = boxTop - 22;
  page.drawText('Pick anything below — we build it free. No strings.', { x: MARGIN_X + 14, y, size: 12, font: fontBold, color: NAVY });
  y -= 20;

  for (const text of freeOptions) {
    const lines = wrap(text, font, 10, BULLET_TEXT_W - 8);
    page.drawCircle({ x: MARGIN_X + 20, y: y + 3, size: 2, color: GOLD });
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], { x: MARGIN_X + 30, y, size: 10, font, color: DARK });
      y -= 14;
    }
    y -= 3;
  }

  // Move y to just below the box
  y = boxTop - boxHeight - 16;

  // ── RISK REVERSAL + SCARCITY (Hormozi) + FAITH FRAME ─────────────────────
  page.drawText('Why we lead with free:', { x: MARGIN_X, y, size: 11, font: fontBold, color: NAVY });
  y -= 18;
  const whyLine = `Kingdom economy (Luke 6:38). We give first, talk later. If it serves ${name}, we have a conversation. If not, you keep the work — no obligation, no follow-up if you decline.`;
  for (const line of wrap(whyLine, font, 10, CONTENT_W)) {
    page.drawText(line, { x: MARGIN_X, y, size: 10, font, color: MID });
    y -= 14;
  }
  y -= 6;
  // Scarcity line (true) — adds urgency without pressure
  const scarcity = `I take 3 new partners per month. First-come, first-served — but no pressure on timing.`;
  page.drawText(scarcity, { x: MARGIN_X, y, size: 10, font: fontItal, color: GOLD });
  y -= 14;

  // ── CTA BAR (fixed near bottom) ───────────────────────────────────────────
  const CTA_TOP = 158;
  const CTA_HEIGHT = 60;
  page.drawRectangle({ x: MARGIN_X, y: CTA_TOP - CTA_HEIGHT, width: CONTENT_W, height: CTA_HEIGHT, color: NAVY });
  page.drawText("If anything resonates — we'd love to partner with you:", {
    x: MARGIN_X + 16, y: CTA_TOP - 22, size: 11, font: fontBold, color: GOLD_LIGHT,
  });
  page.drawText('Call (908) 848-1436   |   Email king@crownmediagroup.co', {
    x: MARGIN_X + 16, y: CTA_TOP - 44, size: 11, font, color: WHITE,
  });

  // ── FOOTER ────────────────────────────────────────────────────────────────
  page.drawText("In Christ's service,", { x: MARGIN_X, y: 76, size: 11, font: fontItal, color: MID });
  page.drawText('David King', { x: MARGIN_X, y: 58, size: 14, font: fontBold, color: NAVY });
  page.drawText('Founder, Crown Media Group  |  Columbia, SC  |  All Glory to Jesus Global LLC', {
    x: MARGIN_X, y: 42, size: 9, font, color: MID,
  });

  // Audit tag at very bottom
  page.drawText(`Doc ID: pitch-${id}-${slugify(name)}`, {
    x: MARGIN_X, y: 18, size: 7, font, color: MID,
  });

  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 8, color: GOLD });

  // ── SAVE ──────────────────────────────────────────────────────────────────
  const filename = `pitch-${id}-${slugify(name)}.pdf`;
  const out = join(OUT_DIR, filename);
  const bytes = await pdf.save();
  writeFileSync(out, bytes);

  const sha256 = createHash('sha256').update(bytes).digest('hex');

  return {
    id,
    name,
    email: church.email,
    pastor: church.pastor || null,
    city,
    org_type: orgType,
    pdf_path: out,
    pdf_filename: filename,
    sha256_short: sha256.slice(0, 16),
    size_bytes: bytes.length,
  };
}

// ── MAIN ────────────────────────────────────────────────────────────────────
const id = process.argv[2];
if (!id) { console.error('Usage: node build-pitch-pdf.mjs <churchId>'); process.exit(1); }

try {
  const church = await fetchChurch(id);
  const result = await buildPdf(church);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
