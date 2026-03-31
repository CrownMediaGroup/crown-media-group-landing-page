#!/usr/bin/env node
/**
 * lionheart-pdf.js
 * Compiles all cleaned sermon notes into a Master Notes PDF
 * using Playwright (HTML → PDF).
 *
 * Design: dark navy + gold, Cinzel Decorative + Cormorant Garamond
 * Run AFTER lionheart-clean.js
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "../personal/lionheart");
const SERIES_INDEX = path.join(BASE_DIR, "series-index.json");
const MASTER_DIR = path.join(BASE_DIR, "master");
const OUTPUT_PDF = path.join(MASTER_DIR, "lionheart-master-notes.pdf");

const SERIES_LABELS = {
  "school-of-eternity": "School of Eternity",
  "prayer": "Prayer & Intercession",
  "prosperity": "Prosperity & Stewardship",
  "spiritual-growth": "Spiritual Growth",
  "eternal-rewards": "Eternal Rewards",
  "summoning-presence": "Summoning the Presence",
  "supernatural-healing": "Supernatural, Healing & Deliverance",
  "identity-in-christ": "Identity in Christ",
  "relationships": "Relationships & Family",
  "standalone": "Standalone Messages",
};

function markdownToHtml(md) {
  if (!md) return "";
  return md
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^> "(.+)"$/gm, '<blockquote>"$1"</blockquote>')
    .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^---$/gm, "<hr>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(?!<)(.+)$/gm, "<p>$1</p>");
}

function buildHtml(index) {
  const sermons = [];
  const tocEntries = [];
  let sermonIndex = 0;

  // Collect all sermons ordered by series
  for (const [seriesKey, items] of Object.entries(index)) {
    if (!items || items.length === 0) continue;
    const seriesLabel = SERIES_LABELS[seriesKey] || seriesKey;
    tocEntries.push({ type: "series", label: seriesLabel, key: seriesKey });

    for (const item of items) {
      sermonIndex++;
      const cleanedFile = path.join(BASE_DIR, "cleaned", `${item.id}.md`);
      let content = "";
      if (fs.existsSync(cleanedFile)) {
        content = fs.readFileSync(cleanedFile, "utf-8");
      }
      tocEntries.push({ type: "sermon", label: item.title, id: item.id, num: sermonIndex });
      sermons.push({ seriesKey, seriesLabel, title: item.title, id: item.id, content, num: sermonIndex });
    }
  }

  // Build TOC HTML
  let tocHtml = "";
  let currentSeries = null;
  for (const entry of tocEntries) {
    if (entry.type === "series") {
      if (currentSeries) tocHtml += "</ul>";
      tocHtml += `<div class="toc-series">${entry.label}</div><ul class="toc-list">`;
      currentSeries = entry.key;
    } else {
      tocHtml += `<li><a href="#sermon-${entry.id}">${entry.label}</a></li>`;
    }
  }
  if (currentSeries) tocHtml += "</ul>";

  // Build sermon pages
  let sermonsHtml = "";
  let lastSeries = null;
  for (const sermon of sermons) {
    // Series divider
    if (sermon.seriesKey !== lastSeries) {
      sermonsHtml += `
        <div class="series-divider page-break">
          <div class="series-divider-inner">
            <div class="series-number">${Object.keys(SERIES_LABELS).indexOf(sermon.seriesKey) + 1}</div>
            <h1 class="series-title">${sermon.seriesLabel}</h1>
            <div class="series-line"></div>
          </div>
        </div>`;
      lastSeries = sermon.seriesKey;
    }

    const bodyHtml = markdownToHtml(sermon.content);
    sermonsHtml += `
      <div class="sermon-page page-break" id="sermon-${sermon.id}">
        <div class="sermon-header">
          <div class="sermon-num">#${sermon.num}</div>
          <div class="sermon-series-tag">${sermon.seriesLabel}</div>
        </div>
        <div class="sermon-body">${bodyHtml}</div>
        <div class="sermon-footer">
          <span>Lionheart Church · Pastor Otha Turnbough</span>
          <span>All Glory to Jesus</span>
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap');

  :root {
    --bg: #0f0f1a;
    --bg2: #1a1a2e;
    --gold: #B8860B;
    --gold-light: #D4A017;
    --gold-pale: #f0d080;
    --text: #e8e0d0;
    --text-dim: #a09080;
    --divider: #3a3020;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 13pt;
    line-height: 1.7;
  }

  /* ── COVER PAGE ── */
  .cover {
    width: 100%;
    height: 100vh;
    min-height: 800px;
    background: linear-gradient(160deg, #0a0a14 0%, #1a1a2e 50%, #0f0c05 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px 40px;
    position: relative;
    overflow: hidden;
  }
  .cover::before {
    content: "✦";
    position: absolute;
    top: 30px; left: 50%;
    transform: translateX(-50%);
    font-size: 28pt;
    color: var(--gold);
    opacity: 0.6;
  }
  .cover::after {
    content: "✦";
    position: absolute;
    bottom: 30px; left: 50%;
    transform: translateX(-50%);
    font-size: 20pt;
    color: var(--gold);
    opacity: 0.4;
  }
  .cover-church {
    font-family: 'Cinzel Decorative', serif;
    font-size: 11pt;
    letter-spacing: 8px;
    color: var(--gold);
    text-transform: uppercase;
    margin-bottom: 24px;
    opacity: 0.9;
  }
  .cover-title {
    font-family: 'Cinzel Decorative', serif;
    font-size: 36pt;
    font-weight: 900;
    color: var(--gold-pale);
    line-height: 1.15;
    margin-bottom: 8px;
    text-shadow: 0 0 40px rgba(184,134,11,0.4);
  }
  .cover-subtitle {
    font-family: 'Cinzel Decorative', serif;
    font-size: 18pt;
    font-weight: 400;
    color: var(--gold);
    letter-spacing: 3px;
    margin-bottom: 40px;
  }
  .cover-line {
    width: 180px;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--gold), transparent);
    margin: 0 auto 40px;
  }
  .cover-pastor {
    font-family: 'Cormorant Garamond', serif;
    font-size: 14pt;
    font-style: italic;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .cover-pastor strong {
    color: var(--text);
    font-style: normal;
    font-weight: 600;
  }
  .cover-verse {
    margin-top: 50px;
    max-width: 420px;
    font-size: 11pt;
    font-style: italic;
    color: var(--text-dim);
    line-height: 1.6;
  }
  .cover-verse cite {
    display: block;
    margin-top: 8px;
    font-style: normal;
    color: var(--gold);
    font-size: 10pt;
    letter-spacing: 2px;
  }
  .cover-owner {
    position: absolute;
    bottom: 60px;
    font-size: 9pt;
    letter-spacing: 3px;
    color: var(--text-dim);
    text-transform: uppercase;
  }

  /* ── TOC PAGE ── */
  .toc-page {
    padding: 60px 80px;
    min-height: 100vh;
  }
  .toc-heading {
    font-family: 'Cinzel Decorative', serif;
    font-size: 22pt;
    color: var(--gold-pale);
    margin-bottom: 12px;
    text-align: center;
  }
  .toc-line {
    width: 120px;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--gold), transparent);
    margin: 0 auto 40px;
  }
  .toc-series {
    font-family: 'Cinzel Decorative', serif;
    font-size: 10pt;
    color: var(--gold);
    letter-spacing: 3px;
    text-transform: uppercase;
    margin: 20px 0 6px;
  }
  .toc-list {
    list-style: none;
    padding-left: 16px;
  }
  .toc-list li {
    padding: 3px 0;
    font-size: 11pt;
    color: var(--text-dim);
    border-bottom: 1px solid var(--divider);
  }
  .toc-list li a {
    color: var(--text-dim);
    text-decoration: none;
  }

  /* ── SERIES DIVIDER ── */
  .series-divider {
    width: 100%;
    min-height: 100vh;
    background: linear-gradient(135deg, #0a0a14 0%, #1a1a2e 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 60px;
  }
  .series-divider-inner { max-width: 500px; }
  .series-number {
    font-family: 'Cinzel Decorative', serif;
    font-size: 72pt;
    font-weight: 900;
    color: var(--divider);
    line-height: 1;
    margin-bottom: -20px;
  }
  .series-line {
    width: 80px;
    height: 2px;
    background: var(--gold);
    margin: 20px auto 0;
  }
  h1.series-title {
    font-family: 'Cinzel Decorative', serif;
    font-size: 24pt;
    color: var(--gold-pale);
    line-height: 1.3;
    font-weight: 700;
    border: none;
    padding: 0;
    margin: 0;
  }

  /* ── SERMON PAGE ── */
  .sermon-page {
    padding: 50px 70px 60px;
    min-height: 100vh;
    position: relative;
  }
  .sermon-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 30px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--divider);
  }
  .sermon-num {
    font-family: 'Cinzel Decorative', serif;
    font-size: 10pt;
    color: var(--gold);
    opacity: 0.6;
    letter-spacing: 2px;
  }
  .sermon-series-tag {
    font-size: 9pt;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .sermon-body h1 {
    font-family: 'Cinzel Decorative', serif;
    font-size: 22pt;
    color: var(--gold-pale);
    line-height: 1.3;
    margin-bottom: 24px;
    font-weight: 700;
  }
  .sermon-body h2 {
    font-family: 'Cinzel Decorative', serif;
    font-size: 13pt;
    color: var(--gold);
    letter-spacing: 2px;
    text-transform: uppercase;
    margin: 28px 0 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--divider);
  }
  .sermon-body h3 {
    font-size: 12pt;
    color: var(--gold-light);
    margin: 20px 0 8px;
    font-style: italic;
  }
  .sermon-body p {
    margin-bottom: 12px;
    color: var(--text);
  }
  .sermon-body ul {
    padding-left: 20px;
    margin-bottom: 16px;
  }
  .sermon-body li {
    margin-bottom: 6px;
    color: var(--text);
  }
  .sermon-body blockquote {
    border-left: 3px solid var(--gold);
    padding: 12px 20px;
    margin: 20px 0;
    background: rgba(184,134,11,0.06);
    font-style: italic;
    font-size: 13pt;
    color: var(--gold-pale);
    border-radius: 0 4px 4px 0;
  }
  .sermon-body hr {
    border: none;
    border-top: 1px solid var(--divider);
    margin: 24px 0;
  }
  .sermon-body strong { color: var(--gold-light); }
  .sermon-footer {
    position: absolute;
    bottom: 24px;
    left: 70px; right: 70px;
    display: flex;
    justify-content: space-between;
    font-size: 8pt;
    color: var(--text-dim);
    letter-spacing: 1px;
    border-top: 1px solid var(--divider);
    padding-top: 8px;
  }

  /* ── PAGE BREAKS ── */
  .page-break { page-break-before: always; }
  @media print {
    .page-break { page-break-before: always; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-church">Lionheart Church</div>
  <div class="cover-title">Master<br>Study Notes</div>
  <div class="cover-subtitle">Teaching Archive</div>
  <div class="cover-line"></div>
  <div class="cover-pastor">Teachings by <strong>Pastor Otha Turnbough</strong></div>
  <div class="cover-verse">
    "Write the vision and make it plain, so he may run who reads it."
    <cite>— Habakkuk 2:2</cite>
  </div>
  <div class="cover-owner">All Glory to Jesus · Personal Study Archive</div>
</div>

<!-- TABLE OF CONTENTS -->
<div class="toc-page page-break">
  <h1 class="toc-heading">Table of Contents</h1>
  <div class="toc-line"></div>
  ${tocHtml}
</div>

<!-- SERMON CONTENT -->
${sermonsHtml}

</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(SERIES_INDEX)) {
    console.error(`ERROR: series-index.json not found at ${SERIES_INDEX}`);
    console.error("Run lionheart-clean.js first.");
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(SERIES_INDEX, "utf-8"));

  const totalSermons = Object.values(index).reduce((sum, arr) => sum + arr.length, 0);
  if (totalSermons === 0) {
    console.error("No sermons found in series index. Run lionheart-clean.js first.");
    process.exit(1);
  }

  console.log(`Building Master Notes PDF from ${totalSermons} sermons...`);

  const html = buildHtml(index);
  fs.mkdirSync(MASTER_DIR, { recursive: true });

  // Write HTML for debugging
  const htmlPath = path.join(MASTER_DIR, "lionheart-master-notes.html");
  fs.writeFileSync(htmlPath, html, "utf-8");
  console.log(`HTML written: ${htmlPath}`);

  // Launch Playwright and generate PDF
  console.log("Launching Playwright (chromium)...");
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Load from file
  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });

  // Wait for Google Fonts to load
  await page.waitForTimeout(2000);

  await page.pdf({
    path: OUTPUT_PDF,
    format: "Letter",
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });

  await browser.close();

  const sizeMB = (fs.statSync(OUTPUT_PDF).size / 1024 / 1024).toFixed(2);
  console.log(`\nPDF generated: ${OUTPUT_PDF}`);
  console.log(`Size: ${sizeMB} MB`);
  console.log(`Sermons compiled: ${totalSermons}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
