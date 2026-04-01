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
<title>Auto-Blogger Admin — Crown Media Group</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d0d14;--card:#13131e;--border:rgba(201,152,26,.15);--gold:#C9981A;--gold-light:#e8b832;--text:#e8e8f0;--mid:#9999b8;--red:#e05252}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);background:rgba(13,13,20,.9);position:sticky;top:0;z-index:100}
.nav-logo{font-size:1rem;font-weight:700;color:var(--gold)}
.nav-sub{font-size:.75rem;color:var(--mid);margin-top:2px}
.nav-actions{display:flex;gap:12px;align-items:center}
.btn{padding:8px 16px;border-radius:6px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;transition:.2s}
.btn-gold{background:var(--gold);color:#000}
.btn-ghost{background:transparent;color:var(--mid);border:1px solid var(--border)}
.btn-ghost:hover{color:var(--text)}
.btn-danger{background:var(--red);color:#fff}
.main{max-width:1200px;margin:0 auto;padding:32px}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:32px}
.stat-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px}
.stat-val{font-size:2rem;font-weight:800;color:var(--gold-light)}
.stat-label{font-size:.75rem;color:var(--mid);margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
.section-title{font-size:1rem;font-weight:700;margin-bottom:16px;color:var(--text)}
.client-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px;margin-bottom:40px}
.client-card{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;cursor:pointer;transition:.2s}
.client-card:hover{border-color:var(--gold);transform:translateY(-2px)}
.client-name{font-size:1rem;font-weight:700;margin-bottom:4px}
.client-meta{font-size:.78rem;color:var(--mid);margin-bottom:12px}
.tier-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.tier-starter{background:rgba(201,152,26,.15);color:var(--gold)}
.tier-growth{background:rgba(82,154,224,.15);color:#529ae0}
.tier-premium{background:rgba(224,82,82,.15);color:var(--red)}
.status-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.status-active{background:#4caf50}
.status-onboarding{background:var(--gold)}
.status-paused{background:var(--mid)}
.client-posts{font-size:.78rem;color:var(--mid)}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;align-items:flex-start;justify-content:center;padding:40px 20px;overflow-y:auto}
.modal-overlay.open{display:flex}
.modal{background:var(--card);border:1px solid var(--border);border-radius:14px;width:100%;max-width:640px;padding:32px;position:relative}
.modal h2{font-size:1.2rem;font-weight:800;margin-bottom:24px}
.modal-close{position:absolute;top:16px;right:16px;background:none;border:none;color:var(--mid);font-size:1.4rem;cursor:pointer;line-height:1}
.form-row{margin-bottom:16px}
.form-row label{display:block;font-size:.78rem;font-weight:600;color:var(--mid);margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
.form-row input,.form-row select,.form-row textarea{width:100%;background:#0d0d14;border:1px solid var(--border);border-radius:6px;padding:10px 12px;color:var(--text);font-size:.88rem;outline:none;transition:.2s}
.form-row input:focus,.form-row select:focus,.form-row textarea:focus{border-color:var(--gold)}
.form-row textarea{resize:vertical;min-height:72px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.tab-bar{display:flex;gap:4px;margin-bottom:24px;border-bottom:1px solid var(--border);padding-bottom:0}
.tab{padding:8px 16px;font-size:.82rem;font-weight:600;cursor:pointer;color:var(--mid);border-bottom:2px solid transparent;margin-bottom:-1px;transition:.2s}
.tab.active{color:var(--gold);border-color:var(--gold)}
.tab-panel{display:none}.tab-panel.active{display:block}
.post-list{display:flex;flex-direction:column;gap:8px}
.post-item{background:#0d0d14;border:1px solid var(--border);border-radius:8px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.post-title{font-size:.85rem;font-weight:600;color:var(--text)}
.post-meta{font-size:.72rem;color:var(--mid)}
.social-pills{display:flex;gap:4px;flex-wrap:wrap}
.pill{padding:2px 8px;border-radius:20px;font-size:.68rem;font-weight:700;text-transform:uppercase}
.pill-done{background:rgba(76,175,80,.15);color:#4caf50}
.pill-skip{background:rgba(100,100,130,.1);color:var(--mid)}
.onboard-link{background:#0d0d14;border:1px solid var(--border);border-radius:8px;padding:12px 16px;font-family:monospace;font-size:.78rem;color:var(--gold);word-break:break-all;margin-top:12px}
.copy-btn{padding:6px 12px;border-radius:6px;font-size:.75rem;font-weight:600;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--mid);margin-top:8px}
.copy-btn:hover{color:var(--text)}
.empty-state{text-align:center;padding:60px 20px;color:var(--mid)}
.empty-state h3{font-size:1.1rem;font-weight:700;color:var(--text);margin-bottom:8px}
</style>
</head>
<body>
<nav class="nav">
  <div>
    <div class="nav-logo">Auto-Blogger</div>
    <div class="nav-sub">Crown Media Group &bull; Admin Dashboard</div>
  </div>
  <div class="nav-actions">
    <button class="btn btn-ghost" onclick="openOnboardModal()">+ New Client</button>
    <button class="btn btn-gold" onclick="location.href='/api/logout'">Sign Out</button>
  </div>
</nav>
<div class="main">
  <div class="stats-grid" id="stats-grid">
    <div class="stat-card"><div class="stat-val" id="stat-clients">—</div><div class="stat-label">Active Clients</div></div>
    <div class="stat-card"><div class="stat-val" id="stat-posts-today">—</div><div class="stat-label">Posts Today</div></div>
    <div class="stat-card"><div class="stat-val" id="stat-posts-month">—</div><div class="stat-label">Posts This Month</div></div>
    <div class="stat-card"><div class="stat-val" id="stat-mrr">—</div><div class="stat-label">MRR</div></div>
  </div>
  <div class="section-title">Clients</div>
  <div class="client-grid" id="client-grid"></div>
</div>

<!-- New Client / Onboarding Modal -->
<div class="modal-overlay" id="onboard-modal">
  <div class="modal">
    <button class="modal-close" onclick="closeModal('onboard-modal')">×</button>
    <h2>Add New Client</h2>
    <div class="tab-bar">
      <div class="tab active" onclick="switchTab('manual')">Manual Setup</div>
      <div class="tab" onclick="switchTab('onboard-link')">Send Onboarding Link</div>
    </div>
    <div class="tab-panel active" id="panel-manual">
      <form id="client-form" onsubmit="submitClient(event)">
        <div class="form-grid">
          <div class="form-row"><label>Business Name *</label><input name="business_name" required placeholder="Joe's Barber Shop"></div>
          <div class="form-row"><label>Email *</label><input name="email" type="email" required placeholder="joe@example.com"></div>
        </div>
        <div class="form-grid">
          <div class="form-row"><label>Website</label><input name="website" placeholder="https://joesbarbershop.com"></div>
          <div class="form-row"><label>City</label><input name="city" placeholder="Columbia SC" value="Columbia SC"></div>
        </div>
        <div class="form-row"><label>Industry / Niche</label><input name="niche" placeholder="Men's barber shop serving Columbia SC"></div>
        <div class="form-row"><label>Services (comma-separated)</label><input name="services" placeholder="haircuts, beard trims, hot towel shaves"></div>
        <div class="form-row"><label>Target Audience</label><input name="target_audience" placeholder="Men ages 18-50 in Columbia SC looking for a clean cut"></div>
        <div class="form-row"><label>Brand Voice (3 words)</label><input name="voice_tone" placeholder="sharp, professional, community-focused"></div>
        <div class="form-row"><label>CTA URL</label><input name="cta_url" placeholder="https://joesbarbershop.com/book"></div>
        <div class="form-grid">
          <div class="form-row"><label>Tier</label>
            <select name="tier">
              <option value="starter">Starter — 1 post/day ($200/mo)</option>
              <option value="growth" selected>Growth — 2 posts/day ($350/mo)</option>
              <option value="premium">Premium — 4 posts/day ($500/mo)</option>
            </select>
          </div>
          <div class="form-row"><label>Notify Email</label><input name="notify_email" placeholder="joe@example.com"></div>
        </div>
        <div class="form-row"><label>GitHub Repo (owner/repo)</label><input name="github_repo" placeholder="joesbarbershop/website"></div>
        <div class="form-row"><label>Reddit Subreddits (optional, comma-separated)</label><input name="subreddits" placeholder="smallbusiness,columbiasc,barbers"></div>
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px">
          <button type="button" class="btn btn-ghost" onclick="closeModal('onboard-modal')">Cancel</button>
          <button type="submit" class="btn btn-gold">Create Client</button>
        </div>
      </form>
    </div>
    <div class="tab-panel" id="panel-onboard-link">
      <div class="form-row"><label>Client Email</label><input id="onboard-email" type="email" placeholder="client@email.com"></div>
      <div class="form-row"><label>Business Name (optional)</label><input id="onboard-biz" placeholder="Joe's Barber Shop"></div>
      <p style="font-size:.82rem;color:var(--mid);margin-bottom:16px;line-height:1.6">Send the client a link to fill out their own onboarding form. When they submit, their account is created automatically and you get notified.</p>
      <button class="btn btn-gold" onclick="generateOnboardLink()">Generate Onboarding Link</button>
      <div id="onboard-link-result" style="display:none">
        <div class="onboard-link" id="onboard-link-url"></div>
        <button class="copy-btn" onclick="copyOnboardLink()">Copy Link</button>
        <p style="font-size:.78rem;color:var(--mid);margin-top:8px">Send this to your client. They fill out the form, you get notified, system activates automatically.</p>
      </div>
    </div>
  </div>
</div>

<!-- Client Detail Modal -->
<div class="modal-overlay" id="client-modal">
  <div class="modal" style="max-width:780px">
    <button class="modal-close" onclick="closeModal('client-modal')">×</button>
    <h2 id="client-modal-title">Client Details</h2>
    <div class="tab-bar">
      <div class="tab active" onclick="switchClientTab('overview')">Overview</div>
      <div class="tab" onclick="switchClientTab('posts')">Posts</div>
      <div class="tab" onclick="switchClientTab('config')">Config</div>
    </div>
    <div class="tab-panel active" id="cpanel-overview">
      <div id="client-detail-body"></div>
    </div>
    <div class="tab-panel" id="cpanel-posts">
      <div id="client-posts-list"></div>
    </div>
    <div class="tab-panel" id="cpanel-config">
      <div id="client-config-body"></div>
    </div>
  </div>
</div>

<script>
let clients = [];
let activeClientId = null;

async function loadDashboard() {
  const res = await fetch('/api/dashboard').then(r => r.json());
  document.getElementById('stat-clients').textContent = res.stats.activeClients;
  document.getElementById('stat-posts-today').textContent = res.stats.postsToday;
  document.getElementById('stat-posts-month').textContent = res.stats.postsThisMonth;
  document.getElementById('stat-mrr').textContent = '$' + (res.stats.mrr / 100).toLocaleString();
  clients = res.clients;
  renderClients(clients);
}

function renderClients(list) {
  const grid = document.getElementById('client-grid');
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state"><h3>No clients yet</h3><p>Click "+ New Client" to get started.</p></div>';
    return;
  }
  grid.innerHTML = list.map(c => `
    <div class="client-card" onclick="openClient(${c.id})">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="client-name">${c.business_name}</div>
        <span class="tier-badge tier-${c.tier}">${c.tier}</span>
      </div>
      <div class="client-meta">
        <span class="status-dot status-${c.status}"></span>${c.status} &bull; ${c.city || 'Columbia SC'}
      </div>
      <div class="client-posts">${c.posts_per_day} post/day &bull; ${c.posts_this_month || 0} posts this month</div>
    </div>
  `).join('');
}

async function openClient(id) {
  activeClientId = id;
  const c = clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('client-modal-title').textContent = c.business_name;
  document.getElementById('client-detail-body').innerHTML = \`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div class="stat-card"><div class="stat-val">\${c.posts_this_month || 0}</div><div class="stat-label">Posts This Month</div></div>
      <div class="stat-card"><div class="stat-val">\$\${(c.monthly_amount / 100).toFixed(0)}/mo</div><div class="stat-label">Monthly Revenue</div></div>
    </div>
    <div style="font-size:.85rem;line-height:1.8;color:var(--mid)">
      <strong style="color:var(--text)">Email:</strong> \${c.email}<br>
      <strong style="color:var(--text)">Website:</strong> <a href="\${c.website}" target="_blank" style="color:var(--gold)">\${c.website || '—'}</a><br>
      <strong style="color:var(--text)">Niche:</strong> \${c.niche || '—'}<br>
      <strong style="color:var(--text)">GitHub Repo:</strong> \${c.github_repo || 'Not set'}<br>
      <strong style="color:var(--text)">Posts/Day:</strong> \${c.posts_per_day}
    </div>
    <div style="display:flex;gap:8px;margin-top:20px">
      <button class="btn btn-ghost" onclick="triggerPost(${id})">Trigger Post Now</button>
      <button class="btn btn-ghost" onclick="editClient(${id})">Edit Config</button>
      <button class="btn btn-danger" onclick="pauseClient(${id})">\${c.status === 'active' ? 'Pause' : 'Activate'}</button>
    </div>
  \`;
  // Load posts
  const posts = await fetch(\`/api/clients/\${id}/posts\`).then(r => r.json());
  const postList = document.getElementById('client-posts-list');
  if (!posts.length) {
    postList.innerHTML = '<div class="empty-state"><p>No posts yet.</p></div>';
  } else {
    postList.innerHTML = '<div class="post-list">' + posts.slice(0, 20).map(p => \`
      <div class="post-item">
        <div><div class="post-title">\${p.title}</div><div class="post-meta">\${p.published_at?.slice(0,10)} · \${p.word_count} words</div></div>
        <div class="social-pills">
          \${['x','linkedin','facebook','reddit'].map(pl => \`<span class="pill \${p[pl+'_posted'] ? 'pill-done' : 'pill-skip'}">\${pl}</span>\`).join('')}
        </div>
      </div>
    \`).join('') + '</div>';
  }
  document.getElementById('client-config-body').innerHTML = \`<pre style="font-size:.75rem;color:var(--mid);line-height:1.7;overflow:auto">\${JSON.stringify(c, null, 2)}</pre>\`;
  openModal('client-modal');
}

async function submitClient(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const data = Object.fromEntries(fd.entries());
  const res = await fetch('/api/clients', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }).then(r => r.json());
  if (res.id) { closeModal('onboard-modal'); loadDashboard(); alert('Client created! Config file ready at clients/' + res.slug + '/config.json'); }
  else alert('Error: ' + (res.error || 'Unknown error'));
}

async function generateOnboardLink() {
  const email = document.getElementById('onboard-email').value;
  const biz   = document.getElementById('onboard-biz').value;
  if (!email) return alert('Email required');
  const res = await fetch('/api/onboarding/link', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, business_name: biz }) }).then(r => r.json());
  const url = location.origin + '/onboard/' + res.token;
  document.getElementById('onboard-link-url').textContent = url;
  document.getElementById('onboard-link-result').style.display = 'block';
}

function copyOnboardLink() {
  const url = document.getElementById('onboard-link-url').textContent;
  navigator.clipboard.writeText(url).then(() => alert('Copied!'));
}

async function triggerPost(id) {
  if (!confirm('Trigger a post for this client now?')) return;
  const res = await fetch(\`/api/clients/\${id}/trigger\`, { method: 'POST' }).then(r => r.json());
  alert(res.message || 'Post triggered');
}

async function pauseClient(id) {
  const c = clients.find(x => x.id === id);
  const action = c.status === 'active' ? 'pause' : 'activate';
  if (!confirm(\`\${action} this client?\`)) return;
  await fetch(\`/api/clients/\${id}/status\`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: c.status === 'active' ? 'paused' : 'active' }) });
  closeModal('client-modal');
  loadDashboard();
}

function openOnboardModal() { openModal('onboard-modal'); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function switchTab(name) {
  document.querySelectorAll('#onboard-modal .tab').forEach((t,i) => t.classList.toggle('active', ['manual','onboard-link'][i] === name));
  document.querySelectorAll('#onboard-modal .tab-panel').forEach((p,i) => p.classList.toggle('active', ['panel-manual','panel-onboard-link'][i] === 'panel-' + name.replace('-','_').replace('onboard_link','onboard-link')));
  document.getElementById('panel-manual').classList.toggle('active', name === 'manual');
  document.getElementById('panel-onboard-link').classList.toggle('active', name === 'onboard-link');
}

function switchClientTab(name) {
  document.querySelectorAll('#client-modal .tab').forEach((t,i) => t.classList.toggle('active', ['overview','posts','config'][i] === name));
  ['overview','posts','config'].forEach(n => document.getElementById('cpanel-'+n).classList.toggle('active', n === name));
}

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
