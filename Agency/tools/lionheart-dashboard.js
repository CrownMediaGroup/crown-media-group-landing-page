#!/usr/bin/env node
/**
 * lionheart-dashboard.js
 * Live local server — reads current archive state on every request.
 * Auto-refreshes every 30 seconds. New sermons appear automatically.
 *
 * Usage: npm run lionheart-dashboard  →  opens http://localhost:3131
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

const PORT = 3131;

const BASE_DIR = path.resolve(__dirname, "../personal/lionheart");
const VIDEO_LIST = path.join(BASE_DIR, "video-list.json");
const RAW_DIR = path.join(BASE_DIR, "raw");
const CLEANED_DIR = path.join(BASE_DIR, "cleaned");
const SERIES_DIR = path.join(BASE_DIR, "series");
const MASTER_DIR = path.join(BASE_DIR, "master");

const SERIES_LABELS = {
  "school-of-eternity": "School of Eternity",
  "prayer": "Prayer & Intercession",
  "prosperity": "Prosperity & Stewardship",
  "spiritual-growth": "Spiritual Growth",
  "eternal-rewards": "Eternal Rewards",
  "summoning-presence": "Summoning the Presence",
  "supernatural-healing": "Supernatural & Healing",
  "identity-in-christ": "Identity in Christ",
  "relationships": "Relationships & Family",
  "standalone": "Standalone Messages",
};

const SERIES_ICONS = {
  "school-of-eternity": "∞",
  "prayer": "✦",
  "prosperity": "◈",
  "spiritual-growth": "⬡",
  "eternal-rewards": "♛",
  "summoning-presence": "◉",
  "supernatural-healing": "⚡",
  "identity-in-christ": "◎",
  "relationships": "♡",
  "standalone": "◇",
};

function getFiles(dir) {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir).map((f) => f.replace(".txt", "").replace(".md", "")));
}

function getSeriesMap() {
  const map = {};
  for (const series of Object.keys(SERIES_LABELS)) {
    const dir = path.join(SERIES_DIR, series);
    map[series] = getFiles(dir);
  }
  return map;
}

function detectSeries(title) {
  const t = title.toLowerCase();
  if (/(eternity|mind of christ|school of eternity|who am i|leftovers|renewing)/.test(t)) return "school-of-eternity";
  if (/(pray|prayer|tongues|intercession|warfare|supplication)/.test(t)) return "prayer";
  if (/(prosperity|financ|steward|money|wealth|tithe|abundance)/.test(t)) return "prosperity";
  if (/(growth|discipleship|maturity|sanctif|transformation|fruit of the spirit)/.test(t)) return "spiritual-growth";
  if (/(eternal reward|crown|judgment seat|bema|crowns of)/.test(t)) return "eternal-rewards";
  if (/(presence|summon|worship|tabernacle|glory|anointing|manifest)/.test(t)) return "summoning-presence";
  if (/(healing|miracle|supernatural|deliverance|signs and wonders|gifted)/.test(t)) return "supernatural-healing";
  if (/(identity|sonship|who you are|new creation|in christ|righteousness|authority)/.test(t)) return "identity-in-christ";
  if (/(marriage|relationship|family|covenant|husband|wife|dating|mother|fathers)/.test(t)) return "relationships";
  return "standalone";
}

function buildHTML(videos, rawFiles, cleanedFiles, seriesMap) {
  const total = videos.length;
  const rawCount = rawFiles.size;
  const cleanedCount = cleanedFiles.size;
  const hasPDF = fs.existsSync(path.join(MASTER_DIR, "lionheart-master-notes.pdf"));

  const phases = [
    { label: "Harvest", desc: "Video list pulled", done: total > 0, count: `${total} videos` },
    { label: "Transcribe", desc: "YouTube captions", done: rawCount >= 30, count: `${rawCount}/62` },
    { label: "Whisper", desc: "Audio transcription", done: rawCount >= 62, count: `${rawCount}/62` },
    { label: "Clean", desc: "Claude organizes notes", done: cleanedCount > 0, count: `${cleanedCount}/${rawCount}` },
    { label: "PDF", desc: "Master notes compiled", done: hasPDF, count: hasPDF ? "Ready" : "Pending" },
  ];

  // Series counts from video titles
  const seriesCounts = {};
  for (const key of Object.keys(SERIES_LABELS)) seriesCounts[key] = 0;
  for (const v of videos) {
    const s = detectSeries(v.title);
    seriesCounts[s] = (seriesCounts[s] || 0) + 1;
  }

  // Video cards
  const videoCards = videos.map((v) => {
    const isRaw = rawFiles.has(v.id);
    const isCleaned = cleanedFiles.has(v.id);
    const series = detectSeries(v.title);
    let status, statusClass;
    if (isCleaned) { status = "Cleaned"; statusClass = "cleaned"; }
    else if (isRaw) { status = "Transcribed"; statusClass = "transcribed"; }
    else { status = "Pending"; statusClass = "pending"; }

    return `
      <div class="video-card ${statusClass}">
        <div class="video-status-dot"></div>
        <div class="video-title">${v.title}</div>
        <div class="video-meta">
          <span class="series-tag">${SERIES_ICONS[series]} ${SERIES_LABELS[series]}</span>
          <span class="status-badge badge-${statusClass}">${status}</span>
        </div>
      </div>`;
  }).join("");

  const seriesCards = Object.entries(SERIES_LABELS).map(([key, label]) => {
    const count = seriesCounts[key] || 0;
    const cleanedInSeries = seriesMap[key] ? seriesMap[key].size : 0;
    return `
      <div class="series-card">
        <div class="series-icon">${SERIES_ICONS[key]}</div>
        <div class="series-info">
          <div class="series-name">${label}</div>
          <div class="series-count">${count} sermons${cleanedInSeries > 0 ? ` · ${cleanedInSeries} cleaned` : ""}</div>
        </div>
      </div>`;
  }).join("");

  const rawPct = Math.round((rawCount / 62) * 100);
  const cleanedPct = Math.round((cleanedCount / Math.max(rawCount, 1)) * 100);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lionheart Archive — Dashboard</title>
<meta http-equiv="refresh" content="30">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0b0b14;
    --bg2: #13131f;
    --bg3: #1a1a2e;
    --gold: #B8860B;
    --gold-light: #d4a017;
    --gold-pale: #f0d88a;
    --text: #e8e0d0;
    --text-dim: #8a7f70;
    --border: #2a2518;
    --green: #4a9e6a;
    --amber: #c8860a;
    --gray: #3a3530;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 15px;
    min-height: 100vh;
  }

  /* ── HEADER ── */
  .header {
    background: linear-gradient(135deg, #08080f 0%, #13131f 50%, #0a0906 100%);
    border-bottom: 1px solid var(--border);
    padding: 40px 60px 32px;
    position: relative;
    overflow: hidden;
  }
  .header::after {
    content: '';
    position: absolute;
    bottom: 0; left: 60px; right: 60px;
    height: 1px;
    background: linear-gradient(to right, transparent, var(--gold), transparent);
  }
  .header-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .church-label {
    font-family: 'Cinzel Decorative', serif;
    font-size: 10px;
    letter-spacing: 5px;
    color: var(--gold);
    text-transform: uppercase;
    margin-bottom: 10px;
    opacity: 0.8;
  }
  h1 {
    font-family: 'Cinzel Decorative', serif;
    font-size: 28px;
    font-weight: 900;
    color: var(--gold-pale);
    line-height: 1.2;
  }
  .header-sub {
    font-size: 14px;
    color: var(--text-dim);
    font-style: italic;
    margin-top: 6px;
  }
  .last-updated {
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 1px;
    text-align: right;
    margin-top: 4px;
  }
  .verse {
    font-size: 12px;
    font-style: italic;
    color: var(--text-dim);
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .verse cite { color: var(--gold); font-style: normal; }

  /* ── LAYOUT ── */
  .container { max-width: 1400px; margin: 0 auto; padding: 40px 60px; }

  /* ── STAT CARDS ── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 40px;
  }
  .stat-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: linear-gradient(to right, transparent, var(--gold), transparent);
    opacity: 0.5;
  }
  .stat-number {
    font-family: 'Cinzel Decorative', serif;
    font-size: 36px;
    font-weight: 900;
    color: var(--gold-pale);
    line-height: 1;
    margin-bottom: 6px;
  }
  .stat-label {
    font-size: 11px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .stat-sub {
    font-size: 12px;
    color: var(--gold);
    margin-top: 8px;
    font-style: italic;
  }

  /* ── PHASE PIPELINE ── */
  .section-title {
    font-family: 'Cinzel Decorative', serif;
    font-size: 11px;
    letter-spacing: 4px;
    color: var(--gold);
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .pipeline {
    display: flex;
    align-items: center;
    gap: 0;
    margin-bottom: 40px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 28px 32px;
    overflow-x: auto;
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 120px;
  }
  .phase-dot {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    border: 2px solid var(--border);
    background: var(--bg3);
    color: var(--text-dim);
    transition: all 0.3s;
  }
  .phase.done .phase-dot {
    background: var(--gold);
    border-color: var(--gold);
    color: #000;
    font-size: 16px;
  }
  .phase.active .phase-dot {
    border-color: var(--amber);
    color: var(--amber);
    box-shadow: 0 0 12px rgba(200,134,10,0.3);
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 12px rgba(200,134,10,0.3); }
    50% { box-shadow: 0 0 20px rgba(200,134,10,0.6); }
  }
  .phase-text { flex: 1; }
  .phase-name {
    font-family: 'Cinzel Decorative', serif;
    font-size: 11px;
    color: var(--text);
    margin-bottom: 3px;
  }
  .phase.done .phase-name { color: var(--gold-pale); }
  .phase-desc { font-size: 11px; color: var(--text-dim); }
  .phase-count { font-size: 11px; color: var(--gold); font-style: italic; }
  .phase-arrow {
    width: 40px;
    text-align: center;
    color: var(--border);
    font-size: 18px;
    flex-shrink: 0;
  }
  .phase.done + .phase-arrow { color: var(--gold); opacity: 0.4; }

  /* ── PROGRESS BARS ── */
  .progress-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 40px;
  }
  .progress-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
  }
  .progress-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
  }
  .progress-title {
    font-family: 'Cinzel Decorative', serif;
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .progress-pct {
    font-family: 'Cinzel Decorative', serif;
    font-size: 22px;
    color: var(--gold-pale);
  }
  .progress-bar-bg {
    height: 6px;
    background: var(--bg3);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(to right, var(--gold), var(--gold-light));
    border-radius: 3px;
    transition: width 1s ease;
  }
  .progress-detail { font-size: 12px; color: var(--text-dim); font-style: italic; }

  /* ── SERIES GRID ── */
  .series-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-bottom: 40px;
  }
  .series-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: border-color 0.2s;
  }
  .series-card:hover { border-color: var(--gold); }
  .series-icon {
    font-size: 20px;
    color: var(--gold);
    opacity: 0.7;
    flex-shrink: 0;
    width: 28px;
    text-align: center;
  }
  .series-name {
    font-size: 12px;
    color: var(--text);
    line-height: 1.3;
    margin-bottom: 3px;
  }
  .series-count { font-size: 11px; color: var(--text-dim); font-style: italic; }

  /* ── VIDEO GRID ── */
  .videos-section { margin-bottom: 40px; }
  .filter-row {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .filter-btn {
    padding: 6px 16px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--bg2);
    color: var(--text-dim);
    font-family: 'Cormorant Garamond', serif;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    letter-spacing: 1px;
  }
  .filter-btn:hover, .filter-btn.active {
    border-color: var(--gold);
    color: var(--gold);
    background: rgba(184,134,11,0.08);
  }
  .videos-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .video-card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    transition: border-color 0.2s;
  }
  .video-card:hover { border-color: var(--gold); }
  .video-card.cleaned { border-left: 3px solid var(--green); }
  .video-card.transcribed { border-left: 3px solid var(--gold); }
  .video-card.pending { border-left: 3px solid var(--gray); }
  .video-status-dot {
    position: absolute;
    top: 14px; right: 14px;
    width: 8px; height: 8px;
    border-radius: 50%;
  }
  .cleaned .video-status-dot { background: var(--green); }
  .transcribed .video-status-dot { background: var(--gold); }
  .pending .video-status-dot { background: var(--gray); }
  .video-title {
    font-size: 13px;
    color: var(--text);
    line-height: 1.4;
    padding-right: 20px;
  }
  .video-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .series-tag {
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 1px;
  }
  .status-badge {
    font-size: 10px;
    letter-spacing: 1px;
    padding: 2px 8px;
    border-radius: 10px;
    text-transform: uppercase;
    font-weight: 600;
  }
  .badge-cleaned { background: rgba(74,158,106,0.15); color: var(--green); }
  .badge-transcribed { background: rgba(184,134,11,0.15); color: var(--gold-light); }
  .badge-pending { background: rgba(58,53,48,0.5); color: var(--text-dim); }

  /* ── FOOTER ── */
  .footer {
    border-top: 1px solid var(--border);
    padding: 24px 60px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 1px;
  }
  .footer-commands { display: flex; gap: 20px; }
  .cmd {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 10px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: var(--gold);
  }

  /* ── LEGEND ── */
  .legend {
    display: flex;
    gap: 20px;
    align-items: center;
    margin-bottom: 14px;
    font-size: 12px;
    color: var(--text-dim);
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div>
      <div class="church-label">Lionheart Church · Pastor Otha Turnbough</div>
      <h1>Master Study Archive</h1>
      <div class="header-sub">Personal Kingdom study notes — All Glory to Jesus</div>
    </div>
    <div class="last-updated">
      Generated ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}<br>
      ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
    </div>
  </div>
  <div class="verse">"Write the vision and make it plain, so he may run who reads it." <cite>— Habakkuk 2:2</cite></div>
</div>

<div class="container">

  <!-- STATS -->
  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-number">${total}</div>
      <div class="stat-label">Total Teachings</div>
      <div class="stat-sub">@LionheartChurch</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${rawCount}</div>
      <div class="stat-label">Transcribed</div>
      <div class="stat-sub">${62 - rawCount} remaining via Whisper</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${cleanedCount}</div>
      <div class="stat-label">Study Notes Ready</div>
      <div class="stat-sub">${rawCount - cleanedCount} waiting to clean</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${hasPDF ? "1" : "0"}</div>
      <div class="stat-label">Master PDF</div>
      <div class="stat-sub">${hasPDF ? "Ready to read" : "Builds after cleaning"}</div>
    </div>
  </div>

  <!-- PIPELINE -->
  <div class="section-title">Pipeline Progress</div>
  <div class="pipeline">
    ${phases.map((p, i) => {
      const isActive = !p.done && (i === 0 || phases[i - 1].done);
      const cls = p.done ? "done" : isActive ? "active" : "";
      const icon = p.done ? "✓" : isActive ? "●" : `${i + 1}`;
      const arrow = i < phases.length - 1 ? `<div class="phase-arrow">→</div>` : "";
      return `
        <div class="phase ${cls}">
          <div class="phase-dot">${icon}</div>
          <div class="phase-text">
            <div class="phase-name">${p.label}</div>
            <div class="phase-desc">${p.desc}</div>
            <div class="phase-count">${p.count}</div>
          </div>
        </div>${arrow}`;
    }).join("")}
  </div>

  <!-- PROGRESS BARS -->
  <div class="progress-section">
    <div class="progress-card">
      <div class="progress-header">
        <div class="progress-title">Transcription</div>
        <div class="progress-pct">${rawPct}%</div>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${rawPct}%"></div>
      </div>
      <div class="progress-detail">${rawCount} of 62 sermons transcribed · ${62 - rawCount} pending Whisper AI</div>
    </div>
    <div class="progress-card">
      <div class="progress-header">
        <div class="progress-title">Cleaning</div>
        <div class="progress-pct">${cleanedPct}%</div>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width:${cleanedPct}%"></div>
      </div>
      <div class="progress-detail">${cleanedCount} of ${rawCount} transcripts turned into study notes</div>
    </div>
  </div>

  <!-- SERIES -->
  <div class="section-title">Series Breakdown</div>
  <div class="series-grid">${seriesCards}</div>

  <!-- VIDEOS -->
  <div class="videos-section">
    <div class="section-title">All Teachings</div>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div> Study Notes Ready</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--gold)"></div> Transcribed</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--gray)"></div> Pending Whisper</div>
    </div>
    <div class="videos-grid">${videoCards}</div>
  </div>

</div>

<div class="footer">
  <div>All Glory to Jesus Global LLC · Crown Media Group · Personal Archive</div>
  <div class="footer-commands">
    <span class="cmd">npm run lionheart-whisper</span>
    <span class="cmd">npm run lionheart-clean</span>
    <span class="cmd">npm run lionheart-pdf</span>
  </div>
</div>

</body>
</html>`;
}

// Live server — reads fresh data on every request
const server = http.createServer((req, res) => {
  if (req.url !== "/" && req.url !== "/favicon.ico") {
    res.writeHead(404);
    return res.end();
  }
  if (req.url === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  const videos = fs.existsSync(VIDEO_LIST) ? JSON.parse(fs.readFileSync(VIDEO_LIST, "utf-8")) : [];
  const rawFiles = getFiles(RAW_DIR);
  const cleanedFiles = getFiles(CLEANED_DIR);
  const seriesMap = getSeriesMap();

  const html = buildHTML(videos, rawFiles, cleanedFiles, seriesMap);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Lionheart Dashboard running → ${url}`);
  console.log("Auto-refreshes every 30 seconds. New sermons appear automatically.");
  console.log("Ctrl+C to stop.\n");

  try {
    execSync(`start "" "${url}"`, { stdio: "ignore" });
  } catch (e) {
    console.log(`Open manually: ${url}`);
  }
});
