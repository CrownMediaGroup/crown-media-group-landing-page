/**
 * monthly-report.js — Video Service Monthly Report Generator
 * Crown Media Group | All Glory to Jesus Global LLC
 *
 * Usage:
 *   node tools/video-service/reporting/monthly-report.js          # current month
 *   node tools/video-service/reporting/monthly-report.js 2026-03  # specific month
 *
 * Generates a branded PDF report and emails it to king@crownmediagroup.co
 * Tax set-aside: 27% (Dave Ramsey 25-30% range, middle value)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');

// PDFKit — use from CRM's node_modules if not at root
let PDFDocument;
try {
  PDFDocument = require('pdfkit');
} catch {
  PDFDocument = require(path.join(__dirname, '../../../tools/crm/node_modules/pdfkit'));
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const GMAIL_USER   = process.env.GMAIL_USER;
const GMAIL_PASS   = process.env.GMAIL_APP_PASSWORD;
const REPORTS_DIR  = path.join(__dirname, '../../../Agency/ops/notes/reports');

// ── Date helper ────────────────────────────────────────────────
function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(ym) {
  const [y, m] = ym.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m)-1]} ${y}`;
}

function fmtCents(cents) {
  return '$' + ((cents || 0) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ── Supabase helpers ────────────────────────────────────────────
async function sbGet(endpoint) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${endpoint}: ${res.status}`);
  return res.json();
}

async function sbPatch(endpoint, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// ── Tax calculation (Dave Ramsey) ──────────────────────────────
function calcTax(grossCents) { return Math.round(grossCents * 0.27); }
function calcNet(grossCents)  { return grossCents - calcTax(grossCents); }

// ── Colors ─────────────────────────────────────────────────────
const ROYAL = '#1A1A3E';
const GOLD  = '#C9981A';
const GOLD_LIGHT = '#E8B832';
const CREAM = '#FDFBF7';
const RED   = '#dc2626';
const GREEN = '#16a34a';
const GRAY  = '#6B7280';

// ── PDF generation ─────────────────────────────────────────────
function buildPDF(month, projects, platformPosts, revenueRows) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 60, right: 60 } });

  // ── Cover page ────────────────────────────────────────────────
  // Background header bar
  doc.rect(0, 0, 612, 200).fill(ROYAL);

  // Crown Media Group wordmark
  doc.fontSize(28).font('Helvetica-Bold').fillColor(GOLD_LIGHT)
    .text('Crown Media Group', 60, 70, { align: 'left' });
  doc.fontSize(12).font('Helvetica').fillColor(GOLD)
    .text('AI-Powered Video Service', 60, 104);

  // Report title
  doc.fontSize(16).font('Helvetica-Bold').fillColor(CREAM)
    .text(`Video Service Report — ${formatMonth(month)}`, 60, 140);
  doc.fontSize(10).font('Helvetica').fillColor('rgba(253,251,247,0.7)')
    .text(`Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} | All Glory to Jesus Global LLC`, 60, 162);

  doc.y = 220;

  // ── Revenue Summary ───────────────────────────────────────────
  const totalGross = revenueRows.reduce((s, r) => s + (r.gross_revenue || 0), 0);
  const totalTax   = calcTax(totalGross);
  const totalNet   = calcNet(totalGross);
  const totalProjs = revenueRows.reduce((s, r) => s + (r.project_count || 0), 0);

  sectionHeader(doc, 'Monthly Revenue Summary');

  // Summary boxes (3 cols)
  const boxY = doc.y;
  const boxW = 150;
  const boxGap = 15;
  const startX = 60;

  summaryBox(doc, startX + 0 * (boxW + boxGap), boxY, boxW, 'GROSS REVENUE', fmtCents(totalGross), GOLD);
  summaryBox(doc, startX + 1 * (boxW + boxGap), boxY, boxW, 'TAX SET-ASIDE (27%)', fmtCents(totalTax), RED);
  summaryBox(doc, startX + 2 * (boxW + boxGap), boxY, boxW, 'NET REVENUE', fmtCents(totalNet), GREEN);

  doc.y = boxY + 90;

  // Dave Ramsey tax reminder
  doc.rect(60, doc.y, 492, 36).fill('#FEF9EC');
  doc.fontSize(9).font('Helvetica-Bold').fillColor(GOLD)
    .text('Dave Ramsey Protocol:', 70, doc.y + 11, { continued: true })
    .font('Helvetica').fillColor('#4A4A6A')
    .text(`  Set aside ${fmtCents(totalTax)} (27% of ${fmtCents(totalGross)} gross) before any expenses.`);
  doc.y = doc.y + 50;

  // ── Projects This Month ───────────────────────────────────────
  sectionHeader(doc, `Projects — ${formatMonth(month)}`);

  if (projects.length === 0) {
    doc.fontSize(10).font('Helvetica').fillColor(GRAY).text('No projects recorded for this month.', { indent: 10 });
    doc.moveDown();
  } else {
    // Table header
    tableRow(doc, doc.y, ['Client', 'Business', 'Type', 'Platforms', 'Status'], true);
    for (const p of projects) {
      if (doc.y > 680) { doc.addPage(); sectionHeader(doc, 'Projects (continued)'); }
      tableRow(doc, doc.y, [
        p.client_name,
        p.business_name?.substring(0, 20),
        p.video_type || '—',
        (p.target_platforms || []).join(', ').substring(0, 20),
        p.status,
      ], false);
    }
    doc.moveDown(0.5);
  }

  // ── Engagement Summary ────────────────────────────────────────
  if (doc.y > 600) doc.addPage();
  sectionHeader(doc, 'Engagement Summary');

  const totalViews   = platformPosts.reduce((s, p) => s + (p.views || 0), 0);
  const totalLikes   = platformPosts.reduce((s, p) => s + (p.likes || 0), 0);
  const totalComments= platformPosts.reduce((s, p) => s + (p.comments || 0), 0);
  const totalShares  = platformPosts.reduce((s, p) => s + (p.shares || 0), 0);
  const postedCount  = platformPosts.filter(p => p.status === 'posted').length;

  const engRow = [
    ['Total Posts Published', String(postedCount)],
    ['Total Views', totalViews.toLocaleString()],
    ['Total Likes', totalLikes.toLocaleString()],
    ['Total Comments', totalComments.toLocaleString()],
    ['Total Shares', totalShares.toLocaleString()],
  ];

  for (const [label, value] of engRow) {
    engStat(doc, label, value);
  }

  // ── Client Revenue Detail ─────────────────────────────────────
  if (revenueRows.length > 0) {
    if (doc.y > 580) doc.addPage();
    sectionHeader(doc, 'Client Revenue Detail');
    tableRow(doc, doc.y, ['Client', 'Tier', 'Projects', 'Gross', 'Tax', 'Net', 'Paid'], true);
    for (const r of revenueRows) {
      if (doc.y > 680) { doc.addPage(); sectionHeader(doc, 'Revenue (continued)'); }
      tableRow(doc, doc.y, [
        r.client_name,
        r.service_tier || '—',
        String(r.project_count || 0),
        fmtCents(r.gross_revenue),
        fmtCents(r.tax_set_aside || calcTax(r.gross_revenue || 0)),
        fmtCents(r.net_revenue || calcNet(r.gross_revenue || 0)),
        r.invoice_paid ? 'PAID' : 'PENDING',
      ], false);
    }
  }

  // ── Footer ────────────────────────────────────────────────────
  if (doc.y > 680) doc.addPage();
  doc.y = 720;
  doc.fontSize(8).font('Helvetica').fillColor(GRAY)
    .text('Crown Media Group | All Glory to Jesus Global LLC | Columbia, SC 29229 | crownmediagroup.co | king@crownmediagroup.co', 60, doc.y, { align: 'center' });
  doc.fontSize(8).fillColor(GOLD)
    .text('"Whatever you do, work at it with all your heart, as working for the Lord." — Colossians 3:23', 60, doc.y + 14, { align: 'center' });

  return doc;
}

// ── PDF helpers ────────────────────────────────────────────────
function sectionHeader(doc, title) {
  doc.moveDown(0.5);
  doc.rect(60, doc.y, 492, 24).fill(ROYAL);
  doc.fontSize(10).font('Helvetica-Bold').fillColor(GOLD_LIGHT)
    .text(title.toUpperCase(), 68, doc.y + 7);
  doc.y = doc.y + 34;
}

function summaryBox(doc, x, y, w, label, value, color) {
  doc.rect(x, y, w, 70).stroke(color);
  doc.rect(x, y, w, 24).fill(color);
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
    .text(label, x + 8, y + 8, { width: w - 16, align: 'center' });
  doc.fontSize(18).font('Helvetica-Bold').fillColor(color)
    .text(value, x + 4, y + 34, { width: w - 8, align: 'center' });
}

function tableRow(doc, y, cols, isHeader) {
  const colWidths = [90, 100, 60, 90, 60, 55, 45];
  const colX = [60, 150, 250, 310, 400, 455, 510];
  const rowH = isHeader ? 20 : 18;

  if (isHeader) doc.rect(60, y, 492, rowH).fill('#F3F4F6');
  else if (doc.y % 36 < 18) doc.rect(60, y, 492, rowH).fill('#FAFAFA');

  const font = isHeader ? 'Helvetica-Bold' : 'Helvetica';
  const color = isHeader ? ROYAL : '#374151';

  cols.forEach((col, i) => {
    doc.fontSize(8).font(font).fillColor(color)
      .text(String(col || ''), colX[i], y + 4, { width: colWidths[i] - 4, ellipsis: true });
  });
  doc.moveTo(60, y + rowH).lineTo(552, y + rowH).stroke('#E5E7EB');
  doc.y = y + rowH + 2;
}

function engStat(doc, label, value) {
  doc.fontSize(9).font('Helvetica').fillColor(GRAY)
    .text(label + ':', 70, doc.y, { continued: true, width: 200 });
  doc.font('Helvetica-Bold').fillColor(ROYAL).text('  ' + value);
  doc.moveDown(0.2);
}

// ── Email via nodemailer / Gmail ───────────────────────────────
async function emailReport(month, pdfPath) {
  if (!GMAIL_USER || !GMAIL_PASS) {
    console.log('[EMAIL SKIP] Set GMAIL_USER + GMAIL_APP_PASSWORD in .env');
    return;
  }
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  });
  await transporter.sendMail({
    from: `"Crown Media Group" <${GMAIL_USER}>`,
    to: 'king@crownmediagroup.co',
    subject: `Video Service Report — ${formatMonth(month)}`,
    html: `
      <p>Hi King,</p>
      <p>Your <strong>Video Service Monthly Report for ${formatMonth(month)}</strong> is attached.</p>
      <p>Review revenue, projects completed, and engagement metrics for the month.</p>
      <p style="color:#9A720D;font-style:italic;">All glory to God — ${formatMonth(month)} is done. On to the next.</p>
      <p style="font-size:0.8rem;color:#888;">Crown Media Group | All Glory to Jesus Global LLC</p>`,
    attachments: [{ filename: `video-report-${month}.pdf`, path: pdfPath }],
  });
  console.log(`[EMAIL] Report sent to king@crownmediagroup.co`);
}

// ── Main ───────────────────────────────────────────────────────
async function generateReport(month) {
  month = month || getCurrentMonth();
  console.log(`Generating video report for ${month}...`);

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  // Fetch data
  const [projects, platformPosts, revenueRows] = await Promise.all([
    sbGet(`video_projects?revenue_month=eq.${month}&select=*&order=created_at.asc`),
    sbGet(`video_platform_posts?select=*&order=created_at.asc`).then(posts => {
      // Filter to this month's projects
      const ids = new Set();
      return posts.filter(p => {
        const proj = projects.find(pr => pr.id === p.project_id);
        return !!proj;
      });
    }),
    sbGet(`video_revenue?revenue_month=eq.${month}&select=*`),
  ]);

  // Auto-insert revenue rows if missing (upsert from project data)
  if (revenueRows.length === 0 && projects.length > 0) {
    const clientMap = {};
    for (const p of projects) {
      const key = p.client_email;
      if (!clientMap[key]) clientMap[key] = { client_name: p.client_name, business_name: p.business_name, gross: 0, count: 0, ids: [] };
      clientMap[key].gross += p.invoice_amount || 0;
      clientMap[key].count++;
      clientMap[key].ids.push(p.id);
    }
    for (const [email, data] of Object.entries(clientMap)) {
      const tax = calcTax(data.gross);
      await fetch(`${SUPABASE_URL}/rest/v1/video_revenue`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal,resolution=merge-duplicates',
        },
        body: JSON.stringify({
          revenue_month: month,
          client_name: data.client_name,
          business_name: data.business_name,
          project_count: data.count,
          project_ids: data.ids,
          gross_revenue: data.gross,
          tax_set_aside: tax,
          net_revenue: data.gross - tax,
        }),
      });
    }
    // Re-fetch
    const updated = await sbGet(`video_revenue?revenue_month=eq.${month}&select=*`);
    revenueRows.push(...updated);
  }

  // Build PDF
  const pdfPath = path.join(REPORTS_DIR, `video-report-${month}.pdf`);
  const doc = buildPDF(month, projects, platformPosts, revenueRows);
  const stream = fs.createWriteStream(pdfPath);
  doc.pipe(stream);
  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  console.log(`PDF saved: ${pdfPath}`);

  // Email
  await emailReport(month, pdfPath);

  // Mark report sent
  for (const row of revenueRows) {
    await sbPatch(`video_revenue?id=eq.${row.id}`, {
      report_generated: true,
      report_sent_at: new Date().toISOString(),
    });
  }

  console.log(`Report complete for ${month}`);
  return pdfPath;
}

// ── CLI ────────────────────────────────────────────────────────
const month = process.argv[2] || null;
generateReport(month).then(p => {
  console.log('Done:', p);
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
