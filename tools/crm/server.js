// server.js — Crown Media Group CRM
// Port 3001 | SQLite local | Twilio SMS | Nodemailer email | Claude AI drafts

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createTransport } from 'nodemailer';
import { join, dirname, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'fs';
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
  console.log(`  King's login created. Email: ${KING_EMAIL}`);
  console.log(`  Set KING_PASSWORD in .env before restarting to use a custom password.`);
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
      frameAncestors: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },
}));

// ── Trust proxy (Railway / Netlify sit behind a load balancer) ────────────────
app.set('trust proxy', 1);

// ── CORS — allow crownmediagroup.co to call the CRM API with credentials ───────
const ALLOWED_ORIGINS = [
  'https://crownmediagroup.co',
  'https://www.crownmediagroup.co',
  'https://crm.crownmediagroup.co',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:5500',
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});

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

// ── Portfolio uploads dir ─────────────────────────────────────────────────────
const PORTFOLIO_DIR = join(__dirname, 'portfolio-uploads');
if (!existsSync(PORTFOLIO_DIR)) mkdirSync(PORTFOLIO_DIR, { recursive: true });

// ── CORS for public portfolio endpoints (crownmediagroup.co) ──────────────────
app.use('/api/portfolio/items', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/portfolio-media', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api', apiLimiter);

// ── Serve portfolio upload files as static ────────────────────────────────────
app.use('/portfolio-media', express.static(PORTFOLIO_DIR));

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
  const dest = req.query.url;
  if (!dest || !dest.startsWith('https://')) return res.redirect('https://crownmediagroup.co');
  res.redirect(dest);
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

// ── Gemini AI helper ──────────────────────────────────────────────────────────
if (process.env.GEMINI_API_KEY) {
  console.log('[CRM] Gemini AI ready (free tier)');
} else {
  console.warn('[CRM] GEMINI_API_KEY not set — AI drafts disabled');
}

async function callGemini(prompt, { systemPrompt = '', maxTokens = 1024, imageParts = null } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');
  const parts = imageParts ? [...imageParts, { text: prompt }] : [{ text: prompt }];
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const data = await r.json();
  if (!data.candidates?.[0]) throw new Error(data.error?.message || 'Gemini returned no candidates');
  return data.candidates[0].content.parts[0].text;
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

  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';

  if (!valid) {
    // Generic error — never reveal whether email or password was wrong
    console.log(`[CRM LOGIN FAIL] email=${email?.toLowerCase().trim().slice(0,60)} | ${new Date().toISOString()} | ip=${clientIp}`);
    return res.status(401).json({ error: 'Wrong email or password.' });
  }

  // Login success — clean expired sessions
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  // Secure login log — email + trial status, never password
  const ws = db.prepare('SELECT trial_ends_at, subscription_status FROM workspaces WHERE id = ?').get(user.workspace_id);
  const trialDaysLeft = ws?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(ws.trial_ends_at) - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  console.log(`[CRM LOGIN] email=${user.email} | ${new Date().toISOString()} | ip=${clientIp} | role=${user.role} | status=${ws?.subscription_status || 'unknown'}${trialDaysLeft !== null ? ` | trial_days_left=${trialDaysLeft}` : ''}`);

  const token = createSession(user.id, user.workspace_id);
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOpts = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', `crm_session=${token}; ${cookieOpts}`);
  res.json({ ok: true, role: user.role, workspaceId: user.workspace_id });
});

// ── Forgot Password ───────────────────────────────────────────────────────────
app.post('/api/forgot-password', loginLimiter, async (req, res) => {
  const { email } = req.body || {};
  // Always return the same response — never reveal whether email exists
  const ok = { ok: true, message: 'If that email is registered, a reset link is on its way.' };

  if (!email || email.length > 254) return res.json(ok);

  const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.json(ok); // Silent — don't reveal account existence

  // Invalidate old tokens for this user
  db.prepare("UPDATE password_resets SET used=1 WHERE user_id=? AND used=0").run(user.id);

  // Create new token (valid 1 hour)
  const token   = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expires);

  const resetUrl = `https://crm.crownmediagroup.co/login.html?reset=${token}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0f0f0f;color:#fff">
<h2 style="color:#C9A84C;margin-bottom:8px">Password Reset</h2>
<p style="color:#aaa;margin-bottom:24px">Hi ${user.name || user.email},</p>
<p style="color:#ccc;margin-bottom:24px">Someone requested a password reset for your Crown Media Group CRM account. If this was you, click the button below. This link expires in 1 hour.</p>
<a href="${resetUrl}" style="background:#C9A84C;color:#000;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;margin-bottom:24px">Reset My Password</a>
<p style="color:#666;font-size:13px">If you didn't request this, ignore this email. Your password won't change.<br><br>Link expires: ${new Date(expires).toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</p>
<hr style="border:none;border-top:1px solid #222;margin:24px 0">
<p style="color:#444;font-size:12px">Crown Media Group CRM &middot; crm.crownmediagroup.co</p>
</div>`;

  try {
    await sendEmail({ to: user.email, subject: 'Reset your CRM password — Crown Media Group', html, text: `Reset your password: ${resetUrl}\n\nExpires in 1 hour. If you didn't request this, ignore this email.` });
    console.log(`[ForgotPW] Reset email sent to ${user.email}`);
  } catch (e) {
    console.error('[ForgotPW] Email error:', e.message);
  }

  res.json(ok);
});

// ── Reset Password (token validation + update) ────────────────────────────────
app.post('/api/reset-password', loginLimiter, (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (password.length > 128) return res.status(400).json({ error: 'Password too long' });

  const row = db.prepare("SELECT * FROM password_resets WHERE token=? AND used=0 AND expires_at > datetime('now')").get(token);
  if (!row) return res.status(400).json({ error: 'Reset link is invalid or expired. Please request a new one.' });

  // Mark token used + update password
  db.prepare('UPDATE password_resets SET used=1 WHERE id=?').run(row.id);
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(password), row.user_id);

  console.log(`[ResetPW] Password updated for user_id=${row.user_id}`);
  res.json({ ok: true, message: 'Password updated. You can now sign in.' });
});

// ── Logout ────────────────────────────────────────────────────────────────────
app.post('/api/logout', (req, res) => {
  const token = getCookie(req, 'crm_session');
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'crm_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
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
  const cookieOpts = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`;
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
    const cookieOpts = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`;
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
  if (publicPaths.includes(req.path) || req.path === '/forgot-password' || req.path === '/reset-password') return next();
  // Public scout + webhook endpoints — no auth required
  if (req.path === '/scouts/apply' || req.path.startsWith('/scouts/dashboard/') || req.path.startsWith('/scouts/by-code/') || req.path.startsWith('/internal/') || req.path === '/sms/webhook/inbound' || req.path === '/voice/webhook') return next();
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
    twilioConfigured: !!twilioClient,
    emailConfigured:  !!mailer,
    aiConfigured:     !!process.env.GEMINI_API_KEY,
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
    const escaped = search.replace(/[%_\\]/g, '\\$&');
    where.push('(name LIKE ? OR business LIKE ? OR email LIKE ? OR phone LIKE ?)');
    const s = `%${escaped}%`;
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
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  const { type = 'Call', notes = '', outcome = 'Neutral' } = req.body;
  db.prepare('INSERT INTO interactions (contact_id, type, notes, outcome) VALUES (?, ?, ?, ?)').run(req.params.id, type, notes, outcome);
  db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN ? ELSE status END WHERE id = ? AND workspace_id = ?").run(type, req.params.id, req.workspaceId);
  res.json({ ok: true });
});

// ── Interaction history ───────────────────────────────────────────────────────
app.get('/api/contacts/:id/interactions', (req, res) => {
  const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND workspace_id = ?').get(req.params.id, req.workspaceId);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  res.json(db.prepare('SELECT * FROM interactions WHERE contact_id = ? ORDER BY date DESC').all(req.params.id));
});

// ── AI Draft ──────────────────────────────────────────────────────────────────
app.post('/api/ai/draft', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI not configured. Add GEMINI_API_KEY to .env' });
  const { name, business, notes = '' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    const text = (await callGemini(
      `Generate outreach for: ${name} | Business: ${business || 'Unknown'} | Notes: ${notes || 'None'}

Return ONLY valid JSON in this exact format:
{
  "email": { "subject": "...", "body": "..." },
  "callScript": "...",
  "dm": "..."
}`,
      { systemPrompt: CONFIG.aiSystemPrompt, maxTokens: 1024 }
    )).trim();
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
    const msg = await twilioClient.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: normalizePhone(to), body });
    if (contactId) {
      db.prepare('INSERT INTO messages_sent (contact_id, type, body) VALUES (?, ?, ?)').run(contactId, 'sms', body);
      db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN 'Texted' ELSE status END WHERE id = ? AND workspace_id = ?").run(contactId, req.workspaceId);
      // Log outbound to sms_inbox for 2-way thread view
      db.prepare('INSERT INTO sms_inbox (contact_id, from_number, to_number, body, direction, twilio_sid, workspace_id, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))')
        .run(contactId, process.env.TWILIO_FROM_NUMBER || '', normalizePhone(to), body, 'outbound', msg.sid, req.workspaceId);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[SMS]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Inbound SMS webhook (Twilio → CRM, no auth) ───────────────────────────────
app.post('/api/sms/webhook/inbound', (req, res) => {
  const { From, To, Body, MessageSid } = req.body || {};
  if (!From || !Body) { res.setHeader('Content-Type', 'text/xml'); return res.send('<Response/>'); }

  const normalizedFrom = normalizePhone(From);

  // Match sender to a contact by normalized phone across all workspaces
  const allContacts = db.prepare("SELECT id, workspace_id, phone FROM contacts WHERE phone IS NOT NULL AND phone != ''").all();
  let matched = null;
  for (const c of allContacts) {
    if (normalizePhone(c.phone) === normalizedFrom) { matched = c; break; }
  }

  const contactId   = matched?.id || null;
  const workspaceId = matched?.workspace_id || 1;

  db.prepare('INSERT INTO sms_inbox (contact_id, from_number, to_number, body, direction, twilio_sid, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(contactId, normalizedFrom, To || process.env.TWILIO_FROM_NUMBER || '', Body.trim(), 'inbound', MessageSid || null, workspaceId);

  if (contactId) {
    db.prepare("UPDATE contacts SET last_contacted = datetime('now') WHERE id = ?").run(contactId);
  }

  console.log(`[SMS INBOUND] From: ${normalizedFrom} → ${contactId ? `contact #${contactId}` : 'unknown'} | "${Body.substring(0, 60)}"`);
  res.setHeader('Content-Type', 'text/xml');
  res.send('<Response/>');
});

// ── Missed Call Text-Back (Twilio voice webhook, no auth) ─────────────────────
app.post('/api/voice/webhook', async (req, res) => {
  const callerNumber = req.body?.From || req.body?.Caller || '';
  console.log(`[Voice] Missed call from: ${callerNumber}`);

  // Fire auto-SMS in background
  if (callerNumber) {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_FROM_NUMBER;
    if (sid && token && from) {
      const name     = callerNumber;
      const smsBody  = `Hey! I missed your call — this is Crown Media Group. We help Columbia SC businesses grow with AI-powered marketing. Text me back or book a call: crownmediagroup.co`;
      const creds    = Buffer.from(`${sid}:${token}`).toString('base64');
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method:  'POST',
        headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    new URLSearchParams({ From: from, To: callerNumber, Body: smsBody }).toString(),
      }).then(r => r.json()).then(msg => {
        db.prepare('INSERT INTO sms_inbox (contact_id, from_number, to_number, body, direction, twilio_sid, workspace_id, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))')
          .run(null, from, callerNumber, smsBody, 'outbound', msg.sid || null, 1);
        console.log(`[Voice] Missed call text-back sent to ${callerNumber}`);
      }).catch(e => console.error('[Voice] SMS error:', e.message));
    }
  }

  // TwiML response — don't leave caller hanging
  res.setHeader('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Thanks for calling Crown Media Group. We'll text you right back!</Say><Hangup/></Response>`);
});

// ── SMS Inbox API routes ───────────────────────────────────────────────────────

// GET /api/sms/inbox — all conversation threads with unread count
app.get('/api/sms/inbox', (req, res) => {
  const wsId = req.workspaceId;
  const threads = db.prepare(`
    SELECT
      c.id AS contact_id, c.name, c.phone, c.business, c.status,
      latest.body AS last_message, latest.direction AS last_direction, latest.created_at AS last_at,
      (SELECT COUNT(*) FROM sms_inbox WHERE contact_id = c.id AND direction = 'inbound' AND read_at IS NULL) AS unread
    FROM contacts c
    INNER JOIN sms_inbox latest ON latest.contact_id = c.id
    WHERE c.workspace_id = ? AND c.archived = 0
      AND latest.id = (SELECT id FROM sms_inbox WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1)
    ORDER BY latest.created_at DESC
  `).all(wsId);

  // Also include unknown-sender threads (contact_id IS NULL, workspace_id matches)
  const unknowns = db.prepare(`
    SELECT NULL AS contact_id, from_number AS name, from_number AS phone, '' AS business, '' AS status,
           body AS last_message, direction AS last_direction, created_at AS last_at, 1 AS unread
    FROM sms_inbox
    WHERE contact_id IS NULL AND workspace_id = ?
    GROUP BY from_number
    ORDER BY MAX(created_at) DESC
  `).all(wsId);

  res.json({ threads, unknowns });
});

// GET /api/sms/thread/:contactId — full conversation thread for a contact
app.get('/api/sms/thread/:contactId', (req, res) => {
  const contact = db.prepare('SELECT id, name, phone, business, status FROM contacts WHERE id = ? AND workspace_id = ?').get(req.params.contactId, req.workspaceId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const messages = db.prepare('SELECT * FROM sms_inbox WHERE contact_id = ? ORDER BY created_at ASC').all(req.params.contactId);

  // Mark inbound as read
  db.prepare("UPDATE sms_inbox SET read_at = datetime('now') WHERE contact_id = ? AND direction = 'inbound' AND read_at IS NULL").run(req.params.contactId);

  res.json({ contact, messages });
});

// GET /api/sms/thread/unknown/:fromNumber — thread for unmatched sender
app.get('/api/sms/thread/unknown/:from', (req, res) => {
  const from = decodeURIComponent(req.params.from);
  const messages = db.prepare("SELECT * FROM sms_inbox WHERE from_number = ? AND contact_id IS NULL ORDER BY created_at ASC").all(from);
  db.prepare("UPDATE sms_inbox SET read_at = datetime('now') WHERE from_number = ? AND direction = 'inbound' AND read_at IS NULL").run(from);
  res.json({ contact: { name: from, phone: from }, messages });
});

// GET /api/sms/unread-count — badge count for nav
app.get('/api/sms/unread-count', (req, res) => {
  const { count } = db.prepare("SELECT COUNT(*) as count FROM sms_inbox WHERE workspace_id = ? AND direction = 'inbound' AND read_at IS NULL").get(req.workspaceId);
  res.json({ count });
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
      const massMsg = await twilioClient.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: normalizePhone(contact.phone), body: personalized });
      db.prepare('INSERT INTO messages_sent (contact_id, type, body) VALUES (?, ?, ?)').run(id, 'sms', personalized);
      db.prepare("UPDATE contacts SET last_contacted = datetime('now'), status = CASE WHEN status = 'Not Contacted' THEN 'Texted' ELSE status END WHERE id = ? AND workspace_id = ?").run(id, req.workspaceId);
      db.prepare('INSERT INTO sms_inbox (contact_id, from_number, to_number, body, direction, twilio_sid, workspace_id, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))')
        .run(id, process.env.TWILIO_FROM_NUMBER || '', normalizePhone(contact.phone), personalized, 'outbound', massMsg.sid, req.workspaceId);
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
  const csvSafe = v => { const s = (v || '').toString().replace(/"/g, '""'); return /^[=+@\-]/.test(s) ? `"'${s}"` : `"${s}"`; };
  const rows    = contacts.map(c => headers.map(h => csvSafe(c[h])).join(','));
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
    aiConfigured:     !!process.env.GEMINI_API_KEY,
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

function requireSupabase(req, res, next) {
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Video service not configured — add SUPABASE_URL and SUPABASE_KEY to .env' });
  next();
}

// GET /api/video-service/projects — list all projects (newest first)
app.get('/api/video-service/projects', requireSupabase, async (req, res) => {
  try {
    const params = new URLSearchParams({ select: '*', order: 'created_at.desc' });
    if (req.query.status) params.set('status', `eq.${req.query.status}`);
    const r = await fetch(`${SB_URL}/rest/v1/video_projects?${params}`, { headers: sbHeaders() });
    if (!r.ok) return res.status(r.status).json({ error: `Supabase error: ${r.status}` });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/video-service/projects — create project
app.post('/api/video-service/projects', requireSupabase, async (req, res) => {
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
app.patch('/api/video-service/projects/:id', requireSupabase, async (req, res) => {
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
app.get('/api/video-service/projects/:id/posts', requireSupabase, async (req, res) => {
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
app.get('/api/video-service/revenue', requireSupabase, async (req, res) => {
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

// ── Portfolio Management ───────────────────────────────────────────────────────
const PORTFOLIO_EXTS = new Set(['.jpg','.jpeg','.png','.gif','.webp','.mp4','.mov','.heic']);
const CRM_HOST = process.env.CRM_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;

// Public: list all portfolio items
app.get('/api/portfolio/items', (req, res) => {
  try {
    const files = readdirSync(PORTFOLIO_DIR);
    const imageExts = new Set(['.jpg','.jpeg','.png','.gif','.webp']);
    const videoExts = new Set(['.mp4','.mov']);
    const items = files
      .filter(f => PORTFOLIO_EXTS.has(extname(f).toLowerCase()))
      .map(f => {
        const ext = extname(f).toLowerCase();
        const type = imageExts.has(ext) ? 'image' : videoExts.has(ext) ? 'video' : null;
        if (!type) return null;
        return {
          id: f,
          file: f,
          type,
          src: `${CRM_HOST}/portfolio-media/${encodeURIComponent(f)}`,
          thumb: type === 'video'
            ? `${CRM_HOST}/portfolio-media/thumb_${encodeURIComponent(basename(f, ext))}.jpg`
            : `${CRM_HOST}/portfolio-media/${encodeURIComponent(f)}`,
          uploadedAt: new Date().toISOString()
        };
      })
      .filter(Boolean);
    res.json({ items, total: items.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auth: upload a file (base64 JSON)
app.post('/api/portfolio/upload', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { filename, data, mimetype } = req.body;
  if (!filename || !data) return res.status(400).json({ error: 'Missing filename or data' });

  const ext = extname(filename).toLowerCase();
  if (!PORTFOLIO_EXTS.has(ext)) return res.status(400).json({ error: 'File type not allowed' });

  // Sanitize filename — keep extension, slugify the name
  const safe = basename(filename.replace(/[^a-zA-Z0-9._\-() ]/g, '_').trim());
  if (!safe || safe.includes('..')) return res.status(400).json({ error: 'Invalid filename' });
  const destPath = join(PORTFOLIO_DIR, safe);

  try {
    if (data.length > 13_981_013) return res.status(413).json({ error: 'File too large (max 10MB)' });
    const buffer = Buffer.from(data, 'base64');
    writeFileSync(destPath, buffer);
    res.json({
      ok: true,
      file: safe,
      src: `${CRM_HOST}/portfolio-media/${encodeURIComponent(safe)}`,
      type: ['.mp4','.mov'].includes(ext) ? 'video' : 'image'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auth: delete a file
app.delete('/api/portfolio/file/:filename', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const safe = req.params.filename.replace(/\.\./g, '').replace(/[/\\]/g, '');
  const filePath = join(PORTFOLIO_DIR, safe);
  const thumbPath = join(PORTFOLIO_DIR, 'thumb_' + basename(safe, extname(safe)) + '.jpg');

  try {
    if (existsSync(filePath)) unlinkSync(filePath);
    if (existsSync(thumbPath)) unlinkSync(thumbPath);
    res.json({ ok: true, deleted: safe });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// ── Lead Generator ────────────────────────────────────────────────────────────
app.post('/api/leads/generate', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI not configured. Add GEMINI_API_KEY to .env' });
  const { industry, location = 'Columbia, SC', count = 20, context = '' } = req.body;
  if (!industry) return res.status(400).json({ error: 'industry required' });

  try {
    const text = (await callGemini(
      `Generate ${count} realistic small business prospect leads for a social media marketing agency.

Industry/Type: ${industry}
Location: ${location}
Extra context: ${context || 'None'}

Return ONLY valid JSON array (no markdown, no explanation):
[
  { "name": "Owner First Last", "business": "Business Name", "phone": "(803) 555-XXXX", "email": "owner@business.com", "notes": "Why they need marketing help", "source": "AI Generated" },
  ...
]

Rules:
- Use realistic Columbia SC area codes (803, 843) for phone numbers
- Make business names authentic to the industry
- Keep notes short (1 sentence) about their marketing pain point
- Only include email if it would logically exist
- Generate exactly ${count} contacts`,
      { maxTokens: 2048 }
    )).trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    let leads;
    try { leads = JSON.parse(jsonMatch[0]); } catch { throw new Error('AI returned malformed JSON'); }
    res.json({ ok: true, leads });
  } catch (err) {
    console.error('[LEADS]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Photo OCR — extract contacts from screenshot ──────────────────────────────
app.post('/api/contacts/ocr', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'AI not configured. Add GEMINI_API_KEY to .env' });
  const { image, mimeType = 'image/jpeg' } = req.body;
  if (!image) return res.status(400).json({ error: 'image required (base64)' });
  if (image.length > 5_000_000) return res.status(413).json({ error: 'Image too large (max 5MB)' });

  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'Unsupported image type' });

  try {
    const text = (await callGemini(
      `Extract all business contacts visible in this screenshot (from Instagram, Facebook, Google Maps, business card, etc).

Return ONLY a valid JSON array (no markdown, no explanation):
[
  { "name": "...", "business": "...", "phone": "...", "email": "...", "notes": "Found via photo scan", "source": "Photo Import" }
]

Rules:
- Extract every visible contact (name, phone, email, business name)
- If a field is not visible, use empty string ""
- If no contacts are found, return []
- name is required — skip entries with no name`,
      { maxTokens: 2048, imageParts: [{ inlineData: { mimeType, data: image } }] }
    )).trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.json({ ok: true, contacts: [] });
    let contacts;
    try { contacts = JSON.parse(jsonMatch[0]).filter(c => c.name?.trim()); } catch { return res.json({ ok: true, contacts: [] }); }
    res.json({ ok: true, contacts });
  } catch (err) {
    console.error('[OCR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Command Center Dashboard Stats ───────────────────────────────────────────
app.get('/api/dashboard/stats', async (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const stats = {};

  // CRM stats (local SQLite)
  stats.contacts_total  = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE workspace_id=1 AND archived=0').get().c;
  stats.clients_active  = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE workspace_id=1 AND status='Active Client'").get().c;
  stats.contacts_hot    = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE workspace_id=1 AND priority='Hot' AND archived=0").get().c;
  stats.followups_due   = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE workspace_id=1 AND next_followup <= date('now') AND archived=0").get().c;

  // Maintenance stats
  stats.maint_open  = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE status='open'").get().c;
  stats.maint_red   = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE traffic_light='red'").get().c;
  stats.maint_green = db.prepare("SELECT COUNT(*) as c FROM maintenance_requests WHERE traffic_light='green'").get().c;

  // Outreach log (read from file)
  try {
    const logPath = join(__dirname, '../../Agency/ops/notes/OUTREACH-LOG.md');
    if (existsSync(logPath)) {
      const logTxt = readFileSync(logPath, 'utf8');
      const sentMatch = logTxt.match(/\*\*Sent:\*\* (\d+)/);
      stats.outreach_sent_today = sentMatch ? parseInt(sentMatch[1]) : 0;
    } else { stats.outreach_sent_today = 0; }
  } catch { stats.outreach_sent_today = 0; }

  // Lead counts from Supabase
  try {
    const SURL = process.env.SUPABASE_URL, SKEY = process.env.SUPABASE_KEY;
    if (SURL && SKEY) {
      const r = await fetch(`${SURL}/rest/v1/leads?select=id,status`, { headers: { apikey: SKEY, Authorization: `Bearer ${SKEY}` } });
      const leads = await r.json();
      if (Array.isArray(leads)) {
        stats.leads_total    = leads.length;
        stats.leads_new      = leads.filter(l => l.status === 'new').length;
        stats.leads_sequence = leads.filter(l => l.status === 'in_sequence').length;
      }
    }
  } catch { stats.leads_total = 0; stats.leads_new = 0; stats.leads_sequence = 0; }

  // Stripe revenue MTD
  try {
    const SK = process.env.STRIPE_SECRET_KEY;
    if (SK) {
      const mtdStart = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);
      const r = await fetch(`https://api.stripe.com/v1/charges?created[gte]=${mtdStart}&limit=100`, { headers: { Authorization: `Bearer ${SK}` } });
      const data = await r.json();
      if (data.data) {
        stats.revenue_mtd  = (data.data.filter(c => c.paid && !c.refunded).reduce((s, c) => s + c.amount, 0) / 100).toFixed(2);
        stats.revenue_txns = data.data.filter(c => c.paid).length;
      }
    }
  } catch { stats.revenue_mtd = '0.00'; stats.revenue_txns = 0; }

  // Content queue count
  try {
    const sp = join(__dirname, '../../Agency/ops/scheduled-posts.json');
    stats.content_queued = existsSync(sp) ? (JSON.parse(readFileSync(sp, 'utf8')) || []).filter(p => p.status === 'pending').length : 0;
  } catch { stats.content_queued = 0; }

  res.json({ ok: true, stats });
});

// ── Maintenance Requests ──────────────────────────────────────────────────────

// Helper: send email via Resend (fallback when Gmail mailer not set up)
async function sendResendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from: 'Crown Media Group <king@crownmediagroup.co>', to, subject, html, text }),
    });
    return r.ok;
  } catch { return false; }
}

async function sendEmail({ to, subject, html, text, attachments }) {
  // Resend first — verified domain, reliable delivery
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const body = { from: 'Crown Media Group <king@crownmediagroup.co>', to, subject, html, text };
    if (attachments?.length) {
      body.attachments = attachments.map(a => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : Buffer.from(a.content).toString('base64'),
      }));
    }
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
}

// ── SMS alert helper (texts King directly) ────────────────────────────────────
async function sendAlertSMS(body) {
  const to   = process.env.TWILIO_ALERT_TO || process.env.KING_PHONE;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!twilioClient || !to || !from) return false;
  try {
    await twilioClient.messages.create({ from, to, body: body.substring(0, 1600) });
    return true;
  } catch { return false; }
}

const maintenanceLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Public submit endpoint — no auth required
app.post('/api/maintenance/submit', maintenanceLimiter, async (req, res) => {
  const { client_name, client_email, website, description, priority } = req.body;
  if (!client_name || !client_email || !description) {
    return res.status(400).json({ error: 'Name, email, and description are required.' });
  }
  const prio = ['Low', 'Normal', 'Urgent'].includes(priority) ? priority : 'Normal';

  // AI classification — determine urgency and category
  let traffic_light = prio === 'Urgent' ? 'red' : 'yellow';
  let ai_category = '';
  if (process.env.GEMINI_API_KEY) {
    try {
      const aiText = await callGemini(
        `Classify this website maintenance request. Return JSON only: { "urgent": boolean, "category": string (e.g. "content update", "bug fix", "site down", "design change", "SEO", "security"), "summary": string (10 words max) }\n\nRequest: ${description}`,
        { maxTokens: 150 }
      );
      const match = aiText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.urgent) traffic_light = 'red';
        ai_category = parsed.category || '';
      }
    } catch { /* use defaults */ }
  }

  const row = db.prepare(
    'INSERT INTO maintenance_requests (client_name, client_email, website, description, priority, traffic_light, ai_category) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(client_name.trim(), client_email.trim(), (website || '').trim(), description.trim(), prio, traffic_light, ai_category);

  // Auto-ack to client
  const ackHtml = `<p>Hi ${client_name},</p>
<p>We've received your maintenance request and will get back to you within 24 hours.</p>
<p><strong>Request:</strong> ${description}</p>
<p><strong>Priority:</strong> ${prio}</p>
<p>—<br>Crown Media Group<br>crownmediagroup.co</p>`;
  sendEmail({ to: client_email, subject: 'Maintenance Request Received — Crown Media Group', html: ackHtml, text: `Hi ${client_name},\n\nWe received your request: ${description}\n\nPriority: ${prio}\n\nWe'll be in touch within 24 hours.\n\n— Crown Media Group` });

  // Notify King — red gets urgent subject + SMS
  const isRed = traffic_light === 'red';
  const kingSubject = isRed ? `🔴 RED ALERT: ${client_name} — ${ai_category || prio} — needs urgent attention` : `[${prio}] New Maintenance Request — ${client_name}`;
  const kingHtml = `<p><strong>${isRed ? '🔴 URGENT — ' : ''}New maintenance request from ${client_name}</strong> (${client_email})</p>
<p><strong>Website:</strong> ${website || 'not provided'}</p>
<p><strong>Priority:</strong> ${prio} | <strong>Status:</strong> ${traffic_light.toUpperCase()}</p>
<p><strong>Category:</strong> ${ai_category || 'unclassified'}</p>
<p><strong>Request:</strong> ${description}</p>
<p><a href="https://crm.crownmediagroup.co/admin">View in CRM →</a></p>`;
  sendEmail({ to: 'king@crownmediagroup.co', subject: kingSubject, html: kingHtml, text: `${isRed ? '🔴 RED ALERT\n' : ''}New maintenance request:\nFrom: ${client_name} (${client_email})\nSite: ${website || 'n/a'}\nPriority: ${prio}\nCategory: ${ai_category}\nRequest: ${description}` });
  if (isRed) sendAlertSMS(`🔴 RED ALERT\n${client_name}: ${description.substring(0, 100)}\nSite: ${website || 'n/a'}\ncrm.crownmediagroup.co/admin`);

  res.json({ ok: true, id: row.lastInsertRowid, traffic_light });
});

// Auth-gated: King lists all maintenance requests
app.get('/api/maintenance', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const { status } = req.query;
  let rows;
  if (status === 'all') {
    rows = db.prepare('SELECT * FROM maintenance_requests ORDER BY created_at DESC').all();
  } else {
    rows = db.prepare("SELECT * FROM maintenance_requests WHERE status = 'open' ORDER BY CASE priority WHEN 'Urgent' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END, created_at ASC").all();
  }
  res.json({ ok: true, requests: rows });
});

// Auth-gated: King marks a request complete — fires client satisfaction email
app.put('/api/maintenance/:id/complete', async (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  const { notes } = req.body;
  const row = db.prepare('SELECT * FROM maintenance_requests WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  // Generate unique confirm token for satisfaction loop
  const token = randomBytes(24).toString('hex');
  db.prepare("UPDATE maintenance_requests SET status='complete', notes=?, completed_at=datetime('now'), traffic_light='green_pending', confirm_token=? WHERE id=?").run(notes || '', token, id);

  const BASE_URL = process.env.CRM_BASE_URL || 'https://crm.crownmediagroup.co';
  const yesLink = `${BASE_URL}/api/maintenance/confirm/${token}?result=yes`;
  const noLink  = `${BASE_URL}/api/maintenance/confirm/${token}?result=no`;

  const html = `<div style="font-family:sans-serif;max-width:520px;color:#1a1a1a;line-height:1.7">
<p>Hi ${row.client_name},</p>
<p>Your maintenance request has been completed.</p>
<p><strong>Original request:</strong> ${row.description}</p>
${notes ? `<p><strong>Resolution notes:</strong> ${notes}</p>` : ''}
<p>Was everything handled to your satisfaction?</p>
<p style="margin:24px 0">
  <a href="${yesLink}" style="background:#22c55e;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;margin-right:12px">✅ Yes, all good</a>
  <a href="${noLink}" style="background:#e05c5c;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700">❌ Needs more work</a>
</p>
<p>—<br>Crown Media Group<br>crownmediagroup.co</p>
</div>`;
  await sendEmail({ to: row.client_email, subject: 'Your Maintenance Request is Complete — Crown Media Group', html, text: `Hi ${row.client_name},\n\nYour request has been completed.\n\nOriginal: ${row.description}\n${notes ? 'Notes: ' + notes + '\n' : ''}\nWas this resolved? YES: ${yesLink}\nNO: ${noLink}\n\n— Crown Media Group` });
  res.json({ ok: true });
});

// Client satisfaction confirmation — public, token-gated
app.get('/api/maintenance/confirm/:token', async (req, res) => {
  const { token } = req.params;
  const { result } = req.query;
  const row = db.prepare('SELECT * FROM maintenance_requests WHERE confirm_token = ?').get(token);
  if (!row) return res.status(404).send('<p>Link expired or not found.</p>');

  if (result === 'yes') {
    db.prepare("UPDATE maintenance_requests SET traffic_light='green', confirm_token='' WHERE id=?").run(row.id);
    sendEmail({ to: 'king@crownmediagroup.co', subject: `✅ Job Complete — ${row.client_name} confirmed happy`, html: `<p>✅ <strong>${row.client_name}</strong> confirmed their maintenance request is resolved.<br>Request: ${row.description}</p>`, text: `${row.client_name} confirmed satisfied. Job: ${row.description}` });

    // BUILD 6 — Auto-generate case study when client confirms satisfaction
    generateCaseStudy(row).catch(e => console.error('[CaseStudy]', e.message));

    return res.send(`<div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center"><h2 style="color:#22c55e">Thank you!</h2><p>We're glad everything is taken care of. Reach out anytime.</p><p style="color:#888">— Crown Media Group</p></div>`);
  }

  if (result === 'no') {
    db.prepare("UPDATE maintenance_requests SET traffic_light='yellow', status='open', confirm_token='', completed_at=NULL WHERE id=?").run(row.id);
    sendEmail({ to: 'king@crownmediagroup.co', subject: `⚠️ ${row.client_name} — maintenance needs more work`, html: `<p>⚠️ <strong>${row.client_name}</strong> said their request was NOT fully resolved.<br>Request: ${row.description}<br><a href="https://crm.crownmediagroup.co/admin">Review in CRM →</a></p>`, text: `${row.client_name} not satisfied. Re-open ticket: ${row.description}` });
    return res.send(`<div style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center"><h2 style="color:#C9A84C">Got it.</h2><p>We'll review your request and follow up shortly.</p><p style="color:#888">— Crown Media Group</p></div>`);
  }

  res.status(400).send('<p>Invalid confirmation link.</p>');
});

// Auth-gated: King manually sets traffic light on any ticket
app.put('/api/maintenance/:id/flag', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.params;
  const { traffic_light } = req.body;
  const valid = ['red', 'orange', 'yellow', 'green_pending', 'green'];
  if (!valid.includes(traffic_light)) return res.status(400).json({ error: 'Invalid traffic light value' });
  db.prepare('UPDATE maintenance_requests SET traffic_light=? WHERE id=?').run(traffic_light, id);
  res.json({ ok: true });
});

// Serve the public maintenance form (no auth)
app.get('/maintenance', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'maintenance.html'));
});

// ── Client Onboarding ─────────────────────────────────────────────────────────

const onboardLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// Serve public onboarding form (no auth)
app.get('/onboard', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'onboarding.html'));
});

// ── Onboarding helpers ────────────────────────────────────────────────────────

function buildICS({ summary, description, startISO, endISO, attendeeEmail, attendeeName }) {
  const uid = randomBytes(16).toString('hex') + '@crownmediagroup.co';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const start = startISO.replace(/[-:]/g, '').replace(/\.\d+/, '');
  const end   = endISO.replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Crown Media Group//CRM//EN',
    'METHOD:REQUEST', 'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${stamp}`,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `ORGANIZER;CN=King:mailto:king@crownmediagroup.co`,
    `ATTENDEE;CN=King;ROLE=REQ-PARTICIPANT:mailto:king@crownmediagroup.co`,
    `ATTENDEE;CN=${attendeeName};ROLE=REQ-PARTICIPANT:mailto:${attendeeEmail}`,
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

async function generateContentBrief({ business_name, owner_name, target_audience, content_goals, primary_offer, brand_tones, brand_color, brand_notes, service_tier }) {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    return await callGemini(
      `Create a 30-day content brief for a new Crown Media Group client.

Business: ${business_name}
Owner: ${owner_name}
Service Tier: ${service_tier}
Audience: ${target_audience}
Goals: ${content_goals}
Primary Offer: ${primary_offer}
Brand Tone: ${brand_tones}
Brand Color: ${brand_color}
Notes: ${brand_notes}

Format as markdown. Include:
1. Brand Voice Summary (3 sentences)
2. Content Pillars (4, with % split)
3. Week 1 Content Plan (7 post ideas with captions/hooks)
4. Hashtag Strategy (3 sets: branded, niche, broad)
5. First Reel Concept (hook, script outline, CTA)
6. Quick Wins (3 immediate actions)

Keep it specific, actionable, faith-aligned where relevant.`,
      { maxTokens: 1200 }
    );
  } catch { return null; }
}

// Public submit endpoint
app.post('/api/onboard/submit', onboardLimiter, async (req, res) => {
  const { owner_name, business_name, email, phone, website, ig_handle, target_audience, content_goals, primary_offer, brand_tones, brand_color, brand_notes, service_tier } = req.body;
  if (!owner_name || !business_name || !email) return res.status(400).json({ error: 'Name, business name, and email are required.' });

  // Save to CRM contacts
  const existing = db.prepare('SELECT id FROM contacts WHERE email = ? AND workspace_id = 1').get(email);
  let contactId;
  if (existing) {
    db.prepare("UPDATE contacts SET name=?, business=?, phone=?, website=?, status='Active Client', notes=?, workspace_id=1 WHERE id=?")
      .run(owner_name, business_name, phone || '', website || '', `Tier: ${service_tier}. IG: ${ig_handle}. Tones: ${brand_tones}. Colors: ${brand_color}. Notes: ${brand_notes}`, existing.id);
    contactId = existing.id;
  } else {
    const ins = db.prepare("INSERT INTO contacts (name, business, email, phone, source, status, notes, workspace_id) VALUES (?, ?, ?, ?, 'Onboarding', 'Active Client', ?, 1)")
      .run(owner_name, business_name, email, phone || '', `Tier: ${service_tier}. IG: ${ig_handle}. Goals: ${content_goals}. Audience: ${target_audience}`);
    contactId = ins.lastInsertRowid;
  }

  // Log interaction
  db.prepare('INSERT INTO interactions (contact_id, type, notes, outcome) VALUES (?, ?, ?, ?)').run(contactId, 'onboarding', `Onboarding form submitted. Offer: ${primary_offer}`, 'Positive');

  // Generate content brief + kickoff ICS in parallel (fire and await)
  const [brief] = await Promise.all([
    generateContentBrief({ business_name, owner_name, target_audience, content_goals, primary_offer, brand_tones, brand_color, brand_notes, service_tier }),
  ]);

  // Write brief to client folder
  const ROOT = join(__dirname, '../..');
  const clientDir = join(ROOT, 'Agency/ops/clients', business_name.replace(/[^a-z0-9\s-]/gi, '').replace(/\s+/g, '-').toLowerCase());
  if (!existsSync(clientDir)) mkdirSync(clientDir, { recursive: true });
  const today = new Date().toISOString().split('T')[0];
  if (brief) {
    writeFileSync(join(clientDir, `content-brief-${today}.md`), `# Content Brief — ${business_name}\n_Generated: ${today}_\n\n${brief}`);
  }
  // Write brand profile
  writeFileSync(join(clientDir, 'brand-profile.md'), `# Brand Profile — ${business_name}\n\n**Owner:** ${owner_name}\n**Email:** ${email}\n**Phone:** ${phone || 'n/a'}\n**Website:** ${website || 'n/a'}\n**IG:** ${ig_handle || 'n/a'}\n**Tier:** ${service_tier}\n**Color:** ${brand_color}\n**Tone:** ${brand_tones}\n**Audience:** ${target_audience}\n**Goals:** ${content_goals}\n**Offer:** ${primary_offer}\n**Notes:** ${brand_notes}\n`);

  // Build kickoff ICS (3 days from now at 10 AM ET)
  const kickoff = new Date();
  kickoff.setDate(kickoff.getDate() + 3);
  kickoff.setHours(14, 0, 0, 0); // 10 AM ET = 14:00 UTC
  const kickoffEnd = new Date(kickoff.getTime() + 30 * 60 * 1000);
  const icsContent = buildICS({
    summary: `Kickoff Call — ${business_name} x Crown Media Group`,
    description: `30-min strategy kickoff\\nService: ${service_tier}\\nPrimary Offer: ${primary_offer}\\nGoals: ${content_goals}`,
    startISO: kickoff.toISOString(),
    endISO: kickoffEnd.toISOString(),
    attendeeEmail: email,
    attendeeName: owner_name,
  });
  const icsAttachment = [{ filename: 'kickoff-call.ics', content: icsContent, contentType: 'text/calendar' }];

  // Welcome email to client — includes kickoff ICS
  const welcomeHtml = `<div style="font-family:sans-serif;max-width:560px;padding:40px 20px;background:#0d0d14;color:#e8e8e8">
    <h1 style="color:#C9A84C;font-size:22px">Welcome to Crown Media Group, ${owner_name}.</h1>
    <p style="color:#aaa;line-height:1.7;margin:16px 0">You're officially part of the team. A kickoff call has been scheduled for <strong>3 days from now at 10 AM</strong> — check your calendar for the invite.</p>
    <p style="color:#aaa;line-height:1.7">Your first content brief is already being built — tailored to <strong>${business_name}</strong>, your audience, and your goals.</p>
    <div style="margin:28px 0;padding:20px;background:#111;border-radius:8px;border:1px solid #222">
      <p style="color:#666;font-size:12px;margin-bottom:8px">YOUR PACKAGE</p>
      <p style="color:#C9A84C;font-weight:700;font-size:16px">${service_tier || 'Custom'}</p>
    </div>
    <p style="color:#555;font-size:12px;margin-top:24px;font-style:italic">"Whatever you do, work at it with all your heart, as working for the Lord." — Colossians 3:23</p>
    <p style="color:#333;font-size:12px;margin-top:16px">Crown Media Group · Columbia, SC · crownmediagroup.co</p>
  </div>`;
  sendEmail({ to: email, subject: `You're in — Crown Media Group`, html: welcomeHtml, text: `Welcome ${owner_name}!\n\nYou're in. Kickoff call is 3 days from now at 10 AM — calendar invite attached.\n\n— Crown Media Group`, attachments: icsAttachment });

  // Notify King — includes ICS + brief summary
  const briefPreview = brief ? brief.substring(0, 400) + '...' : 'Brief generation in progress.';
  const kingHtml = `<div style="font-family:sans-serif;max-width:480px;padding:32px;background:#0d0d14;color:#e8e8e8">
    <h2 style="color:#C9A84C">New Client Onboarded — ${business_name}</h2>
    <p><strong>Owner:</strong> ${owner_name}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${phone || 'not provided'}</p>
    <p><strong>Website:</strong> ${website || 'none'}</p>
    <p><strong>IG:</strong> ${ig_handle || 'not provided'}</p>
    <p><strong>Tier:</strong> ${service_tier || 'not selected'}</p>
    <p><strong>Offer:</strong> ${primary_offer}</p>
    <p><strong>Audience:</strong> ${target_audience}</p>
    <p><strong>Goals:</strong> ${content_goals}</p>
    <p><strong>Tone:</strong> ${brand_tones}</p>
    <hr style="border-color:#333;margin:16px 0">
    <p style="color:#C9A84C;font-weight:700">Content Brief Preview:</p>
    <p style="font-size:.8rem;color:#aaa;white-space:pre-wrap">${briefPreview}</p>
    <p style="color:#666;font-size:.75rem">Full brief saved: Agency/ops/clients/${business_name.replace(/\s+/g, '-').toLowerCase()}/</p>
    <a href="https://crm.crownmediagroup.co" style="display:inline-block;margin-top:16px;background:#C9A84C;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700">View in CRM →</a>
  </div>`;
  sendEmail({ to: 'king@crownmediagroup.co', subject: `New Client Onboarded — ${business_name}`, html: kingHtml, text: `New onboarding from ${owner_name} (${business_name}) — ${email}\n\nBrief saved to Agency/ops/clients/`, attachments: icsAttachment });
  sendAlertSMS(`✅ NEW CLIENT SIGNED UP\n${business_name} — ${owner_name}\nTier: ${service_tier}\nKickoff in 3 days. Brief ready.\ncrm.crownmediagroup.co`);

  res.json({ ok: true, contactId, briefGenerated: !!brief });
});

// Auth-gated: list all onboarding submissions
app.get('/api/onboard/list', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const clients = db.prepare("SELECT * FROM contacts WHERE status = 'Active Client' ORDER BY created_at DESC").all();
  res.json({ ok: true, clients });
});

// ── Client Portal ─────────────────────────────────────────────────────────────
// Clients log in with their workspace credentials and see content + requests + reports

app.get('/portal', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'portal.html'));
});

// Portal login — returns portal_session cookie scoped to workspace
app.post('/api/portal/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (email.length > 254 || password.length > 128) return res.status(400).json({ error: 'Invalid credentials' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  const dummyHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$' + 'a'.repeat(128);
  const valid = user ? verifyPassword(password, user.password_hash) : (verifyPassword(password, dummyHash), false);

  if (!valid) return res.status(401).json({ error: 'Wrong email or password.' });

  const token = createSession(user.id, user.workspace_id);
  const isProd = process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `portal_session=${token}; Path=/portal; HttpOnly; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}${isProd ? '; Secure' : ''}`);
  res.json({ ok: true, workspaceId: user.workspace_id });
});

// Portal data — content calendar, maintenance requests, reports, brand profile
app.get('/api/portal/data', async (req, res) => {
  const token = getCookie(req, 'portal_session') || getCookie(req, 'crm_session');
  const session = validateSession(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const wsId = session.workspaceId;

  // Get workspace/contact info
  const contact = db.prepare("SELECT * FROM contacts WHERE workspace_id = ? LIMIT 1").get(wsId);
  const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId);

  // Content queue — scheduled posts for this workspace
  let contentQueue = [];
  try {
    const contentPath = path.join(ROOT, 'Agency/ops/content');
    if (fs.existsSync(contentPath)) {
      const files = fs.readdirSync(contentPath).filter(f => f.endsWith('.json') || f.endsWith('.md'));
      contentQueue = files.slice(0, 10).map(f => ({
        file: f,
        date: f.split('-').slice(0, 3).join('-') || 'Scheduled',
        type: f.endsWith('.json') ? 'social' : 'content',
      }));
    }
  } catch { /* skip */ }

  // Maintenance requests for this workspace
  const requests = db.prepare(
    "SELECT id, description, status, traffic_light, ai_category, created_at FROM maintenance_requests WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 20"
  ).all(wsId);

  // Content brief — read from Agency/ops/clients/
  let contentBrief = null;
  try {
    const slug = (contact?.company || workspace?.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (slug) {
      const clientDir = path.join(ROOT, `Agency/ops/clients/${slug}`);
      if (fs.existsSync(clientDir)) {
        const briefs = fs.readdirSync(clientDir).filter(f => f.startsWith('content-brief')).sort().reverse();
        if (briefs[0]) {
          contentBrief = fs.readFileSync(path.join(clientDir, briefs[0]), 'utf8').substring(0, 2000);
        }
      }
    }
  } catch { /* skip */ }

  res.json({
    ok: true,
    client: {
      name: contact?.name || workspace?.name || session.user.email,
      company: contact?.company || workspace?.name || '',
      email: session.user.email,
    },
    contentQueue,
    maintenanceRequests: requests,
    contentBrief,
    reportUrl: null, // placeholder — monthly PDF link when available
  });
});

// ── BUILD 4: Stripe Payment Link helper ───────────────────────────────────────
const PROPOSAL_TIERS = {
  starter: { name: 'Starter',  monthly: 750,  setup: 250,  cents: 75000  },
  growth:  { name: 'Growth',   monthly: 1200, setup: 400,  cents: 120000 },
  premium: { name: 'Premium',  monthly: 3500, setup: 1000, cents: 350000 },
};

async function createStripePaymentLink(tier) {
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return null;
  const t = PROPOSAL_TIERS[tier] || PROPOSAL_TIERS.starter;
  try {
    // Create a price on-the-fly (Stripe requires a price object for payment links)
    const priceRes = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        currency: 'usd',
        unit_amount: String(t.cents),
        'product_data[name]': `Crown Media Group — ${t.name} Package (First Month)`,
      }).toString(),
    });
    const price = await priceRes.json();
    if (!price.id) return null;

    const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'line_items[0][price]': price.id,
        'line_items[0][quantity]': '1',
        'after_completion[type]': 'redirect',
        'after_completion[redirect][url]': 'https://crownmediagroup.co?payment=success',
      }).toString(),
    });
    const link = await linkRes.json();
    return link.url || null;
  } catch (e) {
    console.error('[Stripe PayLink]', e.message);
    return null;
  }
}

// ── BUILD 3: Auto-proposal on pipeline stage change ───────────────────────────
const PROPOSAL_TRIGGER_STAGES = ['Proposal Sent', 'Pitched'];

function buildProposalHtml(business, tier, notes, paymentUrl) {
  const t    = PROPOSAL_TIERS[tier] || PROPOSAL_TIERS.starter;
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const deliverables = {
    starter: ['8 custom social media posts/month','Basic brand voice guide','Monthly performance report','Content calendar','Hashtag strategy'],
    growth:  ['16 custom social media posts/month','2 AI Reels/month','Meta ads management','Full brand strategy session','Monthly analytics report'],
    premium: ['30+ posts/month across all platforms','4+ AI Reels/month','Meta + Google ads','Landing page build','Email marketing sequence','Weekly strategy calls'],
  };
  const items = (deliverables[tier] || deliverables.starter).map(d => `<li>${d}</li>`).join('');
  const cta = paymentUrl
    ? `<div style="text-align:center;margin:32px 0"><a href="${paymentUrl}" style="background:#C9A84C;color:#000;padding:16px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">Get Started — Pay Setup Fee ($${t.setup.toLocaleString()})</a></div>`
    : `<p><strong>Reply to this email</strong> and we'll send you a payment link to get started.</p>`;

  return `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#1a1a1a;background:#fff;padding:40px">
<div style="text-align:center;margin-bottom:32px">
  <h1 style="color:#C9A84C;font-size:28px;margin-bottom:4px">Crown Media Group</h1>
  <p style="color:#888;font-size:13px">Faith-driven AI Marketing | Columbia, SC | crownmediagroup.co</p>
</div>
<hr style="border:1px solid #eee">
<h2 style="font-size:22px">Marketing Proposal for ${business}</h2>
<p style="color:#888;font-size:13px">Prepared by David King &middot; ${date}</p>
<p style="background:#f9f5e8;border-left:4px solid #C9A84C;padding:12px 16px;font-style:italic">&ldquo;Write the vision and make it plain.&rdquo; &mdash; Habakkuk 2:2</p>
<h3>Recommended: ${t.name} Package &mdash; $${t.monthly.toLocaleString()}/month</h3>
<ul style="line-height:1.8">${items}</ul>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
  <tr style="background:#f5f5f5"><td style="padding:10px;font-weight:bold">Monthly retainer</td><td style="padding:10px;text-align:right">$${t.monthly.toLocaleString()}/month</td></tr>
  <tr><td style="padding:10px">One-time setup fee</td><td style="padding:10px;text-align:right">$${t.setup.toLocaleString()}</td></tr>
  <tr style="background:#C9A84C;color:#000"><td style="padding:10px;font-weight:bold">First month total</td><td style="padding:10px;text-align:right;font-weight:bold">$${(t.monthly + t.setup).toLocaleString()}</td></tr>
</table>
${cta}
<p style="font-size:13px;color:#888;text-align:center">Questions? Reply to this email or call us anytime.<br>king@crownmediagroup.co &middot; crownmediagroup.co</p>
</div>`;
}

// ── Review Request helper ─────────────────────────────────────────────────────
const GOOGLE_REVIEW_LINK = 'https://g.page/r/CrownMediaGroup/review';

async function triggerReviewRequest(contact, workspaceId) {
  if (!contact) return;
  const firstName = (contact.name || 'there').split(' ')[0];
  const smsBody   = `Hey ${firstName}, we loved working with you! Mind leaving us a quick Google review? It means the world to us. ${GOOGLE_REVIEW_LINK}`;
  const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
<h2 style="color:#C9A84C">Thanks for working with us!</h2>
<p>Hi ${firstName},</p>
<p>We had an amazing time working with you and hope you're seeing real results. If you're happy with the work, would you mind taking 60 seconds to leave us a Google review?</p>
<p><a href="${GOOGLE_REVIEW_LINK}" style="background:#C9A84C;color:#000;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;margin:16px 0">Leave a Google Review</a></p>
<p style="color:#888;font-size:13px">It only takes a minute and helps other Columbia SC businesses find us.<br><br>With gratitude,<br>David King<br>Crown Media Group</p>
</div>`;

  let method = '';

  // SMS
  if (contact.phone) {
    try {
      const sid   = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from  = process.env.TWILIO_FROM_NUMBER;
      if (sid && token && from) {
        const creds = Buffer.from(`${sid}:${token}`).toString('base64');
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ From: from, To: normalizePhone(contact.phone), Body: smsBody }).toString(),
        });
        const msg = await r.json();
        db.prepare('INSERT INTO sms_inbox (contact_id, from_number, to_number, body, direction, twilio_sid, workspace_id, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime("now"))')
          .run(contact.id, from, normalizePhone(contact.phone), smsBody, 'outbound', msg.sid || null, workspaceId || 1);
        method += 'sms';
        console.log(`[ReviewReq] SMS sent to ${contact.phone}`);
      }
    } catch (e) { console.error('[ReviewReq] SMS error:', e.message); }
  }

  // Email
  if (contact.email) {
    try {
      await sendEmail({
        to: contact.email,
        subject: `${firstName}, would you leave us a quick review?`,
        html: emailHtml,
        text: smsBody,
      });
      method += method ? '+email' : 'email';
      console.log(`[ReviewReq] Email sent to ${contact.email}`);
    } catch (e) { console.error('[ReviewReq] Email error:', e.message); }
  }

  if (method) {
    db.prepare('INSERT INTO review_requests (contact_id, workspace_id, method) VALUES (?, ?, ?)')
      .run(contact.id, workspaceId || 1, method);
  }
}

app.put('/api/contacts/:id/stage', async (req, res) => {
  const { stage, tier = 'starter', notes = '' } = req.body;
  if (!stage) return res.status(400).json({ error: 'stage required' });

  // Map stage → status
  const STAGE_TO_STATUS = {
    'Not Contacted': 'Not Contacted',
    'Reached Out':   'Called',
    'Interested':    'Pitched',
    'Proposal Sent': 'Proposal Sent',
    'Closed Won':    'Client',
    'Closed Lost':   'Not Interested',
  };
  const status = STAGE_TO_STATUS[stage];
  if (!status) return res.status(400).json({ error: 'Unknown stage' });

  // Update contact status
  db.prepare('UPDATE contacts SET status=? WHERE id=? AND workspace_id=?').run(status, req.params.id, req.workspaceId);

  // Auto-proposal when moving to "Proposal Sent" or "Interested" (Pitched)
  const contactForTrigger = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id);
  if (PROPOSAL_TRIGGER_STAGES.includes(stage)) {
    if (contactForTrigger && contactForTrigger.email) {
      try {
        const paymentUrl = await createStripePaymentLink(tier);
        const html = buildProposalHtml(contactForTrigger.business || contactForTrigger.name, tier, notes, paymentUrl);
        await sendEmail({
          to: contactForTrigger.email,
          subject: `Marketing Proposal for ${contactForTrigger.business || contactForTrigger.name} — Crown Media Group`,
          html,
          text: `Hi ${contactForTrigger.name}, your proposal from Crown Media Group is ready. Visit crownmediagroup.co or reply to this email to get started.`,
        });
        console.log(`[Proposal] Sent to ${contactForTrigger.email} | tier=${tier} | paylink=${paymentUrl ? 'yes' : 'no'}`);
      } catch (e) {
        console.error('[Proposal send error]', e.message);
      }
    }
  }

  // Auto review request when Closed Won
  if (stage === 'Closed Won' && contactForTrigger) {
    triggerReviewRequest(contactForTrigger, req.workspaceId).catch(e => console.error('[ReviewReq]', e.message));
  }

  res.json({ ok: true, status });
});

// ── BUILD 6: Case study auto-generator ────────────────────────────────────────
async function generateCaseStudy(maintenanceRow) {
  if (!process.env.GEMINI_API_KEY) return;
  const slug = (maintenanceRow.client_name || 'client').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const date = new Date().toISOString().slice(0, 10);

  const body = await callGemini(
    `Write a 3-paragraph case study for Crown Media Group's portfolio.
Client: ${maintenanceRow.client_name || 'A Columbia SC business'}
Problem they reported: "${maintenanceRow.description}"
Result: Resolved and client confirmed satisfied.

Format:
**Problem:** [what they came to us with — 2-3 sentences]
**Solution:** [what Crown Media Group did — 2-3 sentences, professional and specific]
**Result:** [outcome — 1-2 sentences, client happy, business improved]

Keep it under 200 words. Professional, faith-forward, results-focused. Do NOT invent fake metrics.`,
    { maxTokens: 600 }
  );
  const dir  = path.join(ROOT, 'Agency/ops/docs/case-studies');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `CASE-${date}-${slug}.md`;
  const full = `# Case Study: ${maintenanceRow.client_name || 'Client'}\n_Crown Media Group | ${date}_\n\n${body}\n`;
  fs.writeFileSync(path.join(dir, filename), full);

  // Email King the case study
  await sendEmail({
    to: 'king@crownmediagroup.co',
    subject: `New Win — Case Study Ready: ${maintenanceRow.client_name || 'Client'}`,
    html: `<h2>New Portfolio Win</h2><p>${body.replace(/\n/g,'<br>')}</p><p style="color:#888;font-size:13px">Saved to Agency/ops/docs/case-studies/${filename}</p>`,
    text: `New case study ready:\n\n${body}\n\nSaved to Agency/ops/docs/case-studies/${filename}`,
  });
  console.log(`[CaseStudy] Generated: ${filename}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── CROWN SCOUT PROGRAM ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Helper: generate unique 8-char referral code
function genReferralCode(name) {
  const slug = name.replace(/\s+/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `${slug}${rand}`;
}

// Serve scout dashboard page (public)
app.get('/scout-dashboard', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'scout-dashboard.html'));
});

// POST /api/scouts/apply — public, no auth — scout sign-up
app.post('/api/scouts/apply', async (req, res) => {
  try {
    const { name, email, phone, how_you_know, payment_method, payment_handle } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    const existing = db.prepare('SELECT id FROM scouts WHERE email = ?').get(email);
    if (existing) {
      const scout = db.prepare('SELECT name, referral_code, total_earned, total_referrals FROM scouts WHERE email = ?').get(email);
      const refLink = `https://crownmediagroup.co/?ref=${scout.referral_code}`;
      sendEmail({
        to: email,
        subject: 'Your Crown Scout referral link',
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto"><div style="background:#1a1a2e;padding:24px;text-align:center"><h1 style="color:#C9A84C;margin:0;font-size:22px">Your Crown Scout Link</h1></div><div style="padding:24px;background:#fff"><p>Hi ${scout.name},</p><p>Here's your referral link — every business you send that signs with us earns you <strong>$50 cash</strong>:</p><div style="background:#f0fdf4;border-left:4px solid #059669;padding:16px;margin:16px 0;border-radius:4px"><strong>Referral link:</strong><br><a href="${refLink}" style="color:#059669;word-break:break-all">${refLink}</a><br><br><strong>Your Scout code:</strong> <code style="font-size:18px;font-weight:bold;color:#1a1a2e">${scout.referral_code}</code></div><p>Track your earnings:<br><a href="https://crm.crownmediagroup.co/scout-dashboard" style="color:#C9A84C">crm.crownmediagroup.co/scout-dashboard</a> → enter code <strong>${scout.referral_code}</strong></p><p>— Crown Media Group</p></div></div>`,
        text: `Hi ${scout.name},\n\nYour referral link: ${refLink}\nYour code: ${scout.referral_code}\n\nTrack earnings: crm.crownmediagroup.co/scout-dashboard\n\n— Crown Media Group`,
      });
      return res.status(409).json({
        error: 'already_registered',
        name: scout.name,
        referral_code: scout.referral_code,
        total_earned: scout.total_earned,
        total_referrals: scout.total_referrals,
      });
    }

    let code = genReferralCode(name);
    // Ensure uniqueness
    while (db.prepare('SELECT id FROM scouts WHERE referral_code = ?').get(code)) {
      code = genReferralCode(name + Math.random());
    }

    db.prepare('INSERT INTO scouts (name, email, phone, referral_code, notes, payment_method, payment_handle) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(name, email, phone || '', code, how_you_know || '', payment_method || '', payment_handle || '');

    // Welcome email
    const refLink = `https://crownmediagroup.co/?ref=${code}`;
    const welcomeHtml = `
<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
  <div style="background:#1a1a2e;padding:24px;text-align:center">
    <h1 style="color:#C9A84C;margin:0;font-size:22px">Welcome to the Crown Scout Program</h1>
  </div>
  <div style="padding:24px;background:#fff">
    <p>Hi ${name},</p>
    <p>You're in. Here's how to start earning $50 per client you send our way:</p>

    <div style="background:#f0fdf4;border-left:4px solid #059669;padding:16px;margin:16px 0;border-radius:4px">
      <strong>Your referral link:</strong><br>
      <a href="${refLink}" style="color:#059669;word-break:break-all">${refLink}</a><br><br>
      <strong>Your Scout code:</strong> <code style="font-size:18px;font-weight:bold;color:#1a1a2e">${code}</code>
    </div>

    <h3>How it works:</h3>
    <ol>
      <li>Share your link with any business owner who needs marketing</li>
      <li>We close the deal — you don't sell anything</li>
      <li>Get <strong>$50 cash</strong> within 7 days of their first payment</li>
    </ol>

    <h3>Done-for-you message (copy and send):</h3>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;padding:16px;border-radius:4px;font-style:italic">
      "Hey [Name], I just found a marketing agency that's doing serious work for local businesses — AI-powered content, social media, the whole thing. Thought of you. Check them out: ${refLink}"
    </div>

    <p style="margin-top:24px">Track your referrals anytime:<br>
    <a href="https://crm.crownmediagroup.co/scout-dashboard" style="color:#C9A84C">crm.crownmediagroup.co/scout-dashboard</a> → enter code <strong>${code}</strong></p>

    <p>Questions? Reply to this email.<br><br>— David King<br><em>Crown Media Group</em></p>
  </div>
  <div style="background:#1a1a2e;padding:12px;text-align:center">
    <p style="color:#888;font-size:11px;margin:0">Crown Media Group | Columbia, SC | crownmediagroup.co</p>
  </div>
</div>`;

    await sendEmail({
      to: email,
      subject: 'You\'re a Crown Scout — here\'s your $50 referral link',
      html: welcomeHtml,
      text: `Welcome ${name}!\n\nYour referral link: ${refLink}\nYour code: ${code}\n\nShare with any business owner who needs marketing — we close, you earn $50 cash within 7 days.\n\nTrack your referrals: crm.crownmediagroup.co/scout-dashboard\n\n— Crown Media Group`,
    });

    // Notify King
    sendEmail({
      to: 'king@crownmediagroup.co',
      subject: `New Scout: ${name}`,
      html: `<p><strong>${name}</strong> (${email}) just joined the Crown Scout Program.<br>Code: <strong>${code}</strong><br>${how_you_know ? 'How they know business owners: ' + how_you_know : ''}</p>`,
      text: `New scout: ${name} (${email}) — code: ${code}`,
    });

    res.json({ ok: true, referral_code: code, referral_link: refLink });
  } catch (e) {
    console.error('[Scout] Apply error:', e.message);
    res.status(500).json({ error: 'Something went wrong. Try again.' });
  }
});

// GET /api/scouts/dashboard/:code — public — scout sees their own stats
app.get('/api/scouts/dashboard/:code', (req, res) => {
  const scout = db.prepare('SELECT id, name, email, referral_code, status, tier, total_referrals, total_earned, joined_at FROM scouts WHERE referral_code = ?').get(req.params.code);
  if (!scout) return res.status(404).json({ error: 'Scout code not found.' });

  const refs = db.prepare('SELECT referred_business, referred_email, status, commission_amount, paid_out, created_at FROM referrals WHERE scout_id = ? ORDER BY created_at DESC').all(scout.id);
  const pending_payout = refs.filter(r => r.status === 'signed' && !r.paid_out).reduce((s, r) => s + r.commission_amount, 0);

  res.json({ ok: true, scout, referrals: refs, pending_payout });
});

// GET /api/scouts — admin — list all scouts
app.get('/api/scouts', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const scouts = db.prepare(`
    SELECT s.*, COUNT(r.id) as referral_count,
      SUM(CASE WHEN r.paid_out = 1 THEN r.commission_amount ELSE 0 END) as paid_total,
      SUM(CASE WHEN r.paid_out = 0 AND r.status = 'signed' THEN r.commission_amount ELSE 0 END) as owed_total
    FROM scouts s
    LEFT JOIN referrals r ON r.scout_id = s.id
    GROUP BY s.id
    ORDER BY s.joined_at DESC
  `).all();

  res.json({ ok: true, scouts });
});

// GET /api/scouts/:id — admin — scout detail + referrals
app.get('/api/scouts/:id', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const scout = db.prepare('SELECT * FROM scouts WHERE id = ?').get(req.params.id);
  if (!scout) return res.status(404).json({ error: 'Scout not found' });

  const refs = db.prepare('SELECT * FROM referrals WHERE scout_id = ? ORDER BY created_at DESC').all(scout.id);
  res.json({ ok: true, scout, referrals: refs });
});

// PUT /api/referrals/:id/status — admin — mark paid/signed/lost
app.put('/api/referrals/:id/status', async (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { status, paid_out, payout_hold } = req.body || {};
  const ref = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
  if (!ref) return res.status(404).json({ error: 'Referral not found' });

  const updates = [];
  const vals = [];
  if (status) { updates.push('status = ?'); vals.push(status); }
  if (paid_out !== undefined) {
    updates.push('paid_out = ?', 'paid_at = ?');
    vals.push(paid_out ? 1 : 0, paid_out ? new Date().toISOString() : null);
  }
  if (payout_hold !== undefined) { updates.push('payout_hold = ?'); vals.push(payout_hold ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(ref.id);
  db.prepare(`UPDATE referrals SET ${updates.join(', ')} WHERE id = ?`).run(...vals);

  // If marking paid, email the scout
  if (paid_out) {
    const scout = db.prepare('SELECT * FROM scouts WHERE id = ?').get(ref.scout_id);
    if (scout) {
      db.prepare('UPDATE scouts SET total_earned = total_earned + ?, total_referrals = total_referrals + 1 WHERE id = ?').run(ref.commission_amount, scout.id);
      sendEmail({
        to: scout.email,
        subject: `You've been paid — $${ref.commission_amount} from Crown Media Group`,
        html: `<div style="font-family:sans-serif;max-width:560px"><div style="background:#1a1a2e;padding:20px;text-align:center"><h2 style="color:#C9A84C;margin:0">Payment Sent!</h2></div><div style="padding:24px"><p>Hi ${scout.name},</p><p>Your <strong>$${ref.commission_amount}</strong> referral commission for <strong>${ref.referred_business || 'your referral'}</strong> has been paid.</p><p>Total earned so far: <strong>$${(scout.total_earned + ref.commission_amount).toFixed(2)}</strong></p><p>Keep sending business owners our way — every one is $50 in your pocket.</p><p>— David King<br>Crown Media Group</p></div></div>`,
        text: `Hi ${scout.name},\n\nYour $${ref.commission_amount} commission for ${ref.referred_business || 'your referral'} has been paid. Total earned: $${(scout.total_earned + ref.commission_amount).toFixed(2)}.\n\n— Crown Media Group`,
      });
    }
  }

  res.json({ ok: true });
});

// POST /api/scouts/:id/referral — scout submits a lead they're sending
app.post('/api/scouts/:id/referral', (req, res) => {
  const scout = db.prepare('SELECT * FROM scouts WHERE id = ?').get(req.params.id);
  if (!scout || scout.status !== 'active') return res.status(404).json({ error: 'Scout not found' });

  const { referred_business, referred_email } = req.body || {};
  if (!referred_business) return res.status(400).json({ error: 'Business name required' });

  db.prepare('INSERT INTO referrals (scout_id, referred_business, referred_email) VALUES (?, ?, ?)')
    .run(scout.id, referred_business, referred_email || '');

  sendEmail({
    to: 'king@crownmediagroup.co',
    subject: `Scout Lead: ${referred_business} — from ${scout.name}`,
    html: `<p>Scout <strong>${scout.name}</strong> sent a new lead:<br><strong>${referred_business}</strong>${referred_email ? ' — ' + referred_email : ''}</p><p><a href="https://crm.crownmediagroup.co/admin">View in CRM →</a></p>`,
    text: `Scout ${scout.name} sent a lead: ${referred_business} ${referred_email || ''}`,
  });

  res.json({ ok: true });
});

// GET /api/stats/scouts — admin — aggregate scout stats
app.get('/api/stats/scouts', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT s.id)                                                    as total_scouts,
      COUNT(r.id)                                                             as total_referrals,
      SUM(CASE WHEN r.status = 'signed' THEN 1 ELSE 0 END)                  as signed_count,
      SUM(CASE WHEN r.paid_out = 1 THEN r.commission_amount ELSE 0 END)     as total_paid_out,
      SUM(CASE WHEN r.paid_out = 0 AND r.status = 'signed' AND r.payout_hold = 0 AND r.refund_status = '' THEN r.commission_amount ELSE 0 END) as owed,
      SUM(CASE WHEN r.paid_out = 0 AND r.status = 'signed' AND (r.payout_hold = 1 OR r.refund_status != '') THEN r.commission_amount ELSE 0 END) as held
    FROM scouts s
    LEFT JOIN referrals r ON r.scout_id = s.id
    WHERE s.status = 'active'
  `).get();

  res.json({ ok: true, stats });
});

// PUT /api/scouts/:id/payment — admin updates scout payment info
app.put('/api/scouts/:id/payment', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const { payment_method, payment_handle } = req.body || {};
  const allowed = ['CashApp', 'Venmo', 'Zelle', 'PayPal', ''];
  if (payment_method && !allowed.includes(payment_method)) return res.status(400).json({ error: 'Invalid payment method' });
  db.prepare('UPDATE scouts SET payment_method = ?, payment_handle = ?, payment_updated_at = ? WHERE id = ?')
    .run(payment_method || '', payment_handle || '', new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

// PUT /api/scouts/by-code/:code/payment — scout self-updates payment method (public, code is secret)
app.put('/api/scouts/by-code/:code/payment', (req, res) => {
  const scout = db.prepare("SELECT id FROM scouts WHERE referral_code = ? AND status = 'active'").get(req.params.code);
  if (!scout) return res.status(404).json({ error: 'Scout not found' });
  const { payment_method, payment_handle } = req.body || {};
  const allowed = ['CashApp', 'Venmo', 'Zelle', 'PayPal'];
  if (!payment_method || !allowed.includes(payment_method)) return res.status(400).json({ error: 'Valid payment method required (CashApp, Venmo, Zelle, PayPal)' });
  if (!payment_handle?.trim()) return res.status(400).json({ error: 'Handle required' });
  db.prepare('UPDATE scouts SET payment_method = ?, payment_handle = ?, payment_updated_at = ? WHERE id = ?')
    .run(payment_method, payment_handle.trim(), new Date().toISOString(), scout.id);
  res.json({ ok: true });
});

// POST /api/admin/referrals — admin manually logs a word-of-mouth referral
app.post('/api/admin/referrals', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const { scout_id, referred_business, referred_email, contact_id } = req.body || {};
  if (!scout_id || !referred_business) return res.status(400).json({ error: 'scout_id and referred_business required' });
  const scout = db.prepare('SELECT id FROM scouts WHERE id = ?').get(scout_id);
  if (!scout) return res.status(404).json({ error: 'Scout not found' });
  let linkedContact = contact_id || null;
  if (!linkedContact && referred_email) {
    const c = db.prepare('SELECT id FROM contacts WHERE email = ? LIMIT 1').get(referred_email);
    if (c) linkedContact = c.id;
  }
  const eligible = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO referrals (scout_id, contact_id, referred_business, referred_email, payout_eligible_at) VALUES (?, ?, ?, ?, ?)')
    .run(scout.id, linkedContact, referred_business, referred_email || '', eligible);
  res.json({ ok: true });
});

// POST /api/scouts/batch-mark-paid — pay all eligible scouts in one shot
app.post('/api/scouts/batch-mark-paid', async (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const now = new Date().toISOString();
  const eligible = db.prepare(`
    SELECT r.*, s.name as scout_name, s.email as scout_email, s.total_earned as scout_earned,
           s.payment_method, s.payment_handle
    FROM referrals r JOIN scouts s ON s.id = r.scout_id
    WHERE r.status = 'signed' AND r.paid_out = 0 AND r.payout_hold = 0 AND r.refund_status = ''
      AND (r.payout_eligible_at IS NULL OR r.payout_eligible_at <= ?)
  `).all(now);
  const skipped = db.prepare(`
    SELECT COUNT(*) as c FROM referrals
    WHERE status = 'signed' AND paid_out = 0
      AND (payout_hold = 1 OR refund_status != '' OR (payout_eligible_at > ? AND payout_eligible_at IS NOT NULL))
  `).get(now).c;
  let paid_count = 0, total_amount = 0;
  for (const r of eligible) {
    db.prepare('UPDATE referrals SET paid_out = 1, paid_at = ? WHERE id = ?').run(now, r.id);
    db.prepare('UPDATE scouts SET total_earned = total_earned + ?, total_referrals = total_referrals + 1 WHERE id = ?').run(r.commission_amount, r.scout_id);
    sendEmail({
      to: r.scout_email,
      subject: `You've been paid — $${r.commission_amount} from Crown Media Group`,
      html: `<div style="font-family:sans-serif;max-width:560px"><div style="background:#1a1a2e;padding:20px;text-align:center"><h2 style="color:#C9A84C;margin:0">Payment Sent!</h2></div><div style="padding:24px"><p>Hi ${r.scout_name},</p><p>Your <strong>$${r.commission_amount}</strong> commission for <strong>${r.referred_business || 'your referral'}</strong> has been paid${r.payment_method ? ' via ' + r.payment_method + (r.payment_handle ? ' (' + r.payment_handle + ')' : '') : ''}.</p><p>Total earned: <strong>$${(r.scout_earned + r.commission_amount).toFixed(2)}</strong></p><p>Keep sending business owners our way!</p><p>— David King<br>Crown Media Group</p></div></div>`,
      text: `Hi ${r.scout_name}, your $${r.commission_amount} commission has been paid. Total: $${(r.scout_earned + r.commission_amount).toFixed(2)}. — Crown Media Group`,
    });
    paid_count++;
    total_amount += r.commission_amount;
  }
  res.json({ ok: true, paid_count, total_amount, skipped_hold_count: skipped });
});

// POST /api/internal/referral-signed — called by Stripe webhook when client pays
app.post('/api/internal/referral-signed', (req, res) => {
  if (req.headers['x-crm-secret'] !== process.env.CRM_INTERNAL_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { email, scout_code } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const contact = db.prepare('SELECT id, referred_by_scout FROM contacts WHERE email = ? LIMIT 1').get(email);
  const code = scout_code || contact?.referred_by_scout;
  if (!code) return res.json({ ok: true, matched: false });
  const scout = db.prepare('SELECT id FROM scouts WHERE referral_code = ?').get(code);
  if (!scout) return res.json({ ok: true, matched: false });
  const eligible = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const existing = db.prepare('SELECT id FROM referrals WHERE scout_id = ? AND referred_email = ? LIMIT 1').get(scout.id, email);
  if (existing) {
    db.prepare("UPDATE referrals SET status = 'signed', payout_hold = 1, payout_eligible_at = ?, contact_id = COALESCE(contact_id, ?) WHERE id = ?")
      .run(eligible, contact?.id || null, existing.id);
  } else {
    const biz = contact ? db.prepare('SELECT business FROM contacts WHERE id = ?').get(contact.id) : null;
    db.prepare("INSERT INTO referrals (scout_id, contact_id, referred_email, referred_business, status, payout_hold, payout_eligible_at) VALUES (?, ?, ?, ?, 'signed', 1, ?)")
      .run(scout.id, contact?.id || null, email, biz?.business || '', eligible);
  }
  res.json({ ok: true, matched: true });
});

// POST /api/internal/referral-refunded — called by Stripe webhook on refund
app.post('/api/internal/referral-refunded', (req, res) => {
  if (req.headers['x-crm-secret'] !== process.env.CRM_INTERNAL_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const contact = db.prepare('SELECT id, referred_by_scout FROM contacts WHERE email = ? LIMIT 1').get(email);
  if (!contact?.referred_by_scout) return res.json({ ok: true, matched: false });
  const scout = db.prepare('SELECT * FROM scouts WHERE referral_code = ?').get(contact.referred_by_scout);
  if (!scout) return res.json({ ok: true, matched: false });
  const ref = db.prepare("SELECT * FROM referrals WHERE scout_id = ? AND (referred_email = ? OR contact_id = ?) AND status = 'signed' ORDER BY created_at DESC LIMIT 1")
    .get(scout.id, email, contact.id);
  if (!ref) return res.json({ ok: true, matched: false });
  if (ref.paid_out) {
    db.prepare("UPDATE referrals SET refund_status = 'clawback', payout_hold = 1 WHERE id = ?").run(ref.id);
    sendEmail({
      to: 'king@crownmediagroup.co',
      subject: `CLAWBACK ALERT: ${scout.name} — client refunded`,
      html: `<div style="font-family:sans-serif;max-width:560px;padding:24px"><h2 style="color:#ef4444">Clawback Required</h2><p>A client was refunded and the scout commission was already paid.</p><p><strong>Scout:</strong> ${scout.name} (${scout.email})<br><strong>Amount to deduct:</strong> $${ref.commission_amount}<br><strong>Referral:</strong> ${ref.referred_business || email}</p><p>Deduct $${ref.commission_amount} from ${scout.name}'s next payout or contact them directly.</p><a href="https://crm.crownmediagroup.co/admin">View in CRM</a></div>`,
      text: `CLAWBACK: Deduct $${ref.commission_amount} from ${scout.name}. Client refunded.`,
    });
  } else {
    db.prepare("UPDATE referrals SET refund_status = 'refunded', payout_hold = 1 WHERE id = ?").run(ref.id);
    sendEmail({
      to: scout.email,
      subject: `Update on your referral — Crown Media Group`,
      html: `<div style="font-family:sans-serif;max-width:560px;padding:24px"><p>Hi ${scout.name},</p><p>A refund was issued on a client you referred. The $${ref.commission_amount} commission for <strong>${ref.referred_business || 'that referral'}</strong> has been frozen.</p><p>We appreciate your continued partnership!</p><p>— David King<br>Crown Media Group</p></div>`,
      text: `Hi ${scout.name}, a refund was issued on one of your referrals. Commission frozen. — Crown Media Group`,
    });
  }
  res.json({ ok: true, matched: true });
});

// ── Fallback → serve index.html (requires auth) ───────────────────────────────
app.get('*', (req, res) => {
  const session = validateSession(getCookie(req, 'crm_session'));
  if (!session) return res.redirect('/login');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n[CRM] Crown Media Group CRM`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   ${db.prepare('SELECT COUNT(*) as c FROM contacts').get().c} contacts loaded\n`);
});
