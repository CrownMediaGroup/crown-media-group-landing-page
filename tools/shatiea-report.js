/**
 * shatiea-report.js — Monthly Content Delivery Report for Shatiea
 * Crown Media Group | All Glory to Jesus Global LLC
 *
 * Usage:
 *   node tools/shatiea-report.js              # current month
 *   node tools/shatiea-report.js 2026-04      # specific month (YYYY-MM)
 *
 * Generates a branded PDF report and emails to King + Shatiea.
 */

const path = require('path');
const fs   = require('fs');

// Load env
for (const p of [path.join(__dirname, '../.env'), path.join(__dirname, '.env')]) {
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length && !process.env[k.trim()]) {
        process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
      }
    });
  }
}

const ROOT        = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'Agency/ops/content');
const REPORTS_DIR = path.join(ROOT, 'Agency/ops/notes/reports');

const RESEND_KEY  = process.env.RESEND_API_KEY;
const KING_EMAIL  = process.env.FROM_EMAIL || 'king@crownmediagroup.co';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'king@crownmediagroup.co';

// PDFKit — try root first, fall back to CRM node_modules
let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch {
  try {
    PDFDocument = require(path.join(ROOT, 'tools/crm/node_modules/pdfkit'));
  } catch {
    console.error('[Shatiea Report] pdfkit not found. Run: npm install pdfkit');
    process.exit(1);
  }
}

// ── Colors (Shatiea brand) ────────────────────────────────────────────────────
const GREEN = '#059669';
const GOLD  = '#CA8A04';
const DARK  = '#1a1a2e';
const GRAY  = '#6b7280';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMonth() {
  const arg = process.argv[2];
  if (arg && /^\d{4}-\d{2}$/.test(arg)) return arg;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(ym) {
  const [y, m] = ym.split('-');
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// ── Scan content files ────────────────────────────────────────────────────────
function scanContent(month) {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs.readdirSync(CONTENT_DIR)
    .filter(f => f.startsWith(`shatiea-${month}`) && f.endsWith('.md'))
    .sort();
}

function parseContentFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const pieces = [];

  if (/## Instagram Caption/.test(text)) pieces.push('Instagram');
  if (/## Facebook Caption/.test(text))  pieces.push('Facebook');
  if (/## X \/ Twitter Post/.test(text)) pieces.push('X / Twitter');
  if (/## Reel Hook/.test(text))         pieces.push('Reel Script');
  if (/## Email Subject/.test(text))     pieces.push('Email');

  return pieces;
}

// ── Build PDF ─────────────────────────────────────────────────────────────────
function buildPdf(month, files, outPath) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  const totalPieces = files.reduce((sum, f) => {
    return sum + parseContentFile(path.join(CONTENT_DIR, f)).length;
  }, 0);

  const platformSet = new Set();
  files.forEach(f => {
    parseContentFile(path.join(CONTENT_DIR, f)).forEach(p => platformSet.add(p));
  });

  // ── Header bar ──
  doc.rect(0, 0, 612, 80).fill(GREEN);
  doc.fillColor('white')
     .fontSize(22).font('Helvetica-Bold')
     .text('Crown Media Group', 50, 20);
  doc.fontSize(11).font('Helvetica')
     .text('Monthly Content Delivery Report', 50, 48);
  doc.fillColor(GOLD).fontSize(11)
     .text(formatMonth(month), 450, 35, { align: 'right', width: 112 });

  // ── Client block ──
  doc.moveDown(3);
  doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold')
     .text('Prepared for:', 50, 100);
  doc.fontSize(18).fillColor(GREEN)
     .text('Shatiea — Fruit of the Spirit Juice', 50, 118);
  doc.fontSize(10).fillColor(GRAY)
     .text('Faith-based juice business | Columbia, SC', 50, 140);

  doc.moveTo(50, 158).lineTo(562, 158).strokeColor(GOLD).lineWidth(2).stroke();

  // ── Summary tiles ──
  doc.moveDown(1);
  const tileY = 170;
  const tiles = [
    { label: 'Content Days',   value: String(files.length) },
    { label: 'Total Pieces',   value: String(totalPieces) },
    { label: 'Platforms',      value: String(platformSet.size) },
    { label: 'Monthly Pieces', value: String(totalPieces) },
  ];

  tiles.forEach((t, i) => {
    const x = 50 + i * 130;
    doc.rect(x, tileY, 120, 70).fill('#f0fdf4').stroke(GREEN);
    doc.fillColor(GREEN).fontSize(28).font('Helvetica-Bold')
       .text(t.value, x + 10, tileY + 10, { width: 100, align: 'center' });
    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
       .text(t.label, x + 10, tileY + 46, { width: 100, align: 'center' });
  });

  // ── Platforms covered ──
  doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
     .text('Platforms Covered This Month', 50, tileY + 90);
  doc.fillColor(GRAY).fontSize(10).font('Helvetica')
     .text([...platformSet].join('  ·  '), 50, tileY + 108);

  // ── Content log ──
  doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
     .text('Content Delivery Log', 50, tileY + 135);

  let y = tileY + 155;
  files.forEach((f, idx) => {
    const date = f.replace('shatiea-', '').replace('.md', '');
    const pieces = parseContentFile(path.join(CONTENT_DIR, f));
    const row = `${date}   ${pieces.join(', ')}`;

    if (y > 680) { doc.addPage(); y = 50; }

    doc.rect(50, y, 512, 22).fill(idx % 2 === 0 ? '#f9fafb' : 'white');
    doc.fillColor(DARK).fontSize(9).font('Helvetica')
       .text(row, 55, y + 6, { width: 502 });
    y += 24;
  });

  // ── What's next ──
  if (y + 80 > 720) { doc.addPage(); y = 50; }
  y += 16;
  doc.moveTo(50, y).lineTo(562, y).strokeColor(GOLD).lineWidth(1).stroke();
  y += 12;
  doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold')
     .text("What's Coming Next Month", 50, y);
  y += 20;
  const nexts = [
    '- Daily AI-generated content (Instagram, Facebook, X, Reel, Email)',
    '- Continued brand voice development',
    '- Content performance tracking as platforms report insights',
    '- Monthly report emailed automatically on the 1st',
  ];
  nexts.forEach(n => {
    doc.fillColor(GRAY).fontSize(10).font('Helvetica').text(n, 55, y);
    y += 16;
  });

  // ── Footer ──
  doc.rect(0, 730, 612, 60).fill(DARK);
  doc.fillColor('white').fontSize(9).font('Helvetica')
     .text('Crown Media Group | crownmediagroup.co | king@crownmediagroup.co', 50, 746, { align: 'center', width: 512 });
  doc.fillColor(GOLD).fontSize(8)
     .text('All Glory to Jesus Global LLC — Colossians 3:23', 50, 760, { align: 'center', width: 512 });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

// ── Send via Resend ───────────────────────────────────────────────────────────
async function sendReport(month, pdfPath, shatiea_email) {
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY not set');

  const pdfB64 = fs.readFileSync(pdfPath).toString('base64');
  const subject = `Your ${formatMonth(month)} Content Report — Crown Media Group`;

  const body = `Hi Shatiea,

Here's your ${formatMonth(month)} content delivery report from Crown Media Group.

This month we generated daily content across Instagram, Facebook, X, Reel, and Email — all designed to grow Fruit of the Spirit Juice's audience and sales.

See the attached PDF for the full breakdown.

To God be the glory — keep pressing forward!

David King
Crown Media Group
crownmediagroup.co`;

  const recipients = [KING_EMAIL];
  if (shatiea_email) recipients.push(shatiea_email);

  for (const to of recipients) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: `Crown Media Group <${FROM_EMAIL}>`,
        to,
        subject,
        text: body,
        attachments: [{
          filename: `shatiea-report-${month}.pdf`,
          content: pdfB64,
        }],
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error(`[Shatiea Report] Resend error for ${to}: ${data.error.message}`);
    } else {
      console.log(`[Shatiea Report] Sent to ${to} — ID: ${data.id}`);
    }
  }
}

// ── Supabase: get Shatiea email from clients table ───────────────────────────
async function getShatieaEmail() {
  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/clients?name=ilike.*shatiea*&select=email&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
      },
    });
    const rows = await res.json();
    return rows?.[0]?.email || null;
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const month = getMonth();
  console.log(`[Shatiea Report] Generating ${formatMonth(month)} report...`);

  const files = scanContent(month);
  console.log(`[Shatiea Report] Found ${files.length} content day(s) in ${month}`);

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const pdfPath = path.join(REPORTS_DIR, `shatiea-report-${month}.pdf`);

  await buildPdf(month, files, pdfPath);
  console.log(`[Shatiea Report] PDF saved → ${pdfPath}`);

  const shatiea_email = await getShatieaEmail();
  if (shatiea_email) {
    console.log(`[Shatiea Report] Shatiea email from CRM: ${shatiea_email}`);
  } else {
    console.log('[Shatiea Report] Shatiea email not found in CRM — sending to King only');
  }

  await sendReport(month, pdfPath, shatiea_email);
  console.log('[Shatiea Report] Done.');
}

main().catch(e => {
  console.error(`[Shatiea Report] Fatal: ${e.message}`);
  process.exit(1);
});
