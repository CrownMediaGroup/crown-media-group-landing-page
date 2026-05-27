// tools/kingdom-reach/gbp-audit.js
// GBP (Google Business Profile) audit generator — fires when a prospect replies "GBP"
// to the Touch-3 breakup_warm gift offer. Produces a 1-page PDF audit with concrete
// recommendations.
//
// Usage: SEED_TOKEN=... node tools/kingdom-reach/gbp-audit.js <churchId>

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.SEED_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const CRM_URL = 'https://crm.crownmediagroup.co';
const OUT_DIR = join(__dirname, '..', '..', 'Agency', 'ops', 'outreach', 'gbp-audits');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Brand colors (match pitch PDF)
const NAVY  = rgb(0.10, 0.10, 0.24);
const GOLD  = rgb(0.79, 0.60, 0.10);
const DARK  = rgb(0.10, 0.10, 0.18);
const MID   = rgb(0.40, 0.40, 0.55);
const WHITE = rgb(1, 1, 1);
const SOFT  = rgb(0.97, 0.96, 0.92);

const PAGE_W = 612, PAGE_H = 792;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - (2 * MARGIN_X);

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
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

async function fetchChurch(id) {
  const resp = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=2000`);
  const data = await resp.json();
  const match = (data.churches || []).find(c => String(c.id) === String(id));
  if (!match) throw new Error(`No church with id=${id}`);
  return match;
}

// Use Gemini to draft 5 concrete recommendations tailored to this church.
// Falls back to generic recommendations if Gemini unavailable.
async function generateRecommendations(church) {
  if (!GEMINI_KEY) {
    return [
      { title: 'Claim and verify your Google Business Profile', body: 'If not already claimed, go to business.google.com → search for ' + church.name + ' → verify ownership via postcard or phone. Without verification, you cannot edit info, respond to reviews, or post updates.' },
      { title: 'Pick the right primary category', body: 'For ' + (church.org_type === 'school' ? 'a school' : 'a church') + ', the most discoverable categories are: Place of Worship, Religious Organization, Church (or for school: Private School / Christian School). Don\'t guess — choose the most specific accurate match.' },
      { title: 'Service hours + service times', body: 'Sunday service times in your description and as a "Service" listing. Families searching at 9 AM Sunday for "church near me" filter by Open Now — wrong hours = invisible.' },
      { title: 'Photos (8-12 minimum)', body: 'Exterior, interior sanctuary, lobby, parking, kids area, pastor headshot, congregation, worship. Photos increase profile clicks 2x per Google\'s own data.' },
      { title: 'Weekly post', body: 'Google Business Profile lets you post like a mini social feed — service announcements, scripture, events. Posts older than 7 days lose visibility. One post per week minimum keeps your profile "active" in Google\'s eyes.' },
    ];
  }

  try {
    const ai = new GoogleGenerativeAI(GEMINI_KEY);
    const model = ai.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction: `You are a Google Business Profile (GBP) audit expert for Crown Media Group, a faith-aligned marketing agency in Columbia SC. You write concrete, specific recommendations — never generic advice. Output ONLY a JSON array of 5 objects with keys "title" (under 60 chars) and "body" (1-2 sentences, specific to this church/org). No preamble, no markdown fences.`,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1500, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    });
    const ctx = `Name: ${church.name}\nType: ${church.org_type || 'church'}\nCity: ${church.city || 'Columbia, SC'}\nWebsite: ${church.website || '(none)'}\nHas pastor named: ${church.pastor || '(none)'}\n\nGenerate 5 GBP audit recommendations specifically tailored to this org.`;
    const result = await model.generateContent(ctx);
    const text = (result.response.text() || '').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length >= 3) return parsed.slice(0, 5);
  } catch (e) {
    console.warn('[Gemini recommendations failed, using fallback]', e.message);
  }
  return [
    { title: 'Verify ownership', body: 'Claim ' + church.name + ' at business.google.com.' },
    { title: 'Pick the right category', body: 'Place of Worship + Religious Organization.' },
    { title: 'Hours + service times', body: 'List exact Sunday + weekday hours.' },
    { title: '8-12 photos minimum', body: 'Exterior, interior, lobby, parking, kids, worship.' },
    { title: 'Weekly post cadence', body: 'One post per week to stay visible in Google search.' },
  ];
}

async function buildPdf(church, recs) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`GBP Audit — ${church.name}`);
  pdf.setAuthor('David King · Crown Media Group');
  pdf.setSubject(`Free Google Business Profile audit for ${church.name} (church_id=${church.id})`);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItal = await pdf.embedFont(StandardFonts.HelveticaOblique);

  // Header bar
  page.drawRectangle({ x: 0, y: 720, width: PAGE_W, height: 72, color: NAVY });
  page.drawRectangle({ x: 0, y: 716, width: PAGE_W, height: 4, color: GOLD });
  page.drawText('CROWN MEDIA GROUP', { x: MARGIN_X, y: 760, size: 14, font: fontBold, color: rgb(0.91, 0.72, 0.20) });
  page.drawText('Free GBP audit — gift from a Columbia neighbor', { x: MARGIN_X, y: 740, size: 10, font, color: WHITE });

  // Headline
  let y = 680;
  page.drawText('Google Business Profile audit for', { x: MARGIN_X, y, size: 11, font, color: MID });
  y -= 28;
  const headline = church.name.length > 40 ? church.name : church.name;
  const headlineSize = headline.length > 30 ? 20 : 24;
  page.drawText(headline, { x: MARGIN_X, y, size: headlineSize, font: fontBold, color: NAVY });
  y -= 14;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_W, height: 2, color: GOLD });
  y -= 24;

  // Intro
  const first = (church.pastor || '').split(' ')[0] || 'Friend';
  page.drawText(`${first},`, { x: MARGIN_X, y, size: 12, font: fontBold, color: DARK });
  y -= 20;
  const introLines = wrap(`As promised — here are 5 specific things you can do to make ${church.name} easier for families to find on Google. Each takes under 30 minutes. No login required from me — these are yours.`, font, 10, CONTENT_W);
  for (const line of introLines) { page.drawText(line, { x: MARGIN_X, y, size: 10, font, color: DARK }); y -= 14; }
  y -= 8;

  // Recommendations (5 boxed sections)
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const titleLines = wrap(`${i+1}. ${r.title}`, fontBold, 11, CONTENT_W - 16);
    const bodyLines = wrap(r.body, font, 10, CONTENT_W - 16);
    const boxH = 14 + titleLines.length * 14 + bodyLines.length * 13 + 12;
    page.drawRectangle({ x: MARGIN_X, y: y - boxH, width: CONTENT_W, height: boxH, color: SOFT, borderColor: GOLD, borderWidth: 0.5 });
    let lineY = y - 18;
    for (const tl of titleLines) { page.drawText(tl, { x: MARGIN_X + 12, y: lineY, size: 11, font: fontBold, color: NAVY }); lineY -= 14; }
    lineY -= 2;
    for (const bl of bodyLines) { page.drawText(bl, { x: MARGIN_X + 12, y: lineY, size: 10, font, color: DARK }); lineY -= 13; }
    y -= boxH + 10;
    if (y < 160) break;  // safety: don't write past CTA bar
  }

  // CTA bar
  const CTA_TOP = 140;
  page.drawRectangle({ x: MARGIN_X, y: CTA_TOP - 56, width: CONTENT_W, height: 56, color: NAVY });
  page.drawText(`If you want help implementing any of these for ${church.name.slice(0, 40)} — free first project.`, {
    x: MARGIN_X + 14, y: CTA_TOP - 22, size: 11, font: fontBold, color: rgb(0.91, 0.72, 0.20),
  });
  page.drawText('Call (908) 848-1436   |   king@crownmediagroup.co   |   crownmediagroup.co/proof.html', {
    x: MARGIN_X + 14, y: CTA_TOP - 42, size: 10, font, color: WHITE,
  });

  // Footer
  page.drawText('In Christ\'s service,', { x: MARGIN_X, y: 64, size: 11, font: fontItal, color: MID });
  page.drawText('David King', { x: MARGIN_X, y: 46, size: 13, font: fontBold, color: NAVY });
  page.drawText(`Crown Media Group · Doc ID: gbp-${church.id}-${slugify(church.name)}`, { x: MARGIN_X, y: 26, size: 8, font, color: MID });

  // Bottom gold bar
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 8, color: GOLD });

  const filename = `gbp-${church.id}-${slugify(church.name)}.pdf`;
  const out = join(OUT_DIR, filename);
  const bytes = await pdf.save();
  writeFileSync(out, bytes);
  return { path: out, filename, size: bytes.length };
}

const id = process.argv[2];
const isMain = (process.argv[1] || '').endsWith('gbp-audit.js');
if (isMain) {
  if (!id) { console.error('Usage: node tools/kingdom-reach/gbp-audit.js <churchId>'); process.exit(1); }
  if (!TOKEN) { console.error('SEED_TOKEN required'); process.exit(1); }
  try {
    const church = await fetchChurch(id);
    const recs = await generateRecommendations(church);
    const out = await buildPdf(church, recs);
    appendEvent({
      agent: 'WHISPER', entity_type: 'church', entity_id: id,
      action: 'gbp_audit_generated',
      fields: { pdf_path: out.path, size_bytes: out.size, recommendations: recs.length },
      source: 'gbp-audit.js',
    });
    emit({
      agent: 'WHISPER', severity: 'P1',
      action: `GBP audit ready for ${church.name}`,
      detail: out.path,
      next: 'Attach to reply and send via Gmail',
    });
    console.log(JSON.stringify({ ok: true, ...out, recommendations_count: recs.length }, null, 2));
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
}

export { generateRecommendations, buildPdf, fetchChurch };
