// _outreach-helpers.mjs — shared logic for the autopilot scheduled functions.
//
// Centralises:
//   - CRM client (token-authenticated GET/PATCH)
//   - Workspace settings read/write
//   - Resend send wrapper with optional attachment
//   - Email cohort filtering (matches the manual filter we used 2026-05-22)

import { Resend } from 'resend';

const CRM_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const SEED_TOKEN = process.env.SEED_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_NAME = 'David King — Crown Media Group';
const FROM_EMAIL = process.env.OUTREACH_FROM || 'king@crownmediagroup.co';

if (!SEED_TOKEN) throw new Error('SEED_TOKEN env var required');
if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY env var required');

const resend = new Resend(RESEND_API_KEY);

// ── CRM CLIENT ────────────────────────────────────────────────────────────
export async function crmFetchAllChurches() {
  const r = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${SEED_TOKEN}&limit=2000`);
  if (!r.ok) throw new Error(`CRM fetch failed: HTTP ${r.status}`);
  const data = await r.json();
  return data.churches || [];
}

export async function crmPatchChurch(id, fields) {
  const r = await fetch(`${CRM_URL}/api/kingdom-reach/churches/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SEED_TOKEN, ...fields }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`PATCH /churches/${id} failed: HTTP ${r.status} ${txt.slice(0,120)}`);
  }
  return r.json();
}

export async function crmMarkReplied(email) {
  const r = await fetch(`${CRM_URL}/api/kingdom-reach/churches/mark-replied-church`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SEED_TOKEN, email }),
  });
  return r.ok ? r.json() : { ok: false, error: `HTTP ${r.status}` };
}

export async function crmMarkBounced(email, reason) {
  const r = await fetch(`${CRM_URL}/api/kingdom-reach/churches/mark-bounced`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SEED_TOKEN, email, reason }),
  });
  return r.ok ? r.json() : { ok: false, error: `HTTP ${r.status}` };
}

// ── WORKSPACE SETTINGS ────────────────────────────────────────────────────
export async function getWorkspaceSettings() {
  const r = await fetch(`${CRM_URL}/api/kingdom-reach/workspace-settings?token=${SEED_TOKEN}`);
  if (!r.ok) throw new Error(`workspace-settings fetch failed: HTTP ${r.status}`);
  const data = await r.json();
  // Flatten: { outreach_paused: 'false', last_reply_poll_at: '...' }
  const flat = {};
  for (const [k, v] of Object.entries(data.settings || {})) flat[k] = v.value;
  return flat;
}

export async function setWorkspaceSetting(key, value) {
  const r = await fetch(`${CRM_URL}/api/kingdom-reach/workspace-settings/${key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: SEED_TOKEN, value: String(value) }),
  });
  if (!r.ok) throw new Error(`set ${key} failed: HTTP ${r.status}`);
  return r.json();
}

export async function getStats7d() {
  const r = await fetch(`${CRM_URL}/api/kingdom-reach/stats/last-7-days?token=${SEED_TOKEN}`);
  if (!r.ok) throw new Error(`stats fetch failed: HTTP ${r.status}`);
  return r.json();
}

// ── COHORT FILTERING ──────────────────────────────────────────────────────
// Returns records eligible for the next outreach wave.
// "safe" = has email, not unsubscribed, not bounced, not archived,
//          and either never contacted OR last touched > MIN_DAYS_SINCE_LAST_TOUCH days ago.
export function filterSafeToSend(churches, { minDaysSinceLastTouch = 7 } = {}) {
  const now = Date.now();
  const cutoff = minDaysSinceLastTouch * 24 * 3600 * 1000;

  const eligible = churches.filter(c => {
    if (!c.email || !c.email.includes('@')) return false;
    if (c.unsubscribed === 1) return false;
    if (c.email_bounced === 1) return false;
    if (c.replied === 1) return false;
    const status = (c.status || '').toLowerCase();
    if (status.includes('unsub')) return false;
    if (status.includes('bounced')) return false;
    if (status.includes('archived')) return false;
    const notes = (c.notes || '').toLowerCase();
    if (notes.includes('merged_into_id')) return false;
    return true;
  });

  // Dedupe by lowercased email — keep first match (most recent ID-wise)
  const seen = new Set();
  const unique = eligible.filter(c => {
    const e = c.email.toLowerCase().trim();
    if (seen.has(e)) return false;
    seen.add(e);
    return true;
  });

  // Filter by recency
  return unique.filter(c => {
    const lastTouch = Math.max(
      c.email_sent_at ? new Date(c.email_sent_at).getTime() : 0,
      c.follow_up_sent_at ? new Date(c.follow_up_sent_at).getTime() : 0
    );
    if (lastTouch === 0) return true;            // never contacted — safe
    return (now - lastTouch) > cutoff;           // cooldown passed
  });
}

// ── RESEND WRAPPER ────────────────────────────────────────────────────────
/**
 * Send an email via Resend with optional PDF attachment (base64).
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.text
 * @param {string} [opts.html]
 * @param {Buffer} [opts.attachmentBytes]
 * @param {string} [opts.attachmentFilename]
 * @param {Record<string,string>} [opts.headers]
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, text, html, attachmentBytes, attachmentFilename, headers = {} }) {
  const payload = {
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject,
    text,
    headers,
  };
  if (html) payload.html = html;
  if (attachmentBytes && attachmentFilename) {
    payload.attachments = [{
      filename: attachmentFilename,
      content: Buffer.from(attachmentBytes).toString('base64'),
    }];
  }
  try {
    const { data, error } = await resend.emails.send(payload);
    if (error) return { ok: false, error: error.message || JSON.stringify(error) };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── EMAIL BODY TEMPLATE (matches the manual pitch send) ────────────────────
export function firstNameFrom(pastor) {
  if (!pastor) return 'Friend';
  const cleaned = String(pastor).replace(/^(dr\.?|rev\.?|pastor|fr\.?|sr\.?|brother|sister|deacon|elder|bishop|mr\.?|mrs\.?|ms\.?)\s+/i, '');
  const first = cleaned.split(/[\s(]/)[0];
  if (!first) return 'Friend';
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}

export function pitchEmailBody({ name, firstName, orgType }) {
  const isSchool = orgType === 'school';
  const isMission = ['nonprofit','missions','recovery','prison','men','women','mixed','network','media','youth'].includes(orgType);
  const orgPhrase = isSchool
    ? `families discover what you're building at ${name}`
    : isMission ? `more people connect with ${name}'s mission` : `more people connect with ${name}`;

  return {
    subject: `A free first project for ${name}`,
    text: `Hi ${firstName},

I'm David King, founder of Crown Media Group — faith-aligned marketing and media based in Columbia, SC.

I put together a one-page personalized offering for ${name}. It outlines what I'd love to build for you at no cost, no commitment. It's attached to this email.

The short version: I want to help ${orgPhrase} online. AI-powered video reels, custom website, social media management, brand identity, royalty-free music — pick whatever would actually serve you and I'll build it free as a first project. If it helps, we talk. If it doesn't, you keep the work.

This is Kingdom economy — give first, talk later (Luke 6:38).

The attached PDF has the details. Would love a yes, no, or "tell me more."

In Christ's service,

King
David King
Founder, Crown Media Group
(908) 848-1436  |  king@crownmediagroup.co
crownmediagroup.co`,
  };
}
