// server.js — Crown Media Group CRM
// Port 3001 | SQLite local | Twilio SMS | Nodemailer email | Claude AI drafts

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createTransport } from 'nodemailer';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load env: try local .env first, then root
const rootEnv = join(__dirname, '../../.env');
const localEnv = join(__dirname, '.env');
for (const p of [rootEnv, localEnv]) {
  if (existsSync(p)) {
    const lines = readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const [k, ...v] = line.split('=');
      if (k && v.length && !process.env[k.trim()]) {
        process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

import db from './database.js';

const app   = express();
const PORT  = process.env.PORT || process.env.CRM_PORT || 3001;

// ── Crypto helpers ────────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split('$');
    const inputHash = scryptSync(password, salt, 64);
    return timingSafeEqual(Buffer.from(hash, 'hex'), inputHash);
  } catch { return false; }
}

function createSession(userId, workspaceId) {
  const token   = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, workspace_id, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, workspaceId, expires);
  return token;
}

function validateSession(token) {
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > datetime('now')").get(token);
  if (!session) return null;
  const user = db.prepare('SELECT id, email, role, workspace_id FROM users WHERE id = ?').get(session.user_id);
  if (!user) return null;
  return { user, workspaceId: session.workspace_id };
}

function getCookie(req, name) {
  const str = req.headers.cookie || '';
  for (const part of str.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

// ── Seed King's user on first start ──────────────────────────────────────────
const KING_EMAIL = 'king@crownmediagroup.co';
if (!db.prepare('SELECT id FROM users WHERE email = ?').get(KING_EMAIL)) {
  const initPassword = process.env.KING_PASSWORD || randomBytes(8).toString('hex');
  db.prepare("INSERT INTO users (email, password_hash, role, workspace_id) VALUES (?, ?, 'superadmin', 1)").run(KING_EMAIL, hashPassword(initPassword));
  console.log('\n[CRM AUTH] ─────────────────────────────────────────────');
  console.log(`  King's login created — save this password now:`);
  console.log(`  Email:    ${KING_EMAIL}`);
  console.log(`  Password: ${initPassword}`);
  console.log('[CRM AUTH] ─────────────────────────────────────────────\n');
}

// ── Security headers (helmet v8 — covers X-Content-Type-Options, X-Frame-Options,
//    X-XSS-Protection, Referrer-Policy, CSP, plus Permissions-Policy, COEP, COOP,
//    Origin-Agent-Cluster, X-DNS-Prefetch-Control) ────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
      imgSrc:     ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
      connectSrc: ["'self'", 'https://accounts.google.com', 'https://oauth2.googleapis.com'],
      frameSrc:   ["'self'", 'https://accounts.google.com'],
    },
  },
  frameguard: false,
}));

// ── Trust proxy (Railway / Netlify sit behind a load balancer) ────────────────
app.set('trust proxy', 1);

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Wait 15 minutes and try again.' },
});
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const massLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Mass send limit reached. Max 5 per hour.' },
});

// ── Periodic session cleanup (every hour) ────────────────────────────────────
setInterval(() => {
  const deleted = db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  if (deleted.changes > 0) console.log(`[CRM] Cleaned ${deleted.changes} expired sessions`);
}, 60 * 60 * 1000);

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use('/api', apiLimiter);

// ── Serve login.html for / and /index.html if not authenticated ───────────────
app.get('/', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'login.html'));
});

// Static files (CSS, JS, login.html) — index:false so /  is handled above
app.use(express.static(join(__dirname, 'public'), { index: false }));

// ── Email open/click tracking (public — no auth required) ─────────────────────
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

app.get('/track/open/:token.png', (req, res) => {
  const msg = db.prepare('SELECT id FROM messages_sent WHERE track_token = ?').get(req.params.token);
  if (msg) db.prepare("UPDATE messages_sent SET open_count = open_count + 1, opened_at = COALESCE(opened_at, datetime('now')) WHERE id = ?").run(msg.id);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.end(PIXEL_PNG);
});

app.get('/track/click/:token', (req, res) => {
  const msg = db.prepare('SELECT id FROM messages_sent WHERE track_token = ?').get(req.params.token);
  if (msg) db.prepare("UPDATE messages_sent SET clicked_at = COALESCE(clicked_at, datetime('now')) WHERE id = ?").run(msg.id);
  res.redirect(req.query.url || 'https://crownmediagroup.co');
});

// ── Config (white-label ready) ────────────────────────────────────────────────
const CONFIG = {
  agencyName:   'Crown Media Group',
  ownerName:    'King',
  website:      'crownmediagroup.co',
  primaryColor: '#C9A84C',
  bgColor:      '#0A1628',
  aiSystemPrompt: `You are King's outreach assistant at Crown Media Group, a faith-driven AI-powered digital marketing agency in Columbia, SC. King is 27, went through the NxLevel entrepreneurship program with these contacts, and genuinely wants to help them grow. Generate outreach in King's voice: bold, warm, direct, zero fluff, zero corporate speak. Always reference something specific and real about their business. The CTA is always a free 15-minute strategy call at crownmediagroup.co. Sound like a classmate who noticed their potential — not a salesperson. Faith-aligned when appropriate.`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split('T')[0]; }

function interpolate(text, contact, ownerName = 'King', agencyName = 'Crown Media Group') {
  return text
    .replace(/\{\{name\}\}/gi,     contact.name?.split(' ')[0] || '')
    .replace(/\{\{business\}\}/gi, contact.business || '')
    .replace(/\{\{myname\}\}/gi,   ownerName)
    .replace(/\{\{agency\}\}/gi,   agencyName);
}

function normalizePhone(raw = '') {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw;
}

// ── Twilio (graceful disable) ─────────────────────────────────────────────────
let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const { default: twilio } = await import('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('[CRM] Twilio ready');
} else {
  console.warn('[CRM] Twilio not configured — SMS disabled');
}

// ── Nodemailer ────────────────────────────────────────────────────────────────
let mailer = null;
if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  mailer = createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  console.log('[CRM] Gmail ready');
} else {
  console.warn('[CRM] Gmail not configured — email disabled. Set GMAIL_USER + GMAIL_APP_PASSWORD in .env');
}

// ── Anthropic ─────────────────────────────────────────────────────────────────
let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  console.log('[CRM] Anthropic AI ready');
} else {
  console.warn('[CRM] ANTHROPIC_API_KEY not set — AI drafts disabled');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API ROUTES (no auth required)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Login ─────────────────────────────────────────────────────────────────────
app.post('/api/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;

  // Hard length caps — prevent oversized inputs from hitting scrypt
  if (!email || !password)            return res.status(400).json({ error: 'Email and password required' });
  if (email.length > 254)             return res.status(400).json({ error: 'Invalid email' });
  if (password.length > 128)          return res.status(400).json({ error: 'Invalid password' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());

  // Always run verifyPassword even if user not found — prevents timing-based user enumeration
  const dummyHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$' + 'a'.repeat(128);
  const valid = user ? verifyPassword(password, user.password_hash) : (verifyPassword(password, dummyHash), false);

  if (!valid) {
    // Generic error — never reveal whether email or password was wrong
    return res.status(401).json({ error: 'Wrong email or password.' });
  }

  // Login success — clean expired sessions
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  const token = createSession(user.id, user.workspace_id);
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', `crm_session=${token}; ${cookieOpts}`);
  res.json({ ok: true, role: user.role, workspaceId: user.workspace_id });
});

// ── Logout ────────────────────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
  const token = getCookie(req, 'crm_session');
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'crm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

// ── Register (free trial signup) ──────────────────────────────────────────────
app.post('/api/register', loginLimiter, (req, res) => {
  const { name, email, password, businessName } = req.body;

  if (!name || !email || !password || !businessName)
    return res.status(400).json({ error: 'All fields are required.' });
  if (email.length > 254)    return res.status(400).json({ error: 'Invalid email.' });
  if (password.length < 8)   return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password.length > 128) return res.status(400).json({ error: 'Password too long.' });
  if (name.length > 100 || businessName.length > 150)
    return res.status(400).json({ error: 'Name or business name too long.' });

  const normalizedEmail = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists.' });

  // Create workspace with 33-day trial
  const trialEnds = new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString();
  const ws = db.prepare(
    "INSERT INTO workspaces (name, subscription_status, trial_ends_at) VALUES (?, 'trial', ?)"
  ).run(businessName.trim(), trialEnds);
  const workspaceId = ws.lastInsertRowid;

  // Create user
  const user = db.prepare(
    "INSERT INTO users (email, password_hash, role, workspace_id) VALUES (?, ?, 'rep', ?)"
  ).run(normalizedEmail, hashPassword(password), workspaceId);

  // Auto-login
  const token = createSession(user.lastInsertRowid, workspaceId);
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', `crm_session=${token}; ${cookieOpts}`);
  res.json({ ok: true, trialEnds });

  // Welcome email (fire-and-forget — don't delay response)
  if (mailer) {
    const trialEndFmt = new Date(trialEnds).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    mailer.sendMail({
      from: `"Crown Media Group" <${process.env.GMAIL_USER}>`,
      to: normalizedEmail,
      subject: `Welcome to Crown Media Group CRM — Your 33-Day Trial Starts Now`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0A1628;color:#e8e8e8;border-radius:8px;overflow:hidden">
  <div style="background:#C9A84C;padding:24px 32px">
    <h1 style="margin:0;font-size:22px;color:#0A1628">Crown Media Group CRM</h1>
  </div>
  <div style="padding:32px">
    <p style="font-size:18px;margin:0 0 16px">Welcome, ${name.split(' ')[0]}.</p>
    <p style="margin:0 0 16px;line-height:1.6">Your free trial is live. You have <strong style="color:#C9A84C">33 days</strong> to explore the full CRM — contacts, outreach, AI drafts, and more.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="padding:8px 0;color:#aaa;width:140px">Business</td><td style="padding:8px 0;font-weight:bold">${businessName.trim()}</td></tr>
      <tr><td style="padding:8px 0;color:#aaa">Email</td><td style="padding:8px 0">${normalizedEmail}</td></tr>
      <tr><td style="padding:8px 0;color:#aaa">Trial ends</td><td style="padding:8px 0;color:#C9A84C;font-weight:bold">${trialEndFmt}</td></tr>
    </table>
    <a href="https://crm.crownmediagroup.co" style="display:inline-block;background:#C9A84C;color:#0A1628;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px">Open My CRM</a>
    <p style="margin:24px 0 0;font-size:13px;color:#888">Questions? Reply to this email or reach King directly at king@crownmediagroup.co</p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #1e3a5f;font-size:12px;color:#666">All Glory to Jesus Global LLC | Crown Media Group | Columbia, SC</div>
</div>`,
    }).catch(err => console.error('[Welcome email]', err.message));
  }
});

// ── Google OAuth (Sign in with Google — ID token verification) ────────────────
app.post('/api/auth/google', loginLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential || typeof credential !== 'string' || credential.length > 4096)
    return res.status(400).json({ error: 'Invalid credential.' });

  try {
    // Verify ID token with Google's tokeninfo endpoint (no SDK needed)
    const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!response.ok) return res.status(401).json({ error: 'Google verification failed.' });
    const payload = await response.json();

    // Validate audience matches our client ID
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && payload.aud !== clientId)
      return res.status(401).json({ error: 'Token audience mismatch.' });

    const googleId    = payload.sub;
    const email       = payload.email?.toLowerCase().trim();
    const displayName = payload.name || email?.split('@')[0] || 'User';
    const avatarUrl   = payload.picture || null;

    if (!googleId || !email) return res.status(400).json({ error: 'Incomplete Google profile.' });

    // Find existing user by google_id or email
    let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(googleId, email);

    if (user) {
      // Update google_id + avatar if this is first Google login for existing email account
      db.prepare('UPDATE users SET google_id = ?, display_name = ?, avatar_url = ? WHERE id = ?')
        .run(googleId, displayName, avatarUrl, user.id);
    } else {
      // New user — create workspace + account
      const trialEnds = new Date(Date.now() + 33 * 24 * 60 * 60 * 1000).toISOString();
      const ws = db.prepare(
        "INSERT INTO workspaces (name, subscription_status, trial_ends_at) VALUES (?, 'trial', ?)"
      ).run(displayName + "'s Workspace", trialEnds);

      const result = db.prepare(
        "INSERT INTO users (email, password_hash, role, workspace_id, google_id, display_name, avatar_url) VALUES (?, ?, 'rep', ?, ?, ?, ?)"
      ).run(email, 'google:' + googleId, ws.lastInsertRowid, googleId, displayName, avatarUrl);

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

      // Welcome email for new Google signup (fire-and-forget)
      if (mailer) {
        const trialEndFmt = new Date(trialEnds).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        mailer.sendMail({
          from: `"Crown Media Group" <${process.env.GMAIL_USER}>`,
          to: email,
          subject: `Welcome to Crown Media Group CRM — Your 33-Day Trial Starts Now`,
          html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0A1628;color:#e8e8e8;border-radius:8px;overflow:hidden">
  <div style="background:#C9A84C;padding:24px 32px">
    <h1 style="margin:0;font-size:22px;color:#0A1628">Crown Media Group CRM</h1>
  </div>
  <div style="padding:32px">
    <p style="font-size:18px;margin:0 0 16px">Welcome, ${displayName.split(' ')[0]}.</p>
    <p style="margin:0 0 16px;line-height:1.6">Your free trial is live. You have <strong style="color:#C9A84C">33 days</strong> to explore the full CRM — contacts, outreach, AI drafts, and more.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="padding:8px 0;color:#aaa;width:140px">Email</td><td style="padding:8px 0">${email}</td></tr>
      <tr><td style="padding:8px 0;color:#aaa">Trial ends</td><td style="padding:8px 0;color:#C9A84C;font-weight:bold">${trialEndFmt}</td></tr>
    </table>
    <a href="https://crm.crownmediagroup.co" style="display:inline-block;background:#C9A84C;color:#0A1628;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px">Open My CRM</a>
    <p style="margin:24px 0 0;font-size:13px;color:#888">Questions? Reply to this email or reach King directly at king@crownmediagroup.co</p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #1e3a5f;font-size:12px;color:#666">All Glory to Jesus Global LLC | Crown Media Group | Columbia, SC</div>
</div>`,
        }).catch(err => console.error('[Welcome email - Google]', err.message));
      }
    }

    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    const token = createSession(user.id, user.workspace_id);
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOpts = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', `crm_session=${token}; ${cookieOpts}`);
    res.json({ ok: true, workspaceId: user.workspace_id });
  } catch (err) {
    console.error('[Google OAuth]', err.message);
    res.status(500).json({ error: 'Authentication failed. Try again.' });
  }
});

// ── Public config (exposes non-secret env vars to login page) ─────────────────
app.get('/api/config/public', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// ── Branding (public — used by login page and dashboard) ──────────────────────
app.get('/api/branding', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  const wsId = session?.workspaceId ?? 1;
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId);
  res.json({
    name:         workspace?.name         || 'CRM',
    primaryColor: workspace?.primary_color || '#C9A84C',
    logoUrl:      workspace?.logo_url      || null,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE — applies to all /api/* routes below this point
// ═══════════════════════════════════════════════════════════════════════════════

app.use('/api', (req, res, next) => {
  const publicPaths = ['/login', '/logout', '/branding', '/register', '/auth/google', '/config/public'];
  if (publicPaths.includes(req.path)) return next();
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.user        = session.user;
  req.workspaceId = session.workspaceId;

  // ── Subscription check (non-superadmin only) ─────────────────────────────
  if (req.user.role !== 'superadmin') {
    const ws  = db.prepare('SELECT subscription_status, trial_ends_at, subscription_ends_at FROM workspaces WHERE id = ?').get(req.workspaceId);
    const now = new Date().toISOString();
    if (ws?.subscription_status === 'trial' && ws.trial_ends_at && ws.trial_ends_at < now) {
      db.prepare("UPDATE workspaces SET subscription_status = 'expired' WHERE id = ?").run(req.workspaceId);
      return res.status(402).json({ error: 'trial_expired', message: 'Your 33-day free trial has ended. Contact Crown Media Group to activate your subscription at $97/month.' });
    }
    if (ws?.subscription_status === 'expired' || ws?.subscription_status === 'cancelled') {
      return res.status(402).json({ error: 'subscription_expired', message: 'Your subscription has ended. Contact king@crownmediagroup.co to reactivate.' });
    }
  }

  next();
});

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROTECTED API ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ── Me ────────────────────────────────────────────────────────────────────────
app.get('/api/me', (req, res) => {
  const workspace = db.prepare('SELECT id, name, primary_color, subscription_status, trial_ends_at, subscription_ends_at FROM workspaces WHERE id = ?').get(req.workspaceId);
  let trialDaysLeft = null;
  if (workspace?.trial_ends_at && workspace?.subscription_status === 'trial') {
    const diff = new Date(workspace.trial_ends_at) - new Date();
    trialDaysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  res.json({ user: { id: req.user.id, email: req.user.email, role: req.user.role }, workspace, trialDaysLeft });
});

// ── Admin: create workspace ───────────────────────────────────────────────────
app.post('/api/admin/workspaces', requireSuperAdmin, (req, res) => {
  const { name, primaryColor = '#C9A84C' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const result = db.prepare(
    "INSERT INTO workspaces (name, primary_color, trial_ends_at, subscription_status) VALUES (?, ?, datetime('now', '+33 days'), 'trial')"
  ).run(name, primaryColor);
  res.json({ ok: true, workspaceId: result.lastInsertRowid });
});

// ── Admin: create user ────────────────────────────────────────────────────────
app.post('/api/admin/users', requireSuperAdmin, (req, res) => {
  const { email, password, workspaceId, role = 'rep' } = req.body;
  if (!email || !password || !workspaceId) return res.status(400).json({ error: 'email, password, workspaceId required' });
  try {
    const result = db.prepare('INSERT INTO users (email, password_hash, role, workspace_id) VALUES (?, ?, ?, ?)').run(email.toLowerCase().trim(), hashPassword(password), role, workspaceId);
    res.json({ ok: true, userId: result.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Email already exists' });
  }
});

// ── Admin: list all workspaces ────────────────────────────────────────────────
app.get('/api/admin/workspaces', requireSuperAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, name, primary_color, subscription_status, trial_ends_at, subscription_ends_at, created_at FROM workspaces').all());
});

// ── Admin: manage subscription ────────────────────────────────────────────────
app.put('/api/admin/workspaces/:id/subscription', requireSuperAdmin, (req, res) => {
  const { status, extendDays } = req.body;
  const validStatuses = ['trial', 'active', 'expired', 'cancelled'];
  const wsId = parseInt(req.params.id);
  if (isNaN(wsId)) return res.status(400).json({ error: 'Invalid workspace id' });

  if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (status) {
    if (status === 'active') {
      db.prepare("UPDATE workspaces SET subscription_status = 'active', subscription_ends_at = datetime('now', '+30 days') WHERE id = ?").run(wsId);
    } else {
      db.prepare('UPDATE workspaces SET subscription_status = ? WHERE id = ?').run(status, wsId);
    }
  }

  if (extendDays) {
    const days = parseInt(extendDays);
    if (isNaN(days) || days < 1 || days > 365) return res.status(400).json({ error: 'extendDays must be 1-365' });
    db.prepare(`UPDATE workspaces SET trial_ends_at = datetime(COALESCE(trial_ends_at, 'now'), '+${days} days'), subscription_status = 'trial' WHERE id = ?`).run(wsId);
  }

  res.json({ ok: true });
});

// ── Admin: trial dashboard ────────────────────────────────────────────────────
app.get('/api/admin/trials', requireSuperAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT
      w.id, w.name, w.subscription_status, w.trial_ends_at, w.subscription_ends_at, w.created_at,
      u.email, u.display_name,
      CAST(
        (julianday(w.trial_ends_at) - julianday('now'))
      AS INTEGER) AS days_left
    FROM workspaces w
    LEFT JOIN users u ON u.workspace_id = w.id
    WHERE w.id != 1
    ORDER BY w.trial_ends_at ASC
  `).all();
  res.json(rows);
});

// ── Admin: send manual trial reminder ─────────────────────────────────────────
app.post('/api/admin/trials/:id/remind', requireSuperAdmin, (req, res) => {
  const wsId = parseInt(req.params.id);
  if (isNaN(wsId)) return res.status(400).json({ error: 'Invalid id' });
  const row = db.prepare(`
    SELECT w.name, w.trial_ends_at, u.email, u.display_name
    FROM workspaces w LEFT JOIN users u ON u.workspace_id = w.id
    WHERE w.id = ?
  `).get(wsId);
  if (!row || !row.email) return res.status(404).json({ error: 'Workspace/user not found' });

  if (!mailer) return res.status(503).json({ error: 'Email not configured' });

  const daysLeft = Math.max(0, Math.ceil((new Date(row.trial_ends_at) - new Date()) / 86400000));
  const firstName = (row.display_name || row.email)?.split(' ')[0];
  const trialEndFmt = new Date(row.trial_ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  mailer.sendMail({
    from: `"Crown Media Group" <${process.env.GMAIL_USER}>`,
    to: row.email,
    subject: `${daysLeft <= 3 ? 'Last chance — ' : ''}Your Crown Media Group CRM trial ends ${daysLeft <= 0 ? 'today' : `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}`,
    html: `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;background:#0A1628;color:#e8e8e8;border-radius:8px;overflow:hidden">
  <div style="background:#C9A84C;padding:24px 32px">
    <h1 style="margin:0;font-size:22px;color:#0A1628">Crown Media Group CRM</h1>
  </div>
  <div style="padding:32px">
    <p style="font-size:18px;margin:0 0 16px">Hey ${firstName},</p>
    <p style="margin:0 0 16px;line-height:1.6">Your free trial ${daysLeft <= 0 ? 'has ended' : `ends on <strong style="color:#C9A84C">${trialEndFmt}</strong>`}. Don't lose your contacts and history.</p>
    <p style="margin:0 0 24px;line-height:1.6">Activate your subscription for <strong>$97/month</strong> and keep full access — AI outreach drafts, contact management, email tracking, and more.</p>
    <a href="https://crm.crownmediagroup.co" style="display:inline-block;background:#C9A84C;color:#0A1628;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:15px">Keep My Access</a>
    <p style="margin:24px 0 0;font-size:13px;color:#888">Reply to this email or reach King at king@crownmediagroup.co to activate.</p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #1e3a5f;font-size:12px;color:#666">All Glory to Jesus Global LLC | Crown Media Group | Columbia, SC</div>
</div>`,
  }).then(() => res.json({ ok: true }))
    .catch(err => res.status(500).json({ error: err.message }));
});

// ── Admin: serve trials dashboard page ────────────────────────────────────────
app.get('/trials', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session || session.user.role !== 'superadmin') return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'trials.html'));
});

// ── Config ────────────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const s = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(s.map(r => [r.key, r.value]));
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.workspaceId);
  res.json({
    ...CONFIG,
    ...settings,
    agencyName:    workspace?.name         || CONFIG.agencyName,
    primaryColor:  workspace?.primary_color || CONFIG.primaryColor,
    twilioEnabled: !!twilioClient,
    emailEnabled:  !!mailer,
    aiEnabled:     !!anthropic,
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const wsId       = req.workspaceId;
  const base       = 'FROM contacts WHERE workspace_id = ? AND (archived = 0 OR archived IS NULL)';
  const total      = db.prepare(`SELECT COUNT(*) as c ${base} AND id != 3`).get(wsId).c;
  const notContacted = db.prepare(`SELECT COUNT(*) as c ${base} AND id != 3 AND status = 'Not Contacted'`).get(wsId).c;
  const clients    = db.prepare(`SELECT COUNT(*) as c ${base} AND status = 'Client'`).get(wsId).c;
  const hot        = db.prepare(`SELECT COUNT(*) as c ${base} AND id != 3 AND priority = 'Hot'`).get(wsId).c;
  const inPipeline = db.prepare(`SELECT COUNT(*) as c ${base} AND id != 3 AND status NOT IN ('Not Contacted','Client','Not Interested')`).get(wsId).c;
  const todayStart = todayISO() + 'T00:00:00';
  const todayEnd   = todayISO() + 'T23:59:59';
  const reachedToday = db.prepare("SELECT COUNT(DISTINCT contact_id) as c FROM interactions WHERE date >= ? AND date <= ?").get(todayStart, todayEnd).c;
  const dailyGoal  = parseInt(db.prepare("SELECT value FROM settings WHERE key='daily_goal'").get()?.value || '10');
  res.json({ total, notContacted, clients, hot, inPipeline, reachedToday, dailyGoal });
});

// ── Contacts list ─────────────────────────────────────────────────────────────
app.get('/api/contacts', (req, res) => {
  const { status, priority, search, sort = 'id', dir = 'asc', showArchived } = req.query;
  const validCols = ['id','name','business','status','priority','last_contacted','created_at'];
  const col   = validCols.includes(sort) ? sort : 'id';
  const order = dir === 'desc' ? 'DESC' : 'ASC';

  const where  = ['workspace_id = ?'];
  const params = [req.workspaceId];

  if (showArchived !== 'true') where.push('(archived = 0 OR archived IS NULL)');
  if (status)   { where.push('status = ?');   params.push(status); }
  if (priority) { where.push('priority = ?'); params.push(priority); }
  if (search)   {
    where.push('(name LIKE ? OR business LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  res.json(db.prepare(`SELECT * FROM contacts WHERE ${where.join(' AND ')} ORDER BY ${col} ${order}`).all(...params));
});

// ── Create new contact ────────────────────────────────────────────────────────
app.post('/api/contacts', (req, res) => {
  const { name = '', business = '', phone = '', email = '', source = 'Manual', priority = 'Normal', notes = '' } = req.body;
  if (!name.trim()) return res.status(400).json({ error: 'name required' });
  const result = db.prepare(
    'INSERT INTO contacts (name, business, phone, email, source, priority, notes, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name.trim(), business, phone, email, source, priority, notes, req.workspaceId);
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(result.lastInsertRowid);
  res.json({ ok: true, contact });
});

// ── Archive contact (soft delete) ─────────────────────────────────────────────
app.delete('/api/contacts/:id', (req, res) => {
  db.prepare('UPDATE contacts SET archived = 1 WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId);
  res.json({ ok: true });
});

// ── Unarchive contact ─────────────────────────────────────────────────────────
app.post('/api/contacts/:id/unarchive', (req, res) => {
  db.prepare('UPDATE contacts SET archived = 0 WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId);
  res.json({ ok: true });
});

// ── Bulk CSV import ───────────────────────────────────────────────────────────
app.post('/api/contacts/import', (req, res) => {
  const { contacts } = req.body;
  if (!contacts?.length) return res.status(400).json({ error: 'contacts array required' });
  const checkPhone = db.prepare('SELECT id FROM contacts WHERE phone = ? AND workspace_id = ? AND length(trim(phone)) > 0');
  const checkEmail = db.prepare('SELECT id FROM contacts WHERE email = ? AND workspace_id = ? AND length(trim(email)) > 0');
  const insert     = db.prepare('INSERT INTO contacts (name, business, phone, email, source, notes, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
  let added = 0, skipped = 0;
  db.exec('BEGIN');
  for (const c of contacts) {
    const { name = '', business = '', phone = '', email = '', source = 'CSV Import', notes = '' } = c;
    if (!name.trim()) { skipped++; continue; }
    if (phone && checkPhone.get(phone, req.workspaceId)) { skipped++; continue; }
    if (email && checkEmail.get(email, req.workspaceId)) { skipped++; continue; }
    insert.run(name.trim(), business, phone, email, source, notes, req.workspaceId);
    added++;
  }
  db.exec('COMMIT');
  res.json({ ok: true, added, skipped });
});

// ── Single contact ────────────────────────────────────────────────────────────
app.get('/api/contacts/:id', (req, res) => {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  const interactions = db.prepare('SELECT * FROM interactions WHERE contact_id = ? ORDER BY date DESC LIMIT 20').all(req.params.id);
  const messages     = db.prepare('SELECT * FROM messages_sent WHERE contact_id = ? ORDER BY sent_at DESC LIMIT 10').all(req.params.id);
  res.json({ contact, interactions, messages });
});

// ── Update contact ────────────────────────────────────────────────────────────
app.put('/api/contacts/:id', (req, res) => {
  const allowed = ['name','status','priority','notes','ai_notes','next_followup','last_contacted','business','phone','email'];
  const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
  const sql = `UPDATE contacts SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ? AND workspace_id = ?`;
  db.prepare(sql).run(...fields.map(f => req.body[f]), req.params.id, req.workspaceId);
  res.json({ ok: true });
});

// ── Log interaction ───────────────────────────────────────────────────────────
app.post('/api/contacts/:id/interaction', (req, res) => {
  const { type = 'Call', notes = '', outcome = 'Neutral' } = req.body;
  db.prepare('INSERT INTO interactions (contact_id, type, notes, outcome) VALUES (?, ?, ?, ?)').run(req.params.id, type, notes, outcome);
  db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN ? ELSE status END WHERE id = ? AND workspace_id = ?").run(type, req.params.id, req.workspaceId);
  res.json({ ok: true });
});

// ── Interaction history ───────────────────────────────────────────────────────
app.get('/api/contacts/:id/interactions', (req, res) => {
  res.json(db.prepare('SELECT * FROM interactions WHERE contact_id = ? ORDER BY date DESC').all(req.params.id));
});

// ── AI Draft ──────────────────────────────────────────────────────────────────
app.post('/api/ai/draft', async (req, res) => {
  if (!anthropic) return res.status(503).json({ error: 'AI not configured. Add ANTHROPIC_API_KEY to .env' });
  const { name, business, notes = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     CONFIG.aiSystemPrompt,
      messages:   [{
        role:    'user',
        content: `Generate outreach for: ${name} | Business: ${business || 'Unknown'} | Notes: ${notes || 'None'}

Return ONLY valid JSON in this exact format:
{
  "email": { "subject": "...", "body": "..." },
  "callScript": "...",
  "dm": "..."
}`
      }]
    });

    const text      = msg.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const draft = JSON.parse(jsonMatch[0]);

    if (req.body.contactId) {
      db.prepare("UPDATE contacts SET ai_notes = ? WHERE id = ? AND workspace_id = ?").run(JSON.stringify(draft), req.body.contactId, req.workspaceId);
    }

    res.json({ ok: true, draft });
  } catch (err) {
    console.error('[AI]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Send single email ─────────────────────────────────────────────────────────
app.post('/api/email/send', async (req, res) => {
  if (!mailer) return res.status(503).json({ error: 'Email not configured. Add GMAIL_USER + GMAIL_APP_PASSWORD to .env' });
  const { contactId, to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: 'to, subject, body required' });

  try {
    await mailer.sendMail({ from: `Crown Media Group <${process.env.GMAIL_USER}>`, to, subject, html: body.replace(/\n/g, '<br>'), text: body });
    if (contactId) {
      db.prepare('INSERT INTO messages_sent (contact_id, type, subject, body) VALUES (?, ?, ?, ?)').run(contactId, 'email', subject, body);
      db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN 'Emailed' ELSE status END WHERE id = ? AND workspace_id = ?").run(contactId, req.workspaceId);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[EMAIL]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Mass email ────────────────────────────────────────────────────────────────
app.post('/api/email/mass', massLimiter, async (req, res) => {
  if (!mailer) return res.status(503).json({ error: 'Email not configured' });
  const { contactIds, subject, body } = req.body;
  if (!contactIds?.length || !subject || !body) return res.status(400).json({ error: 'contactIds, subject, body required' });

  const results    = { sent: 0, failed: 0, errors: [] };
  const ownerName  = db.prepare("SELECT value FROM settings WHERE key='owner_name'").get()?.value || 'King';
  const agencyName = db.prepare("SELECT value FROM settings WHERE key='agency_name'").get()?.value || 'Crown Media Group';
  const BASE_URL   = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

  for (const id of contactIds) {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
    if (!contact) continue;

    const pSubject    = interpolate(subject, contact, ownerName, agencyName);
    const pBody       = interpolate(body, contact, ownerName, agencyName);
    const trackToken  = randomBytes(16).toString('hex');
    const pixelTag    = `<img src="${BASE_URL}/track/open/${trackToken}.png" width="1" height="1" style="display:none">`;
    const htmlWithPx  = pBody.replace(/\n/g, '<br>') + pixelTag;

    try {
      await mailer.sendMail({ from: `${agencyName} <${process.env.GMAIL_USER}>`, to: contact.email, subject: pSubject, html: htmlWithPx, text: pBody });
      const ins = db.prepare('INSERT INTO messages_sent (contact_id, type, subject, body, track_token) VALUES (?, ?, ?, ?, ?)').run(id, 'email', pSubject, pBody, trackToken);
      db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN 'Emailed' ELSE status END WHERE id = ? AND workspace_id = ?").run(id, req.workspaceId);
      results.sent++;
    } catch (err) {
      results.failed++;
      results.errors.push({ id, name: contact.name, error: err.message });
    }
  }
  res.json({ ok: true, ...results });
});

// ── Send single SMS ───────────────────────────────────────────────────────────
app.post('/api/sms/send', async (req, res) => {
  if (!twilioClient) return res.status(503).json({ error: 'Twilio not configured' });
  const { contactId, to, body } = req.body;
  if (!to || !body) return res.status(400).json({ error: 'to and body required' });

  try {
    await twilioClient.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: normalizePhone(to), body });
    if (contactId) {
      db.prepare('INSERT INTO messages_sent (contact_id, type, body) VALUES (?, ?, ?)').run(contactId, 'sms', body);
      db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN 'Texted' ELSE status END WHERE id = ? AND workspace_id = ?").run(contactId, req.workspaceId);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[SMS]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Mass SMS ──────────────────────────────────────────────────────────────────
app.post('/api/sms/mass', massLimiter, async (req, res) => {
  if (!twilioClient) return res.status(503).json({ error: 'Twilio not configured' });
  const { contactIds, body } = req.body;
  if (!contactIds?.length || !body) return res.status(400).json({ error: 'contactIds and body required' });

  const ownerName = db.prepare("SELECT value FROM settings WHERE key='owner_name'").get()?.value || 'King';
  const results   = { sent: 0, failed: 0, errors: [] };

  for (const id of contactIds) {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?').get(id, req.workspaceId);
    if (!contact?.phone) continue;
    const personalized = body.replace(/\{\{name\}\}/gi, contact.name.split(' ')[0]).replace(/\{\{business\}\}/gi, contact.business || '').replace(/\{\{myname\}\}/gi, ownerName);

    try {
      await twilioClient.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: normalizePhone(contact.phone), body: personalized });
      db.prepare('INSERT INTO messages_sent (contact_id, type, body) VALUES (?, ?, ?)').run(id, 'sms', personalized);
      db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN 'Texted' ELSE status END WHERE id = ? AND workspace_id = ?").run(id, req.workspaceId);
      results.sent++;
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      results.failed++;
      results.errors.push({ id, name: contact.name, error: err.message });
    }
  }
  res.json({ ok: true, ...results });
});

// ── Export CSV ────────────────────────────────────────────────────────────────
app.get('/api/export/csv', (req, res) => {
  const { hotOnly, ids } = req.query;
  const wsId = req.workspaceId;
  let contacts;
  if (ids) {
    const idList       = ids.split(',').map(Number).filter(Boolean);
    const placeholders = idList.map(() => '?').join(',');
    contacts = db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders}) AND id != 3 AND workspace_id = ?`).all(...idList, wsId);
  } else if (hotOnly === 'true') {
    contacts = db.prepare("SELECT * FROM contacts WHERE priority='Hot' AND id != 3 AND workspace_id = ?").all(wsId);
  } else {
    contacts = db.prepare('SELECT * FROM contacts WHERE id != 3 AND workspace_id = ?').all(wsId);
  }

  const headers = ['id','name','business','phone','email','status','priority','last_contacted','next_followup','notes','source'];
  const rows    = contacts.map(c => headers.map(h => `"${(c[h] || '').toString().replace(/"/g, '""')}"`).join(','));
  const csv     = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="crm-export-${todayISO()}.csv"`);
  res.send(csv);
});

// ── Settings ──────────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const s    = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({
    ...s,
    emailConfigured:  !!mailer,
    twilioConfigured: !!twilioClient,
    aiConfigured:     !!anthropic,
  });
});

function upsertSettings(body) {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  db.exec('BEGIN');
  for (const [k, v] of Object.entries(body)) stmt.run(k, String(v));
  db.exec('COMMIT');
}

app.put('/api/settings',  (req, res) => { upsertSettings(req.body); res.json({ ok: true }); });
app.post('/api/settings', (req, res) => { upsertSettings(req.body); res.json({ ok: true }); });

// ── Test email ────────────────────────────────────────────────────────────────
app.post('/api/test/email', async (req, res) => {
  if (!mailer) return res.status(503).json({ error: 'Email not configured' });
  try {
    await mailer.sendMail({ from: process.env.GMAIL_USER, to: process.env.GMAIL_USER, subject: 'Crown Media CRM — Test Email', text: 'Email is working. All Glory to Jesus.' });
    res.json({ ok: true, message: `Test email sent to ${process.env.GMAIL_USER}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Test SMS ──────────────────────────────────────────────────────────────────
app.post('/api/test/sms', async (req, res) => {
  if (!twilioClient) return res.status(503).json({ error: 'Twilio not configured' });
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'to required' });
  try {
    await twilioClient.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: normalizePhone(to), body: 'Crown Media CRM test message. All Glory to Jesus.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Hot contacts (dashboard widget) ──────────────────────────────────────────
app.get('/api/contacts/hot', (req, res) => {
  res.json(db.prepare("SELECT * FROM contacts WHERE priority='Hot' AND id != 3 AND workspace_id = ? LIMIT 5").all(req.workspaceId));
});

// ── Auto-prioritize high-potential contacts ───────────────────────────────────
app.post('/api/contacts/auto-prioritize', (req, res) => {
  const hotKeywords  = ['food', 'bakery', 'baked', 'catering', 'cake', 'restaurant', 'flour'];
  const warmKeywords = ['music', 'beauty', 'hair', 'salon', 'esthetic', 'health', 'events', 'party', 'media', 'arts', 'craft', 'counseling', 'education', 'marketing'];

  const contacts = db.prepare("SELECT id, notes, priority FROM contacts WHERE priority = 'Normal' AND id != 3 AND workspace_id = ?").all(req.workspaceId);
  let updated = 0;

  for (const c of contacts) {
    const text = (c.notes || '').toLowerCase();
    const newPriority = hotKeywords.some(k => text.includes(k)) ? 'Hot'
      : warmKeywords.some(k => text.includes(k)) ? 'Warm'
      : null;
    if (newPriority) {
      db.prepare("UPDATE contacts SET priority = ? WHERE id = ?").run(newPriority, c.id);
      updated++;
    }
  }

  res.json({ ok: true, updated });
});

// ── Change password ───────────────────────────────────────────────────────────
app.post('/api/auth/change-password', (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields required' });
  if (newPassword.length < 8)  return res.status(400).json({ error: 'New password must be at least 8 characters' });
  if (newPassword.length > 128) return res.status(400).json({ error: 'Password too long' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), req.user.id);
  // Invalidate all other sessions — force re-login on other devices
  const currentToken = getCookie(req, 'crm_session');
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, currentToken);
  res.json({ ok: true });
});

// ── Pipeline board ────────────────────────────────────────────────────────────
const PIPELINE_MAP = {
  'Not Contacted': 'Not Contacted',
  'Called':        'Reached Out',
  'Emailed':       'Reached Out',
  'Texted':        'Reached Out',
  'Pitched':       'Interested',
  'Proposal Sent': 'Proposal Sent',
  'Client':        'Closed Won',
  'Not Interested':'Closed Lost',
};
const PIPELINE_STAGES = ['Not Contacted','Reached Out','Interested','Proposal Sent','Closed Won','Closed Lost'];

app.get('/api/pipeline', (req, res) => {
  const contacts = db.prepare(
    "SELECT id, name, business, status, priority, deal_value, last_contacted FROM contacts WHERE workspace_id = ? AND (archived = 0 OR archived IS NULL) AND id != 3"
  ).all(req.workspaceId);
  const stages = {};
  for (const s of PIPELINE_STAGES) stages[s] = { contacts: [], total: 0 };
  for (const c of contacts) {
    const stage = PIPELINE_MAP[c.status] || 'Not Contacted';
    stages[stage].contacts.push(c);
    stages[stage].total += (c.deal_value || 0);
  }
  res.json(stages);
});

// ── Tags ──────────────────────────────────────────────────────────────────────
app.get('/api/contacts/:id/tags', (req, res) => {
  res.json(db.prepare('SELECT * FROM tags WHERE contact_id = ? AND workspace_id = ?').all(req.params.id, req.workspaceId));
});

app.post('/api/contacts/:id/tags', (req, res) => {
  const { tag, color = '#C9A84C' } = req.body;
  if (!tag) return res.status(400).json({ error: 'tag required' });
  try {
    db.prepare('INSERT INTO tags (contact_id, tag, color, workspace_id) VALUES (?, ?, ?, ?)').run(req.params.id, tag.trim().toLowerCase(), color, req.workspaceId);
    res.json({ ok: true });
  } catch { res.status(400).json({ error: 'Tag already exists' }); }
});

app.delete('/api/contacts/:id/tags/:tag', (req, res) => {
  db.prepare('DELETE FROM tags WHERE contact_id = ? AND tag = ? AND workspace_id = ?').run(req.params.id, req.params.tag, req.workspaceId);
  res.json({ ok: true });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const { filter, contactId } = req.query;
  let sql = `SELECT t.*, c.name as contact_name, c.business as contact_business
             FROM tasks t LEFT JOIN contacts c ON t.contact_id = c.id
             WHERE t.workspace_id = ?`;
  const params = [req.workspaceId];
  if (contactId) { sql += ' AND t.contact_id = ?'; params.push(contactId); }
  if (filter === 'due_today')  sql += " AND date(t.due_date) = date('now') AND t.completed = 0";
  else if (filter === 'overdue') sql += " AND date(t.due_date) < date('now') AND t.completed = 0";
  else if (filter === 'incomplete') sql += ' AND t.completed = 0';
  sql += ' ORDER BY t.completed ASC, t.due_date ASC, t.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/tasks', (req, res) => {
  const { contactId, title, dueDate } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const result = db.prepare('INSERT INTO tasks (contact_id, title, due_date, workspace_id) VALUES (?, ?, ?, ?)').run(contactId || null, title.trim(), dueDate || null, req.workspaceId);
  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put('/api/tasks/:id', (req, res) => {
  const { completed, title, dueDate } = req.body;
  const fields = [], vals = [];
  if (completed !== undefined) { fields.push('completed = ?'); vals.push(completed ? 1 : 0); }
  if (title     !== undefined) { fields.push('title = ?');     vals.push(title); }
  if (dueDate   !== undefined) { fields.push('due_date = ?');  vals.push(dueDate); }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND workspace_id = ?`).run(...vals, req.params.id, req.workspaceId);
  res.json({ ok: true });
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND workspace_id = ?').run(req.params.id, req.workspaceId);
  res.json({ ok: true });
});

// ── Reports ───────────────────────────────────────────────────────────────────
app.get('/api/reports/summary', (req, res) => {
  const wsId = req.workspaceId;
  const base = 'FROM contacts WHERE workspace_id = ? AND (archived = 0 OR archived IS NULL) AND id != 3';
  const total      = db.prepare(`SELECT COUNT(*) as c ${base}`).get(wsId).c;
  const clients    = db.prepare(`SELECT COUNT(*) as c ${base} AND status = 'Client'`).get(wsId).c;
  const hot        = db.prepare(`SELECT COUNT(*) as c ${base} AND priority = 'Hot'`).get(wsId).c;
  const notInt     = db.prepare(`SELECT COUNT(*) as c ${base} AND status = 'Not Interested'`).get(wsId).c;
  const byStatus   = db.prepare(`SELECT status, COUNT(*) as c ${base} GROUP BY status ORDER BY c DESC`).all(wsId);
  const byPriority = db.prepare(`SELECT priority, COUNT(*) as c ${base} GROUP BY priority ORDER BY c DESC`).all(wsId);
  const totalValue = db.prepare(`SELECT COALESCE(SUM(deal_value),0) as v ${base} AND status='Client'`).get(wsId).v;
  const convRate   = total > 0 ? Math.round((clients / total) * 100) : 0;
  res.json({ total, clients, hot, notInterested: notInt, conversionRate: convRate, totalPipelineValue: totalValue, byStatus, byPriority });
});

app.get('/api/reports/activity', (req, res) => {
  res.json(db.prepare(`
    SELECT date(date) as day, COUNT(*) as count
    FROM interactions
    WHERE date >= date('now', '-29 days')
    GROUP BY date(date)
    ORDER BY day ASC
  `).all());
});

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO SERVICE API — /api/video-service/*
// Bridges dashboard → Supabase REST + description-gen.js (Claude AI)
// Auth: same crm_session cookie used for all protected routes
// ══════════════════════════════════════════════════════════════════════════════

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function sbHeaders() {
  return {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };
}

// GET /api/video-service/projects — list all projects (newest first)
app.get('/api/video-service/projects', async (req, res) => {
  try {
    const params = new URLSearchParams({ select: '*', order: 'created_at.desc' });
    if (req.query.status) params.set('status', `eq.${req.query.status}`);
    const r = await fetch(`${SB_URL}/rest/v1/video_projects?${params}`, { headers: sbHeaders() });
    const data = await r.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/video-service/projects — create project
app.post('/api/video-service/projects', async (req, res) => {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/video_projects`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.ok ? 201 : 400).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/video-service/projects/:id — update status/notes/schedule
app.patch('/api/video-service/projects/:id', async (req, res) => {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/video_projects?id=eq.${req.params.id}`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=representation' },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/video-service/projects/:id/posts — get platform posts for a project
app.get('/api/video-service/projects/:id/posts', async (req, res) => {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/video_platform_posts?project_id=eq.${req.params.id}&order=platform.asc`, { headers: sbHeaders() });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/video-service/generate-descriptions — Claude AI caption generation
app.post('/api/video-service/generate-descriptions', async (req, res) => {
  const { project_id } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  try {
    // Dynamic import of ESM description-gen.js
    const { generateDescriptions } = await import('./../../tools/video-service/automation/description-gen.js');
    const rows = await generateDescriptions(project_id);
    res.json({ ok: true, count: rows.length, posts: rows });
  } catch (err) {
    console.error('[VIDEO] Caption generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video-service/revenue — revenue data for dashboard chart
app.get('/api/video-service/revenue', async (req, res) => {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/video_revenue?order=revenue_month.desc&limit=12`, { headers: sbHeaders() });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/video-service/report — trigger monthly PDF report generation
app.post('/api/video-service/report', async (req, res) => {
  const { month } = req.body;
  res.json({ ok: true, message: 'Report generation started', month: month || 'current' });
  // Run async — don't block the response
  import('child_process').then(({ execFile }) => {
    const scriptPath = join(__dirname, '../../tools/video-service/reporting/monthly-report.js');
    const args = month ? [scriptPath, month] : [scriptPath];
    execFile(process.execPath, args, { cwd: join(__dirname, '../..') }, (err, stdout) => {
      if (err) console.error('[VIDEO REPORT] Error:', err.message);
      else console.log('[VIDEO REPORT] Complete:', stdout.trim());
    });
  });
});

// ── Campaigns ─────────────────────────────────────────────────────────────────
app.get('/api/campaigns', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const campaigns = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id = c.id) as total,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id = c.id AND cc.status = 'active') as active_count,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id = c.id AND cc.current_step >= 1) as sent_count,
      (SELECT COUNT(*) FROM campaign_contacts cc WHERE cc.campaign_id = c.id AND cc.status = 'replied') as replied_count
    FROM campaigns c WHERE c.workspace_id = ? ORDER BY c.created_at DESC
  `).all(session.workspace_id);
  res.json(campaigns);
});

app.get('/api/campaigns/:id/contacts', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const rows = db.prepare(`
    SELECT cc.*, co.name, co.business, co.email, co.phone, co.status as contact_status
    FROM campaign_contacts cc
    JOIN contacts co ON co.id = cc.contact_id
    WHERE cc.campaign_id = ?
    ORDER BY cc.enrolled_at ASC
  `).all(req.params.id);
  res.json(rows);
});

app.patch('/api/campaigns/:id/contacts/:contactId', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const { status } = req.body;
  db.prepare('UPDATE campaign_contacts SET status = ? WHERE campaign_id = ? AND contact_id = ?')
    .run(status, req.params.id, req.params.contactId);
  res.json({ ok: true });
});

// ── Fallback → serve index.html (requires auth) ───────────────────────────────
app.get('*', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.redirect('/login');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n[CRM] Crown Media Group CRM`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   ${db.prepare('SELECT COUNT(*) as c FROM contacts').get().c} contacts loaded\n`);
});
