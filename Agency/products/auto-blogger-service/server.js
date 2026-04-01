/**
 * Auto-Blogger SaaS — Crown Media Group
 * Multi-tenant automated blogging platform
 * Port 4002 | SQLite | Railway-deployable
 *
 * Dashboard:  autoblogger.crownmediagroup.co
 * Admin:      king@crownmediagroup.co / AllGlory2026!
 *
 * Start: node server.js
 * Deploy: railway up (from this directory)
 */

import express from 'express';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import Database from 'better-sqlite3';
import { Resend } from 'resend';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '../..');

// ── Load .env ─────────────────────────────────────────────────────────────────
for (const p of [join(ROOT, '.env'), join(__dirname, '.env')]) {
  if (existsSync(p)) {
    readFileSync(p, 'utf8').split('\n').forEach(line => {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.trim().startsWith('#')) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (k && !process.env[k]) process.env[k] = v;
      }
    });
  }
}

const PORT    = process.env.AUTOBLOGGER_PORT || process.env.PORT || 4002;
const resend  = new Resend(process.env.RESEND_API_KEY);
const DATA_DIR = join(__dirname, 'data');
const CLIENTS_DIR = join(__dirname, 'clients');
mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(CLIENTS_DIR, { recursive: true });

// ── Database ──────────────────────────────────────────────────────────────────
const db = new Database(join(DATA_DIR, 'autoblogger.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT    UNIQUE NOT NULL,
    business_name TEXT  NOT NULL,
    email       TEXT    NOT NULL,
    website     TEXT,
    niche       TEXT,
    city        TEXT    DEFAULT 'Columbia SC',
    services    TEXT,
    voice_tone  TEXT    DEFAULT 'professional, helpful, local',
    target_audience TEXT,
    cta_url     TEXT,
    cta_text    TEXT    DEFAULT 'Book a free call',
    hashtags    TEXT,
    tier        TEXT    DEFAULT 'starter',
    posts_per_day INTEGER DEFAULT 1,
    status      TEXT    DEFAULT 'onboarding',
    github_repo TEXT,
    netlify_url TEXT,
    notify_email TEXT,
    subreddits  TEXT,
    stripe_subscription_id TEXT,
    monthly_amount INTEGER DEFAULT 20000,
    created_at  TEXT    DEFAULT (datetime('now')),
    updated_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id   INTEGER NOT NULL,
    title       TEXT,
    slug        TEXT,
    excerpt     TEXT,
    category    TEXT,
    published_at TEXT,
    word_count  INTEGER DEFAULT 0,
    x_posted    INTEGER DEFAULT 0,
    linkedin_posted INTEGER DEFAULT 0,
    facebook_posted INTEGER DEFAULT 0,
    reddit_posted   INTEGER DEFAULT 0,
    status      TEXT    DEFAULT 'published',
    created_at  TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT    PRIMARY KEY,
    expires_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS onboarding_submissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT    UNIQUE NOT NULL,
    email       TEXT    NOT NULL,
    data        TEXT,
    used        INTEGER DEFAULT 0,
    created_at  TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Auth ──────────────────────────────────────────────────────────────────────
const ADMIN_EMAIL    = 'king@crownmediagroup.co';
const ADMIN_HASH_KEY = 'AUTOBLOGGER_ADMIN_HASH';

function hashPass(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}$${hash}`;
}
function verifyPass(pw, stored) {
  try {
    const [salt, hash] = stored.split('$');
    return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(pw, salt, 64));
  } catch { return false; }
}

let adminHash = process.env[ADMIN_HASH_KEY];
if (!adminHash) {
  adminHash = hashPass('AllGlory2026!');
  console.log('[Auth] Admin hash initialized.');
}

function createSession() {
  const token   = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, expires_at) VALUES (?, ?)').run(token, expires);
  return token;
}
function validSession(req) {
  const token = getCookie(req, 'ab_session') || req.headers['x-admin-token'];
  if (!token) return false;
  const row = db.prepare("SELECT token FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  return !!row;
}
function getCookie(req, name) {
  return (req.headers.cookie || '').split(';').reduce((v, p) => {
    const [k, ...val] = p.trim().split('=');
    return k === name ? val.join('=') : v;
  }, null);
}
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}
function generateOnboardingToken() {
  return randomBytes(24).toString('hex');
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Dashboard HTML (admin-only) ───────────────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Auto-Blogger — Crown Media Group</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0a12;--sidebar:#0d0d18;--card:#111120;--card2:#151526;
  --border:rgba(201,152,26,.12);--border2:rgba(201,152,26,.25);
  --gold:#C9981A;--gold-light:#e8b832;--gold-dim:rgba(201,152,26,.08);
  --text:#eeeef5;--mid:#8888aa;--dim:#55556a;
  --green:#3ecf8e;--blue:#529ae0;--purple:#a78bfa;--red:#e05252;
  --sidebar-w:220px;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex}

/* ── Sidebar ── */
.sidebar{width:var(--sidebar-w);min-height:100vh;background:var(--sidebar);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;left:0;top:0;bottom:0;z-index:200}
.sidebar-logo{padding:24px 20px 20px;border-bottom:1px solid var(--border)}
.sidebar-logo-name{font-size:.95rem;font-weight:800;color:var(--gold);letter-spacing:-.01em}
.sidebar-logo-sub{font-size:.68rem;color:var(--dim);margin-top:2px}
.sidebar-nav{flex:1;padding:12px 10px}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:.82rem;font-weight:500;color:var(--mid);cursor:pointer;transition:.15s;border-left:2px solid transparent;text-decoration:none;margin-bottom:2px}
.nav-item:hover{background:var(--gold-dim);color:var(--text)}
.nav-item.active{background:var(--gold-dim);color:var(--gold);border-color:var(--gold);font-weight:600}
.nav-item svg{width:16px;height:16px;flex-shrink:0;opacity:.7}
.nav-item.active svg{opacity:1}
.sidebar-footer{padding:16px 10px;border-top:1px solid var(--border)}
.user-pill{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;transition:.15s}
.user-pill:hover{background:var(--gold-dim)}
.user-avatar{width:30px;height:30px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:800;color:#000;flex-shrink:0}
.user-name{font-size:.78rem;font-weight:600;color:var(--text)}
.user-role{font-size:.65rem;color:var(--dim)}

/* ── Main ── */
.main-wrap{margin-left:var(--sidebar-w);flex:1;min-height:100vh}
.topbar{padding:20px 32px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:rgba(10,10,18,.8);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100}
.page-title{font-size:1.05rem;font-weight:700}
.page-sub{font-size:.75rem;color:var(--mid);margin-top:1px}
.topbar-actions{display:flex;gap:10px}
.btn{padding:8px 16px;border-radius:7px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;transition:.15s;display:inline-flex;align-items:center;gap:6px}
.btn:active{transform:scale(.96)}
.btn-gold{background:var(--gold);color:#000}
.btn-gold:hover{background:var(--gold-light)}
.btn-ghost{background:var(--card);color:var(--mid);border:1px solid var(--border)}
.btn-ghost:hover{color:var(--text);border-color:var(--border2)}
.btn-danger{background:rgba(224,82,82,.15);color:var(--red);border:1px solid rgba(224,82,82,.2)}
.btn-danger:hover{background:rgba(224,82,82,.25)}
.content{padding:32px}

/* ── Stats ── */
.stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;animation:fadeUp .4s ease both}
.stat-card:nth-child(2){animation-delay:.05s}
.stat-card:nth-child(3){animation-delay:.1s}
.stat-card:nth-child(4){animation-delay:.15s}
.stat-icon{width:36px;height:36px;border-radius:9px;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.stat-icon svg{width:18px;height:18px;stroke:var(--gold);fill:none;stroke-width:1.8}
.stat-val{font-size:2.2rem;font-weight:900;color:var(--text);letter-spacing:-.03em;line-height:1}
.stat-trend{display:inline-flex;align-items:center;gap:3px;font-size:.7rem;font-weight:700;padding:2px 7px;border-radius:20px;margin-top:6px;margin-bottom:4px}
.trend-up{background:rgba(62,207,142,.12);color:var(--green)}
.trend-neutral{background:rgba(136,136,170,.1);color:var(--mid)}
.stat-label{font-size:.72rem;color:var(--mid);text-transform:uppercase;letter-spacing:.07em;font-weight:600}
.skeleton .stat-val{background:var(--card2);border-radius:6px;color:transparent;animation:shimmer 1.2s infinite}
.skeleton .stat-label{background:var(--card2);border-radius:4px;color:transparent;width:60%;animation:shimmer 1.2s infinite}

/* ── Section ── */
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.section-title{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--mid)}
.section-count{font-size:.72rem;color:var(--dim);background:var(--card);border:1px solid var(--border);padding:2px 8px;border-radius:20px}

/* ── Client cards ── */
.client-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;margin-bottom:40px}
.client-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;cursor:pointer;transition:.2s;animation:fadeUp .4s ease both;position:relative;overflow:hidden}
.client-card::before{content:'';position:absolute;inset:0;border-radius:12px;border:1px solid var(--gold);opacity:0;transition:.2s}
.client-card:hover{transform:translateY(-3px);box-shadow:0 8px 32px rgba(0,0,0,.3)}
.client-card:hover::before{opacity:.4}
.client-card-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px}
.client-name{font-size:.95rem;font-weight:700;color:var(--text)}
.client-url{font-size:.72rem;color:var(--mid);margin-top:2px}
.tier-badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;flex-shrink:0}
.tier-starter{background:rgba(201,152,26,.12);color:var(--gold)}
.tier-growth{background:rgba(82,154,224,.12);color:var(--blue)}
.tier-premium{background:rgba(167,139,250,.12);color:var(--purple)}
.client-status{display:flex;align-items:center;gap:6px;font-size:.75rem;color:var(--mid);margin-bottom:14px}
.status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.status-active .status-dot{background:var(--green);box-shadow:0 0 0 3px rgba(62,207,142,.2);animation:pulse 2s infinite}
.status-onboarding .status-dot{background:var(--gold)}
.status-paused .status-dot{background:var(--dim)}
.client-stats{display:flex;gap:16px;margin-bottom:14px}
.client-stat{font-size:.75rem;color:var(--mid)}.client-stat strong{color:var(--text);font-weight:600}
.sparkline{display:flex;align-items:flex-end;gap:3px;height:28px}
.spark-bar{width:8px;border-radius:3px 3px 0 0;background:var(--gold-dim);transition:.2s}
.client-card:hover .spark-bar{background:rgba(201,152,26,.3)}
.spark-bar.filled{background:var(--gold)}

/* ── Empty state ── */
.empty-state{grid-column:1/-1;border:1.5px dashed var(--border2);border-radius:14px;padding:60px 40px;text-align:center}
.empty-icon{width:56px;height:56px;border-radius:14px;background:var(--gold-dim);display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.empty-icon svg{width:28px;height:28px;stroke:var(--gold);fill:none;stroke-width:1.5}
.empty-title{font-size:1.1rem;font-weight:700;margin-bottom:6px}
.empty-sub{font-size:.83rem;color:var(--mid);margin-bottom:20px}

/* ── Recent posts ── */
.post-row{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:16px;transition:.15s}
.post-row:hover{border-color:var(--border2)}
.post-row+.post-row{margin-top:8px}
.post-client-dot{width:8px;height:8px;border-radius:50%;background:var(--gold);flex-shrink:0}
.post-title-text{font-size:.83rem;font-weight:600;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.post-date{font-size:.72rem;color:var(--dim);white-space:nowrap}
.platform-pills{display:flex;gap:4px;flex-shrink:0}
.pill{padding:2px 7px;border-radius:20px;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.pill-done{background:rgba(62,207,142,.12);color:var(--green)}
.pill-skip{background:rgba(100,100,130,.08);color:var(--dim)}

/* ── Modal ── */
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:500;align-items:flex-start;justify-content:center;padding:48px 20px;overflow-y:auto}
.modal-overlay.open{display:flex}
.modal{background:var(--card);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:580px;padding:32px;position:relative;animation:slideUp .25s ease}
.modal-close{position:absolute;top:14px;right:14px;width:28px;height:28px;border-radius:50%;background:var(--card2);border:1px solid var(--border);color:var(--mid);font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;transition:.15s}
.modal-close:hover{color:var(--text)}
.modal h2{font-size:1.15rem;font-weight:800;margin-bottom:6px}
.modal-sub{font-size:.8rem;color:var(--mid);margin-bottom:24px}

/* Wizard progress */
.wizard-progress{display:flex;align-items:center;gap:0;margin-bottom:28px}
.wizard-step{display:flex;align-items:center;gap:8px;flex:1}
.wizard-step:last-child{flex:0}
.step-circle{width:28px;height:28px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;color:var(--mid);flex-shrink:0;transition:.25s}
.step-circle.active{border-color:var(--gold);background:var(--gold);color:#000}
.step-circle.done{border-color:var(--green);background:var(--green);color:#000}
.step-label-text{font-size:.72rem;color:var(--mid);font-weight:500;white-space:nowrap}
.wizard-step.active .step-label-text{color:var(--text)}
.step-line{flex:1;height:1px;background:var(--border);margin:0 8px}
.step-line.done{background:var(--green)}

/* Wizard panels */
.wizard-panel{display:none}.wizard-panel.active{display:block}
.wizard-nav{display:flex;justify-content:space-between;align-items:center;margin-top:24px;padding-top:20px;border-top:1px solid var(--border)}

/* Form fields */
.form-row{margin-bottom:16px}
.form-row label{display:block;font-size:.72rem;font-weight:600;color:var(--mid);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em}
.form-row input,.form-row select,.form-row textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:10px 12px;color:var(--text);font-size:.875rem;outline:none;transition:.15s}
.form-row input:focus,.form-row select:focus,.form-row textarea:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(201,152,26,.08)}
.form-row textarea{resize:vertical;min-height:70px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.form-hint{font-size:.72rem;color:var(--dim);margin-top:5px;line-height:1.5}

/* Onboard link tab */
.tab-bar{display:flex;gap:0;margin-bottom:24px;border-bottom:1px solid var(--border)}
.tab{padding:8px 16px;font-size:.8rem;font-weight:600;color:var(--mid);border-bottom:2px solid transparent;margin-bottom:-1px;cursor:pointer;transition:.15s}
.tab.active{color:var(--gold);border-color:var(--gold)}
.tab-panel{display:none}.tab-panel.active{display:block}
.onboard-link-box{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-family:'SF Mono',monospace;font-size:.75rem;color:var(--gold);word-break:break-all;margin-top:12px}

/* Client detail modal */
.detail-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.detail-stat{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px 16px}
.detail-stat-val{font-size:1.6rem;font-weight:800;color:var(--gold-light)}
.detail-stat-label{font-size:.68rem;color:var(--mid);text-transform:uppercase;letter-spacing:.06em;margin-top:3px}
.info-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:.83rem}
.info-row:last-child{border:none}
.info-label{color:var(--mid);width:110px;flex-shrink:0;font-size:.75rem}
.info-val{color:var(--text)}

/* Animations */
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(62,207,142,.2)}50%{box-shadow:0 0 0 6px rgba(62,207,142,.05)}}
@keyframes shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}

/* Mobile */
@media(max-width:768px){
  .sidebar{display:none}
  .main-wrap{margin-left:0}
  .mobile-bar{display:flex}
  .stats-grid{grid-template-columns:1fr 1fr}
  .content{padding:20px}
  .form-grid{grid-template-columns:1fr}
}
.mobile-bar{display:none;position:fixed;bottom:0;left:0;right:0;background:var(--sidebar);border-top:1px solid var(--border);z-index:200;padding:8px 0}
.mobile-bar-items{display:flex;justify-content:space-around}
.mobile-bar-item{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 16px;color:var(--dim);font-size:.6rem;font-weight:600;cursor:pointer;text-transform:uppercase;letter-spacing:.05em}
.mobile-bar-item.active{color:var(--gold)}
.mobile-bar-item svg{width:20px;height:20px}
</style>
</head>
<body>

<!-- Sidebar -->
<aside class="sidebar">
  <div class="sidebar-logo">
    <div class="sidebar-logo-name">Auto-Blogger</div>
    <div class="sidebar-logo-sub">Crown Media Group</div>
  </div>
  <nav class="sidebar-nav">
    <a class="nav-item active" href="/" onclick="return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      Dashboard
    </a>
    <a class="nav-item" href="#" onclick="openOnboardModal();return false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Clients
    </a>
    <a class="nav-item" href="#">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      Posts
    </a>
    <a class="nav-item" href="#">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
      Automation
    </a>
  </nav>
  <div class="sidebar-footer">
    <div class="user-pill" onclick="location.href='/api/logout'">
      <div class="user-avatar">K</div>
      <div>
        <div class="user-name">David King</div>
        <div class="user-role">Sign out</div>
      </div>
    </div>
  </div>
</aside>

<!-- Mobile bottom bar -->
<div class="mobile-bar">
  <div class="mobile-bar-items">
    <div class="mobile-bar-item active">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      Dashboard
    </div>
    <div class="mobile-bar-item" onclick="openOnboardModal()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Clients
    </div>
    <div class="mobile-bar-item">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      Posts
    </div>
    <div class="mobile-bar-item" onclick="location.href='/api/logout'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Sign Out
    </div>
  </div>
</div>

<!-- Main -->
<div class="main-wrap">
  <div class="topbar">
    <div>
      <div class="page-title">Dashboard</div>
      <div class="page-sub" id="topbar-date"></div>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-ghost" onclick="loadDashboard()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
        Refresh
      </button>
      <button class="btn btn-gold" onclick="openOnboardModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Client
      </button>
    </div>
  </div>

  <div class="content">
    <!-- Stats -->
    <div class="stats-grid" id="stats-grid">
      <div class="stat-card skeleton">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
        <div class="stat-val" id="stat-clients">—</div>
        <div class="stat-trend trend-up">▲ Active</div>
        <div class="stat-label">Clients</div>
      </div>
      <div class="stat-card skeleton">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="stat-val" id="stat-posts-today">—</div>
        <div class="stat-trend trend-neutral">Today</div>
        <div class="stat-label">Posts Today</div>
      </div>
      <div class="stat-card skeleton">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
        <div class="stat-val" id="stat-posts-month">—</div>
        <div class="stat-trend trend-up">▲ This month</div>
        <div class="stat-label">Posts / Month</div>
      </div>
      <div class="stat-card skeleton">
        <div class="stat-icon"><svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
        <div class="stat-val" id="stat-mrr">—</div>
        <div class="stat-trend trend-up">▲ Recurring</div>
        <div class="stat-label">Monthly Revenue</div>
      </div>
    </div>

    <!-- Clients -->
    <div class="section-header">
      <span class="section-title">Clients</span>
      <span class="section-count" id="client-count">0 clients</span>
    </div>
    <div class="client-grid" id="client-grid">
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg></div>
        <div class="empty-title">No clients yet</div>
        <div class="empty-sub">Add your first client to start generating content.</div>
        <button class="btn btn-gold" onclick="openOnboardModal()">Add Your First Client</button>
      </div>
    </div>

    <!-- Recent Posts -->
    <div class="section-header" style="margin-top:8px">
      <span class="section-title">Recent Posts</span>
    </div>
    <div id="recent-posts-list" style="margin-bottom:60px">
      <div style="color:var(--dim);font-size:.8rem;padding:20px 0">Posts will appear here after clients are set up.</div>
    </div>
  </div>
</div>

<!-- New Client Modal -->
<div class="modal-overlay" id="onboard-modal">
  <div class="modal">
    <button class="modal-close" onclick="closeModal('onboard-modal')">×</button>
    <h2>Add New Client</h2>
    <p class="modal-sub">Set up automated blogging for a new client.</p>

    <div class="tab-bar">
      <div class="tab active" onclick="switchModalTab('manual')">Manual Setup</div>
      <div class="tab" onclick="switchModalTab('onboard-link')">Send Onboarding Link</div>
    </div>

    <!-- Manual: 3-step wizard -->
    <div class="tab-panel active" id="panel-manual">
      <div class="wizard-progress" id="wizard-progress">
        <div class="wizard-step active" id="ws-1">
          <div class="step-circle active" id="sc-1">1</div>
          <span class="step-label-text">Business</span>
        </div>
        <div class="step-line" id="sl-1"></div>
        <div class="wizard-step" id="ws-2">
          <div class="step-circle" id="sc-2">2</div>
          <span class="step-label-text">Brand Voice</span>
        </div>
        <div class="step-line" id="sl-2"></div>
        <div class="wizard-step" id="ws-3">
          <div class="step-circle" id="sc-3">3</div>
          <span class="step-label-text">Technical</span>
        </div>
      </div>

      <form id="client-form" onsubmit="submitClient(event)">
        <!-- Step 1 -->
        <div class="wizard-panel active" id="wp-1">
          <div class="form-grid">
            <div class="form-row"><label>Business Name *</label><input name="business_name" required placeholder="Joe's Barber Shop"></div>
            <div class="form-row"><label>Email *</label><input name="email" type="email" required placeholder="joe@example.com"></div>
          </div>
          <div class="form-grid">
            <div class="form-row"><label>Website</label><input name="website" placeholder="https://joesbarbershop.com"></div>
            <div class="form-row"><label>City</label><input name="city" value="Columbia SC" placeholder="Columbia SC"></div>
          </div>
          <div class="form-row"><label>Industry / Niche</label><input name="niche" placeholder="Men's barber shop serving Columbia SC"></div>
          <div class="wizard-nav">
            <span></span>
            <button type="button" class="btn btn-gold" onclick="wizardNext(2)">Next →</button>
          </div>
        </div>

        <!-- Step 2 -->
        <div class="wizard-panel" id="wp-2">
          <div class="form-row"><label>Services (comma-separated)</label><input name="services" placeholder="haircuts, beard trims, hot towel shaves"></div>
          <div class="form-row"><label>Target Audience</label><input name="target_audience" placeholder="Men 20-50 in Columbia SC wanting a clean cut"></div>
          <div class="form-row"><label>Brand Voice (3 words)</label><input name="voice_tone" placeholder="sharp, professional, community-focused"></div>
          <div class="form-row"><label>CTA URL</label><input name="cta_url" placeholder="https://joesbarbershop.com/book"></div>
          <div class="wizard-nav">
            <button type="button" class="btn btn-ghost" onclick="wizardNext(1)">← Back</button>
            <button type="button" class="btn btn-gold" onclick="wizardNext(3)">Next →</button>
          </div>
        </div>

        <!-- Step 3 -->
        <div class="wizard-panel" id="wp-3">
          <div class="form-grid">
            <div class="form-row"><label>Tier</label>
              <select name="tier">
                <option value="starter">Starter — 1/day · $200/mo</option>
                <option value="growth" selected>Growth — 2/day · $350/mo</option>
                <option value="premium">Premium — 4/day · $500/mo</option>
              </select>
            </div>
            <div class="form-row"><label>Notify Email</label><input name="notify_email" placeholder="joe@example.com"></div>
          </div>
          <div class="form-row"><label>GitHub Repo</label><input name="github_repo" placeholder="joesbarbershop/website"><div class="form-hint">owner/repo format — leave blank if not set up yet</div></div>
          <div class="form-row"><label>Reddit Subreddits (optional)</label><input name="subreddits" placeholder="smallbusiness,columbiasc,barbers"></div>
          <div class="wizard-nav">
            <button type="button" class="btn btn-ghost" onclick="wizardNext(2)">← Back</button>
            <button type="submit" class="btn btn-gold">Create Client ✓</button>
          </div>
        </div>
      </form>
    </div>

    <!-- Onboarding link -->
    <div class="tab-panel" id="panel-onboard-link">
      <p style="font-size:.83rem;color:var(--mid);margin-bottom:20px;line-height:1.7">Send the client a link. They fill out their own brand brief in 3 minutes. Their account is created automatically and you get notified.</p>
      <div class="form-row"><label>Client Email *</label><input id="onboard-email" type="email" placeholder="client@email.com"></div>
      <div class="form-row"><label>Business Name (optional)</label><input id="onboard-biz" placeholder="Joe's Barber Shop"></div>
      <button class="btn btn-gold" style="width:100%" onclick="generateOnboardLink()">Generate Link</button>
      <div id="onboard-link-result" style="display:none;margin-top:16px">
        <div class="onboard-link-box" id="onboard-link-url"></div>
        <button class="btn btn-ghost" style="margin-top:8px;width:100%" onclick="copyOnboardLink()">Copy Link</button>
        <p style="font-size:.75rem;color:var(--dim);margin-top:8px">Valid for 7 days. Client fills it out once, system activates automatically.</p>
      </div>
    </div>
  </div>
</div>

<!-- Client Detail Modal -->
<div class="modal-overlay" id="client-modal">
  <div class="modal" style="max-width:700px">
    <button class="modal-close" onclick="closeModal('client-modal')">×</button>
    <h2 id="client-modal-title"></h2>
    <div class="tab-bar" style="margin-bottom:20px">
      <div class="tab active" onclick="switchClientTab('overview')">Overview</div>
      <div class="tab" onclick="switchClientTab('posts')">Posts</div>
      <div class="tab" onclick="switchClientTab('config')">Config</div>
    </div>
    <div class="tab-panel active" id="cpanel-overview"><div id="client-detail-body"></div></div>
    <div class="tab-panel" id="cpanel-posts"><div id="client-posts-list"></div></div>
    <div class="tab-panel" id="cpanel-config"><div id="client-config-body"></div></div>
  </div>
</div>

<script>
let clients = [];
let activeClientId = null;
let currentWizardStep = 1;

// Date header
document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('en-US', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

async function loadDashboard() {
  const res = await fetch('/api/dashboard').then(r => r.json());
  // Remove skeleton
  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('skeleton'));
  document.getElementById('stat-clients').textContent = res.stats.activeClients;
  document.getElementById('stat-posts-today').textContent = res.stats.postsToday;
  document.getElementById('stat-posts-month').textContent = res.stats.postsThisMonth;
  document.getElementById('stat-mrr').textContent = '$' + (res.stats.mrr / 100).toLocaleString();
  clients = res.clients;
  document.getElementById('client-count').textContent = clients.length + ' client' + (clients.length !== 1 ? 's' : '');
  renderClients(clients);
  renderRecentPosts(res.clients);
}

function renderClients(list) {
  const grid = document.getElementById('client-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg></div><div class="empty-title">No clients yet</div><div class="empty-sub">Add your first client to start generating content.</div><button class="btn btn-gold" onclick="openOnboardModal()">Add Your First Client</button></div>';
    return;
  }
  grid.innerHTML = list.map((c, i) => {
    const sparkBars = Array.from({length: 7}, (_,j) => {
      const filled = j < Math.min(7, Math.floor((c.posts_this_month || 0) / 4));
      return '<div class="spark-bar' + (filled ? ' filled' : '') + '" style="height:' + (8 + j * 3) + 'px"></div>';
    }).join('');
    return '<div class="client-card" onclick="openClient(' + c.id + ')" style="animation-delay:' + (i * 0.05) + 's">' +
      '<div class="client-card-top">' +
        '<div><div class="client-name">' + c.business_name + '</div><div class="client-url">' + (c.city || 'Columbia SC') + '</div></div>' +
        '<span class="tier-badge tier-' + c.tier + '">' + c.tier + '</span>' +
      '</div>' +
      '<div class="client-status status-' + c.status + '"><div class="status-dot"></div>' + c.status + '</div>' +
      '<div class="client-stats"><div class="client-stat"><strong>' + c.posts_per_day + '</strong> posts/day</div><div class="client-stat"><strong>' + (c.posts_this_month || 0) + '</strong> this month</div></div>' +
      '<div class="sparkline">' + sparkBars + '</div>' +
    '</div>';
  }).join('');
}

function renderRecentPosts(clientList) {
  const allPosts = [];
  (clientList || []).forEach(c => {
    if (c.recent_posts) {
      (c.recent_posts || []).forEach(p => allPosts.push({...p, clientName: c.business_name}));
    }
  });
  const list = document.getElementById('recent-posts-list');
  if (!allPosts.length) {
    list.innerHTML = '<div style="color:var(--dim);font-size:.8rem;padding:12px 0">Posts will appear here once clients start publishing.</div>';
    return;
  }
  list.innerHTML = allPosts.slice(0,10).map(p =>
    '<div class="post-row"><div class="post-client-dot"></div><div class="post-title-text">' + p.title + '</div><div class="post-date">' + (p.published_at||'').slice(0,10) + '</div>' +
    '<div class="platform-pills">' + ['x','linkedin','facebook','reddit'].map(pl => '<span class="pill ' + (p[pl+'_posted']?'pill-done':'pill-skip') + '">' + pl + '</span>').join('') + '</div>' +
    '</div>'
  ).join('');
}

async function openClient(id) {
  activeClientId = id;
  const c = clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('client-modal-title').textContent = c.business_name;
  document.getElementById('client-detail-body').innerHTML =
    '<div class="detail-stats">' +
      '<div class="detail-stat"><div class="detail-stat-val">' + (c.posts_this_month||0) + '</div><div class="detail-stat-label">Posts This Month</div></div>' +
      '<div class="detail-stat"><div class="detail-stat-val">$' + ((c.monthly_amount||0)/100).toFixed(0) + '/mo</div><div class="detail-stat-label">Monthly Revenue</div></div>' +
    '</div>' +
    '<div class="info-row"><span class="info-label">Email</span><span class="info-val">' + c.email + '</span></div>' +
    '<div class="info-row"><span class="info-label">Website</span><span class="info-val"><a href="' + c.website + '" target="_blank" style="color:var(--gold)">' + (c.website||'—') + '</a></span></div>' +
    '<div class="info-row"><span class="info-label">Niche</span><span class="info-val">' + (c.niche||'—') + '</span></div>' +
    '<div class="info-row"><span class="info-label">GitHub Repo</span><span class="info-val">' + (c.github_repo||'Not set') + '</span></div>' +
    '<div class="info-row"><span class="info-label">Posts/Day</span><span class="info-val">' + c.posts_per_day + '</span></div>' +
    '<div style="display:flex;gap:8px;margin-top:20px">' +
      '<button class="btn btn-ghost" onclick="triggerPost(' + id + ')">Trigger Post Now</button>' +
      '<button class="btn btn-danger" onclick="pauseClient(' + id + ')">' + (c.status==='active'?'Pause Client':'Activate Client') + '</button>' +
    '</div>';

  const posts = await fetch('/api/clients/' + id + '/posts').then(r => r.json());
  const postList = document.getElementById('client-posts-list');
  if (!posts.length) {
    postList.innerHTML = '<div style="color:var(--dim);font-size:.83rem;padding:20px 0">No posts yet.</div>';
  } else {
    postList.innerHTML = posts.slice(0,20).map(p =>
      '<div class="post-row" style="margin-bottom:8px"><div class="post-title-text">' + p.title + '</div><div class="post-date">' + (p.published_at||'').slice(0,10) + '</div>' +
      '<div class="platform-pills">' + ['x','linkedin','facebook','reddit'].map(pl => '<span class="pill ' + (p[pl+'_posted']?'pill-done':'pill-skip') + '">' + pl + '</span>').join('') + '</div>' +
      '</div>'
    ).join('');
  }
  document.getElementById('client-config-body').innerHTML = '<pre style="font-size:.72rem;color:var(--mid);line-height:1.8;overflow:auto;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px">' + JSON.stringify(c, null, 2) + '</pre>';
  openModal('client-modal');
}

async function submitClient(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const res = await fetch('/api/clients', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}).then(r => r.json());
  if (res.id) { closeModal('onboard-modal'); loadDashboard(); wizardNext(1); }
  else alert('Error: ' + (res.error || 'Unknown'));
}

async function generateOnboardLink() {
  const email = document.getElementById('onboard-email').value;
  const biz   = document.getElementById('onboard-biz').value;
  if (!email) return alert('Email required');
  const res = await fetch('/api/onboarding/link', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,business_name:biz})}).then(r => r.json());
  const url = location.origin + '/onboard/' + res.token;
  document.getElementById('onboard-link-url').textContent = url;
  document.getElementById('onboard-link-result').style.display = 'block';
}

function copyOnboardLink() {
  const url = document.getElementById('onboard-link-url').textContent;
  navigator.clipboard.writeText(url).then(() => { const btn = event.target; btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy Link', 2000); });
}

async function triggerPost(id) {
  if (!confirm('Trigger a post for this client now?')) return;
  const res = await fetch('/api/clients/' + id + '/trigger', {method:'POST'}).then(r => r.json());
  alert(res.message || 'Post triggered');
}

async function pauseClient(id) {
  const c = clients.find(x => x.id === id);
  const newStatus = c.status === 'active' ? 'paused' : 'active';
  if (!confirm((newStatus === 'paused' ? 'Pause' : 'Activate') + ' this client?')) return;
  await fetch('/api/clients/' + id + '/status', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:newStatus})});
  closeModal('client-modal');
  loadDashboard();
}

// Wizard
function wizardNext(step) {
  currentWizardStep = step;
  [1,2,3].forEach(n => {
    document.getElementById('wp-' + n).classList.toggle('active', n === step);
    const sc = document.getElementById('sc-' + n);
    sc.classList.toggle('active', n === step);
    sc.classList.toggle('done', n < step);
    if (n < step) sc.textContent = '✓';
    else sc.textContent = n;
    document.getElementById('ws-' + n).classList.toggle('active', n === step);
    if (n < 3) document.getElementById('sl-' + n).classList.toggle('done', n < step);
  });
}

// Tabs
function switchModalTab(name) {
  document.querySelectorAll('#onboard-modal .tab').forEach((t,i) => t.classList.toggle('active', i === (name==='manual'?0:1)));
  document.getElementById('panel-manual').classList.toggle('active', name==='manual');
  document.getElementById('panel-onboard-link').classList.toggle('active', name==='onboard-link');
}
function switchClientTab(name) {
  const names = ['overview','posts','config'];
  document.querySelectorAll('#client-modal .tab').forEach((t,i) => t.classList.toggle('active', names[i]===name));
  names.forEach(n => document.getElementById('cpanel-'+n).classList.toggle('active', n===name));
}

// Modals
function openOnboardModal() { wizardNext(1); openModal('onboard-modal'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

loadDashboard();
setInterval(loadDashboard, 60000);
</script>
</body>
</html>`;

// ── Client Onboarding Form HTML (public) ──────────────────────────────────────
const ONBOARDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Set Up Your Auto-Blogger — Crown Media Group</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d0d14;--card:#13131e;--border:rgba(201,152,26,.15);--gold:#C9981A;--text:#e8e8f0;--mid:#9999b8}
body{font-family:-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;padding:40px 20px}
.wrap{max-width:600px;margin:0 auto}
.logo{font-size:1.1rem;font-weight:800;color:var(--gold);margin-bottom:8px}
.logo-sub{font-size:.8rem;color:var(--mid);margin-bottom:40px}
h1{font-size:1.8rem;font-weight:800;line-height:1.2;margin-bottom:8px}
.sub{color:var(--mid);font-size:.9rem;margin-bottom:32px;line-height:1.6}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:32px;margin-bottom:24px}
.step-label{font-size:.7rem;font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px}
.step-title{font-size:1.1rem;font-weight:700;margin-bottom:20px}
.form-row{margin-bottom:18px}
label{display:block;font-size:.78rem;font-weight:600;color:var(--mid);margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
input,select,textarea{width:100%;background:#0d0d14;border:1px solid var(--border);border-radius:6px;padding:11px 14px;color:var(--text);font-size:.9rem;outline:none;transition:.2s}
input:focus,select:focus,textarea:focus{border-color:var(--gold)}
textarea{resize:vertical;min-height:80px}
.hint{font-size:.75rem;color:var(--mid);margin-top:5px;line-height:1.5}
.btn-gold{width:100%;padding:14px;background:var(--gold);color:#000;font-weight:800;font-size:1rem;border:none;border-radius:8px;cursor:pointer;margin-top:8px;transition:.2s}
.btn-gold:hover{background:#e8b832}
.success{text-align:center;padding:60px 20px}
.success h2{font-size:1.5rem;font-weight:800;color:var(--gold);margin-bottom:12px}
.success p{color:var(--mid);line-height:1.7}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">Crown Media Group</div>
  <div class="logo-sub">Auto-Blogger Setup</div>
  <h1>Let's set up your automated blog.</h1>
  <p class="sub">Fill this out once. Your blog runs itself after that — researching, writing, and publishing while you focus on your business.</p>
  <form id="onboard-form">
    <div class="card">
      <div class="step-label">Step 1</div>
      <div class="step-title">Your Business</div>
      <div class="form-row"><label>Business Name *</label><input name="business_name" required placeholder="Joe's Barber Shop"></div>
      <div class="form-row"><label>Your Email *</label><input name="email" type="email" required placeholder="joe@example.com"></div>
      <div class="form-row"><label>Website URL</label><input name="website" placeholder="https://joesbarbershop.com"></div>
      <div class="form-row"><label>City / Location</label><input name="city" placeholder="Columbia SC" value="Columbia SC"></div>
    </div>
    <div class="card">
      <div class="step-label">Step 2</div>
      <div class="step-title">Your Business Details</div>
      <div class="form-row">
        <label>What does your business do? *</label>
        <textarea name="niche" required placeholder="We're a men's barber shop in Northeast Columbia. We specialize in fades, tapers, beard grooming, and hot towel shaves."></textarea>
        <div class="hint">Be specific. This becomes the foundation of every blog post your AI writes.</div>
      </div>
      <div class="form-row">
        <label>Services you offer</label>
        <input name="services" placeholder="haircuts, beard trims, hot towel shaves, kids cuts">
      </div>
      <div class="form-row">
        <label>Who is your ideal customer?</label>
        <input name="target_audience" placeholder="Men ages 20-50 in Columbia SC who want a clean, professional look">
      </div>
    </div>
    <div class="card">
      <div class="step-label">Step 3</div>
      <div class="step-title">Your Brand Voice</div>
      <div class="form-row">
        <label>Describe your brand in 3 words</label>
        <input name="voice_tone" placeholder="sharp, community-focused, professional">
      </div>
      <div class="form-row">
        <label>Where should readers go after reading your blog?</label>
        <input name="cta_url" placeholder="https://joesbarbershop.com/book or your phone number">
      </div>
      <div class="form-row">
        <label>What's the CTA?</label>
        <input name="cta_text" placeholder="Book your next cut" value="Book now">
      </div>
      <div class="form-row">
        <label>Topics your blog should never cover</label>
        <input name="avoid_topics" placeholder="competitors, politics, religion">
        <div class="hint">Optional but recommended.</div>
      </div>
    </div>
    <input type="hidden" name="token" id="onboard-token">
    <button type="submit" class="btn-gold">Activate My Auto-Blogger</button>
  </form>
  <div class="success" id="success-state" style="display:none">
    <h2>You're all set.</h2>
    <p>Your Auto-Blogger is activating. You'll receive an email from Crown Media Group within 24 hours with your first post and confirmation that everything is live.<br><br>All Glory to Jesus. 🙏</p>
  </div>
</div>
<script>
const token = location.pathname.split('/').pop();
document.getElementById('onboard-token').value = token;
document.getElementById('onboard-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  const res = await fetch('/api/onboarding/submit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r => r.json());
  if (res.success) {
    document.getElementById('onboard-form').style.display = 'none';
    document.getElementById('success-state').style.display = 'block';
  } else { alert('Error: ' + (res.error || 'Please try again.')); }
});
</script>
</body>
</html>`;

// ── Login page ────────────────────────────────────────────────────────────────
const LOGIN_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Auto-Blogger — Sign In</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0d0d14;color:#e8e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#13131e;border:1px solid rgba(201,152,26,.15);border-radius:14px;padding:40px;width:100%;max-width:380px}.logo{font-size:1.1rem;font-weight:800;color:#C9981A;margin-bottom:4px}.sub{font-size:.78rem;color:#9999b8;margin-bottom:32px}h2{font-size:1.3rem;font-weight:800;margin-bottom:24px}label{display:block;font-size:.75rem;font-weight:600;color:#9999b8;margin-bottom:6px;margin-top:14px}input{width:100%;background:#0d0d14;border:1px solid rgba(201,152,26,.15);border-radius:6px;padding:11px 14px;color:#e8e8f0;font-size:.9rem;outline:none}input:focus{border-color:#C9981A}button{width:100%;padding:13px;background:#C9981A;color:#000;font-weight:800;border:none;border-radius:8px;cursor:pointer;margin-top:20px;font-size:.95rem}</style></head>
<body><div class="card"><div class="logo">Auto-Blogger</div><div class="sub">Crown Media Group Admin</div><h2>Sign In</h2>
<form method="POST" action="/api/login"><label>Email</label><input type="email" name="email" required><label>Password</label><input type="password" name="password" required><button>Sign In</button></form>
</div></body></html>`;

// ── Routes ────────────────────────────────────────────────────────────────────

// Login
app.get('/login', (req, res) => res.send(LOGIN_HTML));
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && verifyPass(password, adminHash)) {
    const token = createSession();
    res.setHeader('Set-Cookie', `ab_session=${token}; HttpOnly; Path=/; Max-Age=${30 * 24 * 3600}; SameSite=Lax`);
    return res.redirect('/');
  }
  res.redirect('/login?error=1');
});
app.get('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'ab_session=; HttpOnly; Path=/; Max-Age=0');
  res.redirect('/login');
});

// Auth gate
app.use((req, res, next) => {
  const pub = ['/login', '/api/login', '/onboard/'].some(p => req.path.startsWith(p)) || req.path.startsWith('/api/onboarding');
  if (pub) return next();
  if (!validSession(req)) return res.redirect('/login');
  next();
});

// Dashboard
app.get('/', (req, res) => res.send(DASHBOARD_HTML));

// API: Dashboard stats
app.get('/api/dashboard', (req, res) => {
  const activeClients  = db.prepare("SELECT COUNT(*) as c FROM clients WHERE status='active'").get().c;
  const postsToday     = db.prepare("SELECT COUNT(*) as c FROM posts WHERE date(created_at)=date('now')").get().c;
  const postsThisMonth = db.prepare("SELECT COUNT(*) as c FROM posts WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')").get().c;
  const mrr            = db.prepare("SELECT SUM(monthly_amount) as s FROM clients WHERE status='active'").get().s || 0;
  const clients        = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM posts p WHERE p.client_id=c.id AND strftime('%Y-%m',p.created_at)=strftime('%Y-%m','now')) as posts_this_month
    FROM clients c ORDER BY c.created_at DESC
  `).all();
  res.json({ stats: { activeClients, postsToday, postsThisMonth, mrr }, clients });
});

// API: Create client
app.post('/api/clients', (req, res) => {
  const { business_name, email, website, city, niche, services, target_audience, voice_tone, cta_url, cta_text, tier, notify_email, github_repo, subreddits } = req.body;
  if (!business_name || !email) return res.status(400).json({ error: 'business_name and email required' });
  const slug = slugify(business_name) + '-' + randomBytes(3).toString('hex');
  const posts_per_day = { starter: 1, growth: 2, premium: 4 }[tier] || 1;
  const monthly_amount = { starter: 20000, growth: 35000, premium: 50000 }[tier] || 20000;
  try {
    const result = db.prepare(`
      INSERT INTO clients (slug, business_name, email, website, city, niche, services, target_audience, voice_tone, cta_url, cta_text, tier, posts_per_day, monthly_amount, notify_email, github_repo, subreddits, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(slug, business_name, email, website, city, niche, services, target_audience, voice_tone, cta_url, cta_text || 'Book now', tier || 'growth', posts_per_day, monthly_amount, notify_email || email, github_repo, subreddits);

    // Write client config file
    writeClientConfig(slug, req.body);

    // Send welcome email
    sendWelcomeEmail(email, business_name, slug).catch(console.error);

    res.json({ id: result.lastInsertRowid, slug });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// API: Get client posts
app.get('/api/clients/:id/posts', (req, res) => {
  const posts = db.prepare('SELECT * FROM posts WHERE client_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);
  res.json(posts);
});

// API: Update client status
app.patch('/api/clients/:id/status', (req, res) => {
  db.prepare('UPDATE clients SET status = ?, updated_at = datetime("now") WHERE id = ?').run(req.body.status, req.params.id);
  res.json({ ok: true });
});

// API: Trigger post for client
app.post('/api/clients/:id/trigger', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  // In production: trigger the GitHub Action workflow_dispatch for the client's repo
  // For now: log the trigger
  console.log(`[Trigger] Manual post trigger for ${client.business_name} (${client.github_repo})`);
  res.json({ message: `Post triggered for ${client.business_name}. Check their GitHub Actions.` });
});

// API: Log post (called by GitHub Actions after each post)
app.post('/api/posts/log', (req, res) => {
  const { client_slug, title, slug, excerpt, category, word_count, x_posted, linkedin_posted, facebook_posted, reddit_posted } = req.body;
  const client = db.prepare('SELECT id FROM clients WHERE slug = ?').get(client_slug);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  db.prepare(`
    INSERT INTO posts (client_id, title, slug, excerpt, category, word_count, x_posted, linkedin_posted, facebook_posted, reddit_posted, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(client.id, title, slug, excerpt, category, word_count || 0, x_posted ? 1 : 0, linkedin_posted ? 1 : 0, facebook_posted ? 1 : 0, reddit_posted ? 1 : 0);
  res.json({ ok: true });
});

// ── Onboarding ─────────────────────────────────────────────────────────────────
app.post('/api/onboarding/link', (req, res) => {
  const { email, business_name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const token = generateOnboardingToken();
  db.prepare('INSERT INTO onboarding_submissions (token, email, data) VALUES (?, ?, ?)').run(token, email, JSON.stringify({ business_name }));
  // Send link to client
  const link = `${process.env.AUTOBLOGGER_URL || 'https://autoblogger.crownmediagroup.co'}/onboard/${token}`;
  resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to: email,
    subject: `Set up your Auto-Blogger — Crown Media Group`,
    html: `<div style="font-family:sans-serif;max-width:520px;padding:40px;background:#0d0d14;color:#e8e8f0">
      <h2 style="color:#C9981A;margin-bottom:16px">Set up your Auto-Blogger</h2>
      <p style="margin-bottom:20px;color:#9999b8">Click the link below to fill out your brand brief. It takes 3 minutes. After you submit, your blog starts running automatically.</p>
      <a href="${link}" style="display:inline-block;background:#C9981A;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:24px">Set Up My Auto-Blogger</a>
      <p style="color:#555;font-size:12px">Crown Media Group &bull; Columbia, SC &bull; crownmediagroup.co</p>
    </div>`,
  }).catch(console.error);
  res.json({ token, link });
});

app.get('/onboard/:token', (req, res) => {
  const row = db.prepare('SELECT * FROM onboarding_submissions WHERE token = ? AND used = 0').get(req.params.token);
  if (!row) return res.status(404).send('<h2>This link has expired or already been used.</h2>');
  res.send(ONBOARDING_HTML);
});

app.post('/api/onboarding/submit', (req, res) => {
  const { token, business_name, email, website, city, niche, services, target_audience, voice_tone, cta_url, cta_text, avoid_topics } = req.body;
  const row = db.prepare('SELECT * FROM onboarding_submissions WHERE token = ? AND used = 0').get(token);
  if (!row) return res.status(400).json({ error: 'Invalid or expired token' });

  // Mark token used
  db.prepare('UPDATE onboarding_submissions SET used = 1 WHERE token = ?').run(token);

  const slug = slugify(business_name || 'client') + '-' + randomBytes(3).toString('hex');
  const tier = 'growth';
  try {
    const result = db.prepare(`
      INSERT INTO clients (slug, business_name, email, website, city, niche, services, target_audience, voice_tone, cta_url, cta_text, tier, posts_per_day, monthly_amount, notify_email, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'growth', 2, 35000, ?, 'onboarding')
    `).run(slug, business_name, email, website, city || 'Columbia SC', niche, services, target_audience, voice_tone, cta_url, cta_text || 'Book now', email);

    writeClientConfig(slug, req.body);

    // Notify King of new onboarding submission
    resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: 'king@crownmediagroup.co',
      subject: `New Auto-Blogger onboarding: ${business_name}`,
      html: `<div style="font-family:sans-serif;max-width:480px;padding:32px;background:#0d0d14;color:#e8e8f0">
        <h2 style="color:#C9981A;margin-bottom:16px">New Onboarding Submission</h2>
        <p><strong>Business:</strong> ${business_name}</p><p><strong>Email:</strong> ${email}</p>
        <p><strong>Niche:</strong> ${niche}</p><p><strong>Website:</strong> ${website}</p>
        <p style="margin-top:20px;color:#555">Log in to activate: <a href="${process.env.AUTOBLOGGER_URL || 'https://autoblogger.crownmediagroup.co'}" style="color:#C9981A">autoblogger.crownmediagroup.co</a></p>
      </div>`,
    }).catch(console.error);

    sendWelcomeEmail(email, business_name, slug).catch(console.error);
    res.json({ success: true, slug });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function writeClientConfig(slug, data) {
  const clientDir = join(CLIENTS_DIR, slug);
  mkdirSync(clientDir, { recursive: true });
  mkdirSync(join(clientDir, 'content', 'blog'), { recursive: true });
  const config = {
    client:   { slug, businessName: data.business_name, website: data.website || '', contactEmail: data.email, notifyEmail: data.notify_email || data.email },
    brand:    { city: data.city || 'Columbia SC', industry: data.niche || '', niche: data.niche || '', services: (data.services || '').split(',').map(s => s.trim()).filter(Boolean), targetAudience: data.target_audience || '', voiceWords: (data.voice_tone || 'professional, helpful').split(',').map(s => s.trim()), voiceTone: data.voice_tone || 'professional, helpful, community-focused', avoidTopics: (data.avoid_topics || '').split(',').map(s => s.trim()).filter(Boolean), ctaUrl: data.cta_url || '', ctaText: data.cta_text || 'Book now' },
    content:  { postsPerDay: { starter: 1, growth: 2, premium: 4 }[data.tier] || 1, skipSabbath: true, categories: ['Local Tips', 'Industry', 'Community', 'Behind the Scenes'], primaryKeywords: [] },
    distribution: { sendEmail: true, generateSocialCaptions: true, instagramHashtags: '' },
    github:   { repo: data.github_repo || '', branch: 'main', blogContentPath: 'content/blog', queuePath: 'content/blog/topics-queue.json' },
    billing:  { tier: data.tier || 'growth', monthlyAmount: { starter: 200, growth: 350, premium: 500 }[data.tier] || 350 },
  };
  writeFileSync(join(clientDir, 'config.json'), JSON.stringify(config, null, 2));
}

async function sendWelcomeEmail(email, businessName, slug) {
  await resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to: email,
    subject: `Your Auto-Blogger is being set up — Crown Media Group`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
      <h1 style="color:#C9981A;font-size:24px;margin-bottom:12px">You're in.</h1>
      <p style="color:#9999b8;margin-bottom:24px;line-height:1.7">We're setting up your Auto-Blogger for <strong style="color:#e8e8f0">${businessName}</strong>. Your first blog post will go live within 24 hours. After that, it posts automatically every single day.</p>
      <p style="color:#9999b8;line-height:1.7">You'll get an email every time a new post goes live — with ready-to-copy social captions for LinkedIn, Facebook, X, and more.</p>
      <p style="color:#555;font-size:12px;margin-top:32px">Questions? Reply to this email. Crown Media Group &bull; Columbia, SC</p>
      <p style="color:#333;font-size:11px;font-style:italic;margin-top:8px">"Whatever you do, work at it with all your heart, as working for the Lord." — Colossians 3:23</p>
    </div>`,
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`\nAuto-Blogger SaaS running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Login: king@crownmediagroup.co / AllGlory2026!`);
  console.log(`\nAll Glory to Jesus.\n`);
});
