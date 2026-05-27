// tools/kingdom-reach/index.js — Kingdom Reach module mounted into the CRM Express app
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { createHmac } from 'crypto';

// HMAC-signed unsubscribe token — uses SEED_TOKEN as the signing secret.
// Keeps tokens short (16 hex chars / 64 bits) — adequate for a non-sensitive opt-out flow.
function unsubscribeSig(churchId) {
  const secret = process.env.SEED_TOKEN || '';
  return createHmac('sha256', secret).update(`unsub:${churchId}`).digest('hex').slice(0, 16);
}

import { ensureSchema, slugify }                from './schema.js';
import { seedChurches }                         from './seed.js';
import { extractTranscript, pipelineValue }     from './processor.js';
import { writeSite }                            from './generators/website.js';
import { writeProposal }                        from './generators/proposal.js';
import { writeEmailDraft, sendViaResend }       from './generators/email.js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const INBOX_DIR  = join(__dirname, 'inbox');
const PUBLIC_DIR = join(__dirname, 'public');
const LOG_DIR    = join(__dirname, 'logs');

function ensureDirs() {
  for (const d of [OUTPUT_DIR, INBOX_DIR, LOG_DIR,
                   join(OUTPUT_DIR, 'websites'),
                   join(OUTPUT_DIR, 'proposals'),
                   join(OUTPUT_DIR, 'emails')]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

async function sendAlertEmail(churchName, errorMsg, dispatchId) {
  const { sendViaResend } = await import('./generators/email.js');
  const subject = `[Kingdom Reach] Pipeline failed — ${churchName}`;
  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
    <h2 style="color:#dc2626">Pipeline Failed</h2>
    <p><strong>Church:</strong> ${churchName}</p>
    <p><strong>Dispatch ID:</strong> ${dispatchId}</p>
    <p><strong>Error:</strong> <code style="background:#f3f4f6;padding:4px 8px;border-radius:4px">${errorMsg.slice(0,500)}</code></p>
    <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}</p>
    <hr>
    <a href="https://crm.crownmediagroup.co/kingdom-reach/dashboard" style="color:#1a3a8e">View Dashboard →</a>
  </div>`;
  await sendViaResend({ to: 'king@crownmediagroup.co', subject, html, text: `Pipeline failed for ${churchName}: ${errorMsg}` });
}

// ── CAMPAIGN EMAIL TEMPLATES ──────────────────────────────────────────────────
function buildCampaignEmail(church, template, baseUrl = '', previewMode = false) {
  const name    = church.name || 'your church';
  const pastor  = church.pastor || '';
  const first   = pastor ? pastor.split(' ')[0] : 'Pastor';
  const city    = church.city || 'Columbia';
  const trackUrl = previewMode ? '' : `${baseUrl}/api/kingdom-reach/track/open/${church.id}`;
  const pixel    = trackUrl ? `<img src="${trackUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0" alt="">` : '';
  const unsubUrl = previewMode ? '#preview-unsubscribe' : `https://crownmediagroup.co/unsubscribe.html?id=${church.id}&t=${unsubscribeSig(church.id)}`;

  let subject, bodyText, bodyHtml;

  if (template === 'follow_up') {
    subject = `Re: Helping ${name} reach more people online`;
    bodyText = `Hi ${first},

Just following up on my note from a few days ago. I know ministry keeps you busy — I completely understand.

I put together a quick idea specifically for ${name} — happy to share it if there's any interest. It would take about 10 minutes to look over and zero commitment.

Is there a good person to run this by?

In service,
King
Crown Media Group | king@crownmediagroup.co
crownmediagroup.co`;
    bodyHtml = campaignHtml({ first, name, city, pixel, unsubUrl, subject,
      bodyLines: [
        `Just following up on my note from a few days ago. I know ministry keeps you busy — I completely understand.`,
        `I put together a quick idea specifically for <strong>${esc(name)}</strong> — happy to share it if there's any interest. It would take about 10 minutes to look over and zero commitment.`,
        `Is there a good person to run this by?`,
      ]
    });
  } else if (template === 'follow_up_opener') {
    // Behavioral Touch-2 — warm opener: they saw the first note. Lead with proof + lower-friction CTA.
    subject = `Quick follow-up — saw you took a look`;
    bodyText = `Hi ${first},

Noticed you took a peek at my note from last week — appreciated you giving it a moment.

Quick context on why I reached out: I just helped a Columbia organization rebuild their full digital presence — new website + social system — live in 14 days. Made me think of ${name}.

If you want to see real work + past client results, here's the proof: https://crownmediagroup.co/proof.html

I'd rather not push a call on you. If easier, I can send a 1-page concept built specifically for ${name} — what a refreshed presence could look like and what it would take to get live fast.

Want me to send it over?

In Christ and in service,
King
Crown Media Group | king@crownmediagroup.co
crownmediagroup.co`;
    bodyHtml = campaignHtml({ first, name, city, pixel, unsubUrl, subject,
      bodyLines: [
        `Noticed you took a peek at my note from last week — appreciated you giving it a moment.`,
        `Quick context on why I reached out: I just helped a Columbia organization rebuild their full digital presence — new website + social system — live in 14 days. Made me think of <strong>${esc(name)}</strong>.`,
        `Real client work + results: <a href="https://crownmediagroup.co/proof.html" style="color:#1a3a8e;font-weight:600">crownmediagroup.co/proof.html</a>`,
        `I'd rather not push a call on you. If easier, I can send a 1-page concept built specifically for <strong>${esc(name)}</strong> — what a refreshed presence could look like and what it would take to get live fast.`,
        `Want me to send it over?`,
      ]
    });
  } else if (template === 'follow_up_cold') {
    // Behavioral Touch-2 — cold non-opener: fresh subject line + ultra-short body.
    subject = `One question about ${name}`;
    bodyText = `Hi ${first},

Quick one — wondered if my note from last week landed in your inbox. Totally fine if not the right season.

If it is the right season, I work with churches in ${city} on web + social — 10-min look, zero commitment.

Worth a reply?

In service,
King
Crown Media Group | king@crownmediagroup.co`;
    bodyHtml = campaignHtml({ first, name, city, pixel, unsubUrl, subject,
      bodyLines: [
        `Quick one — wondered if my note from last week landed in your inbox. Totally fine if not the right season.`,
        `If it is the right season, I work with churches in ${esc(city)} on web + social — 10-min look, zero commitment.`,
        `Worth a reply?`,
      ]
    });
  } else if (template === 'ministry_org') {
    subject = `Helping ${name} grow its reach online`;
    bodyText = `Hi there,

My name is David King. I run Crown Media Group — a faith-aligned marketing agency based in Columbia, SC.

I work exclusively with faith-based organizations like ${name}, and I noticed your ministry could benefit from a stronger digital presence — whether that's a professional website, social media, or just a clearer way for people in ${city} to find you online.

I'd love to share a few ideas I've put together for your organization. Takes 10 minutes, zero commitment.

If you're open to it, visit us at crownmediagroup.co or reply to this email.

In Christ and in service,
King
Crown Media Group | king@crownmediagroup.co
crownmediagroup.co`;
    bodyHtml = campaignHtml({ first: 'there', name, city, pixel, subject,
      bodyLines: [
        `My name is David King — I run <strong>Crown Media Group</strong>, a faith-aligned marketing agency based in Columbia, SC.`,
        `I work exclusively with faith-based organizations like <strong>${esc(name)}</strong>, and I noticed your ministry could benefit from a stronger digital presence — whether that's a professional website, social media, or a clearer way for people in ${esc(city)} to find you online.`,
        `I'd love to share a few ideas I've put together for your organization. Takes 10 minutes, zero commitment.`,
        `If you're open to it, visit us at <a href="https://crownmediagroup.co" style="color:#1a3a8e;font-weight:600">crownmediagroup.co</a> or reply to this email.`,
      ]
    });
  } else if (template === 'breakup_warm') {
    // Touch-3 — warm pull-back. Highest reply rate (8-12% per Hormozi). No ask, one specific gift.
    subject = `One last note for ${name} — and a small gift on the way out`;
    bodyText = `Hi ${first},

I've reached out a couple times about a free first project for ${name} and haven't heard back, which I completely understand — ministry schedules are full and unsolicited offers can feel like noise.

I'm going to stop reaching out after this one. No hard feelings.

Before I go, two small gifts:

1. A free Google Business Profile audit specific to ${name}. If you reply "GBP," I'll send the one-pager — 10 minutes to read, zero ask. It will help people find you faster on Google whether or not we ever work together.

2. The standing offer doesn't expire. If anything changes in 3 months, 6 months, or 3 years, my email and number below still reach me.

If you ever want to see what we've actually built — proof, case studies, real numbers — it's all here: https://crownmediagroup.co/proof.html

Continuing to pray for ${name}'s reach this season.

In Christ,
King
Crown Media Group | king@crownmediagroup.co
(908) 848-1436 | crownmediagroup.co`;
    bodyHtml = campaignHtml({ first, name, city, pixel, unsubUrl, subject,
      bodyLines: [
        `I've reached out a couple times about a free first project for <strong>${esc(name)}</strong> and haven't heard back, which I completely understand — ministry schedules are full and unsolicited offers can feel like noise.`,
        `I'm going to stop reaching out after this one. No hard feelings.`,
        `Before I go, two small gifts:`,
        `<strong>1.</strong> A free Google Business Profile audit specific to <strong>${esc(name)}</strong>. If you reply "GBP," I'll send the one-pager — 10 minutes to read, zero ask. It will help people find you faster on Google whether or not we ever work together.`,
        `<strong>2.</strong> The standing offer doesn't expire. If anything changes in 3 months, 6 months, or 3 years, my email and number below still reach me.`,
        `If you ever want to see what we've actually built — <a href="https://crownmediagroup.co/proof.html" style="color:#1a3a8e;font-weight:600">crownmediagroup.co/proof.html</a> has the case studies + numbers.`,
        `Continuing to pray for <strong>${esc(name)}</strong>'s reach this season.`,
      ]
    });
  } else if (template === 'social_media') {
    subject = `How ${name} could reach more families in ${city}`;
    bodyText = `Hi ${first},

My name is David King. I'm a faith-aligned marketing professional based right here in ${city}, SC — and I work exclusively with faith-based organizations.

I was looking at ${name}'s online presence and I spotted a few quick wins that could meaningfully grow your reach in the community — more people finding you on Sunday, more engagement from your existing congregation, more visibility when families move to ${city} and search for a church home.

I'm not trying to sell you anything today. I'd just love to share what I found — takes 10 minutes, no pressure, no strings.

Would you be open to a quick call this week?

In Christ and in service,
King
Crown Media Group | king@crownmediagroup.co
crownmediagroup.co`;
    bodyHtml = campaignHtml({ first, name, city, pixel, unsubUrl, subject,
      bodyLines: [
        `My name is David King — faith-aligned marketing professional based right here in ${esc(city)}, SC, working exclusively with faith-based organizations.`,
        `I was looking at <strong>${esc(name)}'s</strong> online presence and spotted a few quick wins that could meaningfully grow your reach in the community — more people finding you on Sunday, more engagement from your congregation, more visibility when families search for a church home in ${esc(city)}.`,
        `I'm not trying to sell you anything today. I'd just love to share what I found — takes 10 minutes, no pressure, no strings.`,
        `Would you be open to a quick call this week?`,
      ]
    });
  } else {
    // no_website — default
    subject = `Helping ${name} reach more people online`;
    bodyText = `Hi ${first},

My name is David King. I'm a faith-aligned marketing professional based right here in ${city}, SC.

I work with churches across the area, and I noticed that ${name} doesn't currently have a website. That's more common than people think — but it does mean families searching for a church home in ${city} can't find you online.

I'd love to help change that. I put together a quick idea for ${name} specifically — what a simple, professional web presence would look like and what it would cost to get live fast.

Happy to share it if you're open — takes 10 minutes, zero commitment.

In Christ and in service,
King
Crown Media Group | king@crownmediagroup.co
crownmediagroup.co`;
    bodyHtml = campaignHtml({ first, name, city, pixel, unsubUrl, subject,
      bodyLines: [
        `My name is David King — faith-aligned marketing professional based right here in ${esc(city)}, SC.`,
        `I work with churches across the area, and I noticed that <strong>${esc(name)}</strong> doesn't currently have a website. That means families searching for a church home in ${esc(city)} can't find you online.`,
        `I'd love to help change that. I put together a quick idea for <strong>${esc(name)}</strong> specifically — what a simple, professional web presence would look like and what it would cost to get live fast.`,
        `Happy to share it if you're open — takes 10 minutes, zero commitment.`,
      ]
    });
  }

  return { subject, text: bodyText, html: bodyHtml };
}

function esc(s = '') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function campaignHtml({ first, name, city, pixel, unsubUrl, subject, bodyLines }) {
  const lines = bodyLines.map(l => `<p style="margin:0 0 16px;line-height:1.7;color:#0a1628">${l}</p>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(10,22,40,.08);max-width:600px">
  <tr><td style="background:linear-gradient(135deg,#1a3a8e,#0f2452);padding:28px 32px">
    <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#d4a73c;text-transform:uppercase">CROWN MEDIA GROUP</p>
    <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#ffffff;font-family:Georgia,serif">Kingdom Reach</p>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 24px;font-size:16px;color:#0a1628">Hi ${esc(first)},</p>
    ${lines}
    <p style="margin:24px 0 0;font-size:14px;color:#5a6a87">In Christ and in service,</p>
    <p style="margin:4px 0 0;font-weight:700;font-size:18px;color:#0a1628">King</p>
    <p style="margin:2px 0 0;font-size:13px;color:#5a6a87">Founder · Crown Media Group</p>
    <p style="margin:2px 0 0;font-size:13px"><a href="mailto:king@crownmediagroup.co" style="color:#1a3a8e">king@crownmediagroup.co</a> · <a href="https://crownmediagroup.co" style="color:#1a3a8e">crownmediagroup.co</a></p>
    <hr style="border:none;border-top:1px solid #e5e9f2;margin:24px 0">
    <p style="margin:0;font-size:12px;color:#8a96b8;font-style:italic">"Whatever you do, work heartily, as for the Lord and not for men." — Colossians 3:23</p>
    <p style="margin:16px 0 0;font-size:11px;color:#aaa;text-align:center">Crown Media Group · Columbia, SC · You're getting this because we believe ${esc(name)} would benefit from what we do. <a href="${unsubUrl || 'mailto:king@crownmediagroup.co?subject=Unsubscribe'}" style="color:#aaa;text-decoration:underline">Unsubscribe</a></p>
  </td></tr>
</table>
</td></tr>
</table>
${pixel}
</body></html>`;
}

export function mountKingdomReach(app, db, { validateSession, getCookie } = {}) {
  ensureDirs();
  ensureSchema(db);
  seedChurches(db);

  const requireAuth = (req, res, next) => {
    if (!validateSession || !getCookie) return next();   // dev fallback
    const session = validateSession(getCookie(req, 'crm_session'));
    if (!session) {
      if (req.accepts('html') && !req.path.startsWith('/api/')) return res.redirect('/login');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.kingdomUser = session;
    next();
  };

  // ── PAGES ─────────────────────────────────────────────────────────────────
  app.get('/kingdom-reach',          requireAuth, (req, res) => res.sendFile(join(PUBLIC_DIR, 'dispatch.html')));
  app.get('/kingdom-reach/dashboard',requireAuth, (req, res) => res.sendFile(join(PUBLIC_DIR, 'kingdom-dashboard.html')));
  app.get('/kingdom-reach/funnel',                (req, res) => res.sendFile(join(PUBLIC_DIR, 'funnel.html')));
  app.get('/kingdom-reach/linkedin-queue',        (req, res) => res.sendFile(join(PUBLIC_DIR, 'linkedin-queue.html')));
  app.get('/kingdom-reach/linkedin-queue.json',   (req, res) => {
    const queuePath = join(__dirname, '..', '..', 'Agency', 'ops', 'outreach', 'linkedin-queue.json');
    if (existsSync(queuePath)) return res.sendFile(queuePath);
    return res.json({ queue: [], completed: [] });
  });

  // ── DISPATCH (kick off pipeline) ──────────────────────────────────────────
  app.post('/api/kingdom-reach/dispatch', requireAuth, async (req, res) => {
    const { transcript, church_name, pastor_name, phone, address, has_website, send_now } = req.body || {};
    if (!transcript || !church_name) return res.status(400).json({ error: 'transcript + church_name required' });

    const churchHint = {
      name: String(church_name).trim(),
      pastor: String(pastor_name || '').trim(),
      phone:  String(phone || '').trim(),
      address: String(address || '').trim(),
      website: has_website ? 'yes' : '',
    };

    const slug = slugify(church_name);
    const ins  = db.prepare(`INSERT INTO kingdom_dispatches
      (church_slug, transcript, status, workspace_id) VALUES (?, ?, 'processing', ?)`)
      .run(slug, String(transcript), req.kingdomUser?.workspaceId || 1);
    const dispatchId = ins.lastInsertRowid;

    // Fire pipeline async — return jobId immediately so the iPhone form doesn't time out
    runPipeline(db, dispatchId, churchHint, { sendNow: !!send_now })
      .catch(err => {
        console.error('[Kingdom Reach] Pipeline error:', err);
        db.prepare("UPDATE kingdom_dispatches SET status='error', error=?, updated_at=datetime('now') WHERE id=?")
          .run(String(err.message || err).slice(0, 500), dispatchId);
        // Alert King about the failure
        sendAlertEmail(churchHint.name || 'Unknown Church', err.message || String(err), dispatchId).catch(() => {});
      });

    res.json({ ok: true, jobId: dispatchId, slug });
  });

  // ── JOB STATUS POLLING ────────────────────────────────────────────────────
  app.get('/api/kingdom-reach/job/:id', requireAuth, (req, res) => {
    const job = db.prepare('SELECT * FROM kingdom_dispatches WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });
    let church = null;
    if (job.church_id) church = db.prepare('SELECT * FROM churches WHERE id = ?').get(job.church_id);
    res.json({
      ok: true, job: {
        id: job.id, status: job.status, slug: job.church_slug, error: job.error,
        websiteUrl:  job.website_path  ? `/kingdom-reach/output/${job.church_slug}/website`  : null,
        proposalUrl: job.proposal_path ? `/kingdom-reach/output/${job.church_slug}/proposal` : null,
        emailDraftUrl: job.email_draft_path ? `/kingdom-reach/output/${job.church_slug}/email`   : null,
        emailSent: !!job.email_sent, emailSentAt: job.email_sent_at,
        extracted: safeJSON(job.extracted_json),
        church,
      },
    });
  });

  // ── CHURCH LIST (priority-sorted) ─────────────────────────────────────────
  app.get('/api/kingdom-reach/churches', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.query.token === SEED_TOKEN) && !req.kingdomUser) {
      const session = validateSession && getCookie ? validateSession(getCookie(req, 'crm_session')) : null;
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      req.kingdomUser = session;
    }
    const onlyNoWebsite = req.query.priority === '1' || req.query.no_website === '1';
    const status = req.query.status || null;
    const tier   = req.query.tier   || null;

    let sql = `SELECT * FROM churches WHERE workspace_id = 1`;
    const args = [];
    if (onlyNoWebsite) sql += ' AND has_website = 0';
    if (status) { sql += ' AND status = ?'; args.push(status); }
    if (tier)   { sql += ' AND tier   = ?'; args.push(tier);   }
    sql += " ORDER BY (status = 'Client') DESC, has_website ASC, tier ASC, name ASC";

    const churches = db.prepare(sql).all(...args);
    const totals   = db.prepare(`SELECT
        COUNT(*) as total,
        SUM(CASE WHEN has_website = 0 THEN 1 ELSE 0 END) as no_website,
        SUM(CASE WHEN status = 'Client'        THEN 1 ELSE 0 END) as clients,
        SUM(CASE WHEN status = 'Proposal Sent' THEN 1 ELSE 0 END) as proposals,
        SUM(CASE WHEN status = 'Contacted'     THEN 1 ELSE 0 END) as contacted,
        SUM(pipeline_value) as pipeline_total,
        SUM(CASE WHEN email_sent = 1    THEN 1 ELSE 0 END) as emailed,
        SUM(CASE WHEN email_opened = 1  THEN 1 ELSE 0 END) as opened,
        SUM(CASE WHEN replied = 1       THEN 1 ELSE 0 END) as replied_count,
        SUM(CASE WHEN follow_up_sent = 1 THEN 1 ELSE 0 END) as follow_ups
      FROM churches WHERE workspace_id = 1`).get();
    res.json({ ok:true, churches, totals });
  });

  // ── SINGLE CHURCH DETAIL ─────────────────────────────────────────────────
  app.get('/api/kingdom-reach/churches/:id', requireAuth, (req, res) => {
    const church = db.prepare('SELECT * FROM churches WHERE id = ?').get(req.params.id);
    if (!church) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true, church });
  });

  app.patch('/api/kingdom-reach/churches/:id', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.body?.token === SEED_TOKEN) && !req.kingdomUser) {
      const session = validateSession && getCookie ? validateSession(getCookie(req, 'crm_session')) : null;
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      req.kingdomUser = session;
    }
    const allowed = ['status','recommended_tier','follow_up_date','notes','phone','email','pastor','website','has_website','pipeline_value','name','address','email_sent','email_sent_at','email_opened','email_opened_at','follow_up_sent','follow_up_sent_at','replied','replied_at','email_bounced','email_bounced_at','breakup_sent','breakup_sent_at','unsubscribed','unsubscribed_at','lead_score','lead_score_at','tier','org_type'];
    const fields  = Object.keys(req.body || {}).filter(k => allowed.includes(k) && k !== 'token');
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    vals.push(req.params.id);
    db.prepare(`UPDATE churches SET ${sets} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
  });

  // ── BULK IMPORT (token bypass — called from import-churches-to-db.js) ───
  app.post('/api/kingdom-reach/churches/import', async (req, res) => {
    try {
      const { token, churches: rows, sent_names = [], opened_names = [], replied_names = [] } = req.body || {};
      const SEED_TOKEN = process.env.SEED_TOKEN;
      if (!(SEED_TOKEN && token === SEED_TOKEN) && !req.kingdomUser) return res.status(403).json({ error: 'auth required' });
      if (!rows?.length) return res.status(400).json({ error: 'churches array required' });

      const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO churches
          (name,tier,denomination,address,city,state,zip,phone,website,pastor,email,
           instagram,facebook,size,social,fit,has_website,status,notes,org_type,workspace_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
      `);
      const updateStmt = db.prepare(`
        UPDATE churches SET
          tier          = COALESCE(NULLIF(?,  ''), tier),
          denomination  = COALESCE(NULLIF(?,  ''), denomination),
          address       = COALESCE(NULLIF(?,  ''), address),
          city          = COALESCE(NULLIF(?,  ''), city),
          state         = COALESCE(NULLIF(?,  ''), state),
          zip           = COALESCE(NULLIF(?,  ''), zip),
          phone         = COALESCE(NULLIF(?,  ''), phone),
          website       = COALESCE(NULLIF(?,  ''), website),
          pastor        = COALESCE(NULLIF(?,  ''), pastor),
          email         = COALESCE(NULLIF(?,  ''), email),
          instagram     = COALESCE(NULLIF(?,  ''), instagram),
          facebook      = COALESCE(NULLIF(?,  ''), facebook),
          has_website   = CASE WHEN ? = 1 THEN 1 ELSE has_website END,
          org_type      = COALESCE(NULLIF(?,  ''), org_type)
        WHERE name = ? COLLATE NOCASE
      `);

      let imported = 0;
      db.prepare('BEGIN').run();
      try {
        for (const c of rows) {
          const n    = String(c.name || '').trim();
          if (!n) continue;
          const tier = c.tier || 'C';
          const den  = c.denomination || '';
          const addr = c.address || '';
          const city = c.city || 'Columbia';
          const st   = c.state || 'SC';
          const zip  = c.zip || '';
          const ph   = c.phone || '';
          const web  = c.website || '';
          const pas  = c.pastor || '';
          const em   = c.email || '';
          const ig   = c.instagram || '';
          const fb   = c.facebook || '';
          const sz   = c.size || '';
          const soc  = c.social || '';
          const fit  = c.fit || '';
          const hw   = c.has_website ? 1 : 0;
          const stat = c.status || 'Not Contacted';
          const nt   = c.notes || '';
          const ot   = c.org_type || 'church';
          insertStmt.run(n, tier, den, addr, city, st, zip, ph, web, pas, em, ig, fb, sz, soc, fit, hw, stat, nt, ot);
          updateStmt.run(tier, den, addr, city, st, zip, ph, web, pas, em, ig, fb, hw, ot, n);
          imported++;
        }
        db.prepare('COMMIT').run();
      } catch (txErr) {
        db.prepare('ROLLBACK').run();
        throw txErr;
      }

      // Apply tracking markers by name (case-insensitive)
      for (const name of sent_names) {
        db.prepare(`UPDATE churches SET email_sent=1, email_sent_at=COALESCE(email_sent_at,datetime('now')) WHERE name=? COLLATE NOCASE`).run(name);
      }
      for (const name of opened_names) {
        db.prepare(`UPDATE churches SET email_opened=1, email_opened_at=COALESCE(email_opened_at,datetime('now')) WHERE name=? COLLATE NOCASE`).run(name);
      }
      for (const name of replied_names) {
        db.prepare(`UPDATE churches SET replied=1, replied_at=COALESCE(replied_at,datetime('now')),
          status=CASE WHEN status IN ('Client','Not Interested') THEN status ELSE 'Contacted' END
          WHERE name=? COLLATE NOCASE`).run(name);
      }

      res.json({ ok: true, imported, sent: sent_names.length, opened: opened_names.length, replied: replied_names.length });
    } catch (err) {
      console.error('[KR import] Error:', err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // ── MARK EMAIL OPENED (token bypass — called from CLI/import scripts) ────
  app.post('/api/kingdom-reach/churches/mark-opened', async (req, res) => {
    const { emails, token } = req.body || {};
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && token === SEED_TOKEN) && !req.kingdomUser) return res.status(403).json({ error: 'auth required' });
    if (!emails || !emails.length) return res.status(400).json({ error: 'emails array required' });
    let updated = 0;
    for (const email of emails) {
      const r = db.prepare(`UPDATE churches SET email_opened=1, email_opened_at=COALESCE(email_opened_at,datetime('now')) WHERE email=? AND email_opened=0`).run(email);
      updated += r.changes;
    }
    res.json({ ok: true, updated });
  });

  // ── MARK REPLIED (token bypass) ───────────────────────────────────────────
  app.post('/api/kingdom-reach/churches/mark-replied-church', async (req, res) => {
    const { email, name, token } = req.body || {};
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && token === SEED_TOKEN) && !req.kingdomUser) return res.status(403).json({ error: 'auth required' });
    if (!email && !name) return res.status(400).json({ error: 'email or name required' });
    let r;
    if (email) {
      r = db.prepare(`UPDATE churches SET replied=1, replied_at=COALESCE(replied_at,datetime('now')), status=CASE WHEN status IN ('Client','Not Interested') THEN status ELSE 'Contacted' END WHERE email=?`).run(email);
    } else {
      r = db.prepare(`UPDATE churches SET replied=1, replied_at=COALESCE(replied_at,datetime('now')), status=CASE WHEN status IN ('Client','Not Interested') THEN status ELSE 'Contacted' END WHERE name=? COLLATE NOCASE`).run(name);
    }
    res.json({ ok: true, updated: r.changes });
  });

  // ── WORKSPACE SETTINGS (token bypass for scheduled functions) ──────────────
  // GET all settings as flat object
  app.get('/api/kingdom-reach/workspace-settings', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    const token = req.query.token;
    if (!(SEED_TOKEN && token === SEED_TOKEN) && !req.kingdomUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const rows = db.prepare('SELECT key, value, updated_at FROM workspace_settings').all();
    const out = {};
    for (const r of rows) out[r.key] = { value: r.value, updated_at: r.updated_at };
    res.json({ ok: true, settings: out });
  });

  // PATCH single setting by key
  app.patch('/api/kingdom-reach/workspace-settings/:key', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.body?.token === SEED_TOKEN) && !req.kingdomUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { key } = req.params;
    const { value } = req.body || {};
    if (typeof value !== 'string') return res.status(400).json({ error: 'value (string) required' });
    // Whitelist of editable keys (extend as features grow)
    const allowed = ['outreach_paused', 'last_reply_poll_at', 'safety_pause_reason'];
    if (!allowed.includes(key)) return res.status(400).json({ error: 'key not allowed' });
    db.prepare(`INSERT INTO workspace_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(key, value);
    res.json({ ok: true, key, value });
  });

  // ── BOUNCE / COMPLAINT MARKER (token bypass — called from Resend webhook fn) ──
  app.post('/api/kingdom-reach/churches/mark-bounced', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.body?.token === SEED_TOKEN) && !req.kingdomUser) {
      return res.status(403).json({ error: 'auth required' });
    }
    const { email, reason } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });
    const r = db.prepare(`UPDATE churches SET
      email_bounced=1,
      email_bounced_at=COALESCE(email_bounced_at, datetime('now')),
      status='Bounced',
      notes=COALESCE(notes,'') || ?
      WHERE email=?`).run(` [BOUNCED ${new Date().toISOString()}: ${(reason||'unknown').slice(0,80)}]`, email);
    res.json({ ok: true, updated: r.changes });
  });

  // ── AGGREGATE STATS (for safety-monitor function) ──────────────────────────
  app.get('/api/kingdom-reach/stats/last-7-days', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    const token = req.query.token;
    if (!(SEED_TOKEN && token === SEED_TOKEN) && !req.kingdomUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const row7 = db.prepare(`SELECT
      SUM(CASE WHEN email_sent_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) as sent_7d,
      SUM(CASE WHEN replied_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) as replied_7d,
      SUM(CASE WHEN email_bounced_at >= datetime('now','-7 days') THEN 1 ELSE 0 END) as bounced_7d,
      SUM(CASE WHEN unsubscribed_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) as unsub_24h
      FROM churches`).get();
    const sent = row7?.sent_7d || 0;
    res.json({
      ok: true,
      sent_7d: sent,
      replied_7d: row7?.replied_7d || 0,
      bounced_7d: row7?.bounced_7d || 0,
      unsub_24h: row7?.unsub_24h || 0,
      reply_rate: sent > 0 ? +((row7.replied_7d / sent) * 100).toFixed(2) : 0,
      bounce_rate: sent > 0 ? +((row7.bounced_7d / sent) * 100).toFixed(2) : 0,
    });
  });

  // ── DISPATCH LIST ─────────────────────────────────────────────────────────
  app.get('/api/kingdom-reach/dispatches', requireAuth, (req, res) => {
    const churchId = req.query.church_id ? parseInt(req.query.church_id, 10) : null;
    let sql = `SELECT d.*, c.name as church_name, c.pastor, c.email
      FROM kingdom_dispatches d
      LEFT JOIN churches c ON c.id = d.church_id`;
    const args = [];
    if (churchId) {
      sql += ' WHERE d.church_id = ?';
      args.push(churchId);
    }
    sql += ' ORDER BY d.created_at DESC LIMIT 50';
    const rows = db.prepare(sql).all(...args);
    res.json({ ok:true, dispatches: rows });
  });

  // ── DELIVERABLE PREVIEWS ──────────────────────────────────────────────────
  app.get('/kingdom-reach/output/:slug/website', requireAuth, (req, res) => {
    const file = join(OUTPUT_DIR, 'websites', sanitize(req.params.slug), 'index.html');
    if (!existsSync(file)) return res.status(404).send('No website built for this church yet.');
    res.setHeader('Content-Type', 'text/html');
    res.send(readFileSync(file, 'utf8'));
  });
  app.get('/kingdom-reach/output/:slug/proposal', requireAuth, (req, res) => {
    const file = join(OUTPUT_DIR, 'proposals', `${sanitize(req.params.slug)}_proposal.pdf`);
    if (!existsSync(file)) return res.status(404).send('No proposal built yet.');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${sanitize(req.params.slug)}_proposal.pdf"`);
    res.send(readFileSync(file));
  });
  app.get('/kingdom-reach/output/:slug/email', requireAuth, (req, res) => {
    const file = join(OUTPUT_DIR, 'emails', `${sanitize(req.params.slug)}_email.txt`);
    if (!existsSync(file)) return res.status(404).send('No email draft yet.');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(readFileSync(file, 'utf8'));
  });

  // ── SEND EMAIL (King clicks "approve & send" from dispatch confirmation) ──
  app.post('/api/kingdom-reach/dispatches/:id/send', requireAuth, async (req, res) => {
    const job = db.prepare('SELECT * FROM kingdom_dispatches WHERE id = ?').get(req.params.id);
    if (!job)               return res.status(404).json({ error:'Not found' });
    if (job.status !== 'ready') return res.status(400).json({ error:`Job status=${job.status} — not ready to send` });
    if (job.email_sent)     return res.status(400).json({ error:'Already sent' });

    const data = safeJSON(job.extracted_json);
    const to   = req.body?.to || data?.email || (job.church_id && db.prepare('SELECT email FROM churches WHERE id = ?').get(job.church_id)?.email);
    if (!to) return res.status(400).json({ error:'No recipient email available — pass {to} in body' });

    const proto    = req.headers['x-forwarded-proto'] || 'https';
    const host     = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl  = `${proto}://${host}`;
    const siteUrl  = job.website_path  ? `${baseUrl}/kingdom-reach/output/${job.church_slug}/website`  : '';
    const draft    = (await import('./generators/email.js')).buildEmail(data, { siteUrl });
    const result   = await sendViaResend({
      to, subject: draft.subject, html: draft.html, text: draft.text,
      attachmentPath: job.proposal_path,
      attachmentName: `${job.church_slug}_proposal.pdf`,
    });

    if (!result.ok) return res.status(502).json({ error:`Send failed: ${result.error}` });

    db.prepare(`UPDATE kingdom_dispatches SET email_sent=1, email_sent_at=datetime('now'),
      email_message_id=?, status='sent', updated_at=datetime('now') WHERE id=?`)
      .run(result.id || '', req.params.id);
    if (job.church_id) {
      db.prepare(`UPDATE churches SET status='Proposal Sent' WHERE id=? AND status NOT IN ('Client','Not Interested')`).run(job.church_id);
    }
    res.json({ ok:true, messageId: result.id });
  });

  // ── SEND FOLLOW-UP ────────────────────────────────────────────────────────
  app.post('/api/kingdom-reach/dispatches/:id/send-followup', requireAuth, async (req, res) => {
    const followup = parseInt(req.body?.followup, 10);
    if (followup !== 1 && followup !== 2) {
      return res.status(400).json({ error: 'followup must be 1 or 2' });
    }

    const job = db.prepare('SELECT * FROM kingdom_dispatches WHERE id = ? AND workspace_id = 1').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Not found' });

    const sentField = followup === 1 ? 'followup_1_sent' : 'followup_2_sent';
    if (job[sentField]) return res.status(400).json({ error: `Follow-up ${followup} already sent` });

    const church = job.church_id
      ? db.prepare('SELECT * FROM churches WHERE id = ?').get(job.church_id)
      : null;
    const to = church?.email || null;
    if (!to) return res.status(400).json({ error: 'No recipient email for this church' });

    const data = safeJSON(job.extracted_json) || {};
    // Populate church name/pastor from church record if extraction data is sparse
    if (!data.church_name && church) data.church_name = church.name;
    if (!data.pastor_name  && church) data.pastor_name  = church.pastor;

    const emailMod = await import('./generators/email.js');
    const draftFn  = followup === 1 ? emailMod.writeFollowup1Draft : emailMod.writeFollowup2Draft;
    const draft    = draftFn(data, join(OUTPUT_DIR, 'emails'));

    // Build minimal HTML from plain text (follow-up drafts don't include HTML)
    const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0a1628;max-width:600px;margin:0 auto;padding:24px">
<pre style="white-space:pre-wrap;font-family:inherit;line-height:1.6">${draft.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
</body></html>`;

    const result = await sendViaResend({ to, subject: draft.subject, html: htmlBody, text: draft.text });
    if (!result.ok) return res.status(502).json({ error: `Send failed: ${result.error}` });

    db.prepare(`UPDATE kingdom_dispatches SET ${sentField}=1, updated_at=datetime('now') WHERE id=?`)
      .run(req.params.id);

    res.json({ ok: true, sent_to: to });
  });

  // ── ENRICH CHURCHES (Overpass/OSM — free, no API key) ────────────────────
  app.post('/api/kingdom-reach/enrich', async (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.body?.token === SEED_TOKEN) && !req.kingdomUser) {
      const session = validateSession && getCookie ? validateSession(getCookie(req, 'crm_session')) : null;
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
      req.kingdomUser = session;
    }
    const ENDPOINTS = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.openstreetmap.ru/api/interpreter',
    ];
    const QUERY = `[out:json][timeout:45];(node["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7);way["amenity"="place_of_worship"](33.8,-81.2,34.2,-80.7););out body center;`;
    let osmData = null;
    let lastErr = '';
    for (const endpoint of ENDPOINTS) {
      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(QUERY)}`,
          signal: AbortSignal.timeout(30000),
        });
        const text = await r.text();
        if (!r.ok || text.trim().startsWith('<')) {
          lastErr = `${endpoint} → HTTP ${r.status}, got HTML`;
          continue;
        }
        osmData = JSON.parse(text);
        break;
      } catch (e) { lastErr = `${endpoint} → ${e.message}`; }
    }
    if (!osmData) return res.status(502).json({ error: 'All Overpass mirrors failed: ' + lastErr });

    const elements = (osmData.elements || []).filter(el => el.tags && el.tags.name);
    const churches = db.prepare("SELECT id, name, address, phone, city, zip FROM churches").all();

    function norm(s) {
      return s.toLowerCase().replace(/\b(church|baptist|methodist|presbyterian|lutheran|apostolic|assembly|cogic|ame|cog|umc|of|the|first|second|third|greater|new|holy|mount|mt|saint|st|and)\b/g,'').replace(/[^a-z0-9]/g,'').trim();
    }
    function score(a, b) {
      const na = norm(a), nb = norm(b);
      if (!na || !nb) return 0;
      if (na === nb) return 1;
      if (na.includes(nb) || nb.includes(na)) return 0.85;
      const bgs = s => { const g=new Set(); for(let i=0;i<s.length-1;i++) g.add(s.slice(i,i+2)); return g; };
      const ba=bgs(na), bb=bgs(nb);
      const inter=[...ba].filter(g=>bb.has(g)).length;
      const uni=new Set([...ba,...bb]).size;
      return uni>0 ? inter/uni : 0;
    }

    let updated = 0;
    for (const el of elements) {
      const t = el.tags;
      const phone   = t.phone || t['contact:phone'] || t['contact:mobile'];
      const street  = t['addr:street'] ? `${t['addr:housenumber']||''} ${t['addr:street']}`.trim() : null;
      const city    = t['addr:city'];
      const zip     = t['addr:postcode'];
      if (!phone && !street) continue;

      let best = null, bestS = 0;
      for (const c of churches) {
        const s = score(t.name, c.name);
        if (s > bestS) { bestS = s; best = c; }
      }
      if (!best || bestS < 0.5) continue;

      const sets = [], vals = [];
      if (!best.address && street) { sets.push('address=?'); vals.push(street); }
      if (!best.city && city)      { sets.push('city=?');    vals.push(city); }
      if (!best.zip && zip)        { sets.push('zip=?');     vals.push(zip); }
      if (!best.phone && phone)    { sets.push('phone=?');   vals.push(phone); }
      if (!sets.length) continue;
      vals.push(best.id);
      db.prepare(`UPDATE churches SET ${sets.join(',')} WHERE id=?`).run(...vals);
      updated++;
    }

    const missing = db.prepare("SELECT COUNT(*) as c FROM churches WHERE (address IS NULL OR address='') AND (phone IS NULL OR phone='')").get().c;
    res.json({ ok:true, osm_found: elements.length, updated, still_missing: missing });
  });

  // ── OPEN TRACKING PIXEL (public — embedded in outreach emails) ──────────
  // 1x1 transparent GIF — fires when email client renders the image
  const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  app.get('/api/kingdom-reach/track/open/:churchId', (req, res) => {
    const id = parseInt(req.params.churchId, 10);
    if (id) {
      db.prepare(`UPDATE churches SET email_opened=1, email_opened_at=COALESCE(email_opened_at,datetime('now'))
        WHERE id=? AND email_opened=0`).run(id);
      // LABS — attribute open to most recent send for this church (variant tracking)
      const lastSend = db.prepare(`SELECT id, template, variant_id FROM email_sends WHERE church_id = ? AND opened_at IS NULL ORDER BY sent_at DESC LIMIT 1`).get(id);
      if (lastSend) {
        db.prepare(`UPDATE email_sends SET opened_at = datetime('now') WHERE id = ?`).run(lastSend.id);
        db.prepare(`UPDATE email_variants SET open_count = open_count + 1 WHERE template = ? AND variant_id = ?`).run(lastSend.template, lastSend.variant_id);
      }
    }
    res.set({ 'Content-Type':'image/gif', 'Cache-Control':'no-cache,no-store,must-revalidate', 'Pragma':'no-cache' });
    res.send(PIXEL);
  });

  // ── LABS — A/B variant stats endpoint ───────────────────────────────────────
  app.get('/api/kingdom-reach/variants/stats', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.query.token === SEED_TOKEN) && !req.kingdomUser) {
      const session = validateSession && getCookie ? validateSession(getCookie(req, 'crm_session')) : null;
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
    }
    const rows = db.prepare(`
      SELECT template, variant_id, subject, weight, sent_count, open_count, reply_count, active,
             CASE WHEN sent_count > 0 THEN ROUND(open_count*1.0/sent_count, 4) ELSE NULL END as open_rate,
             CASE WHEN sent_count > 0 THEN ROUND(reply_count*1.0/sent_count, 4) ELSE NULL END as reply_rate
      FROM email_variants
      ORDER BY template, sent_count DESC, variant_id ASC
    `).all();
    res.json({ ok: true, variants: rows });
  });

  // ── CAMPAIGN PREVIEW (generate personalized email HTML for a church) ─────
  app.post('/api/kingdom-reach/campaign/preview', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.body?.token === SEED_TOKEN) && !req.kingdomUser) {
      const session = validateSession && getCookie ? validateSession(getCookie(req, 'crm_session')) : null;
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
    }
    const { church_id, template } = req.body || {};
    const church = church_id ? db.prepare('SELECT * FROM churches WHERE id=?').get(church_id) : null;
    if (!church) return res.status(400).json({ error: 'church_id required' });
    const { subject, html, text } = buildCampaignEmail(church, template || 'no_website', '', true);
    res.json({ ok: true, subject, html, text });
  });

  // ── CAMPAIGN SEND (batch outreach via Resend — no GMass needed) ──────────
  app.post('/api/kingdom-reach/campaign/send', async (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN;
    if (!(SEED_TOKEN && req.body?.token === SEED_TOKEN) && !req.kingdomUser) {
      const session = validateSession && getCookie ? validateSession(getCookie(req, 'crm_session')) : null;
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
    }

    const { template = 'no_website', filter = 'not_sent', church_ids, org_type: orgTypeFilter, dry_run = false, text_only = false } = req.body || {};
    const proto   = req.headers['x-forwarded-proto'] || 'https';
    const host    = req.headers['x-forwarded-host'] || req.headers.host || 'crm.crownmediagroup.co';
    const baseUrl = `${proto}://${host}`;

    let churches;
    if (Array.isArray(church_ids) && church_ids.length) {
      const placeholders = church_ids.map(() => '?').join(',');
      churches = db.prepare(`SELECT * FROM churches WHERE id IN (${placeholders}) AND email IS NOT NULL AND email != '' AND (unsubscribed = 0 OR unsubscribed IS NULL)`).all(...church_ids);
    } else {
      // Every outreach query excludes unsubscribed contacts. NULL counts as not-unsubscribed (legacy rows).
      const UNSUB_CLAUSE = ` AND (unsubscribed = 0 OR unsubscribed IS NULL)`;
      let sql = `SELECT * FROM churches WHERE email IS NOT NULL AND email != '' AND email_sent = 0` + UNSUB_CLAUSE;
      if (filter === 'no_website')    sql += ' AND has_website = 0';
      if (filter === 'has_website')   sql += ' AND has_website = 1';
      if (filter === 'tier_a')        sql += " AND tier = 'A'";
      if (filter === 'tier_ab')       sql += " AND tier IN ('A','B')";
      if (filter === 'orgs_only')     sql += " AND org_type != 'church'";
      if (filter === 'churches_only') sql += " AND (org_type = 'church' OR org_type IS NULL)";
      if (filter === 'tier_a_high_score') sql += ' AND lead_score >= 80';   // GAUGE A-tier
      if (filter === 'tier_ab_score')     sql += ' AND lead_score >= 55';   // GAUGE A+B tier
      if (filter === 'follow_up')         sql = `SELECT * FROM churches WHERE email IS NOT NULL AND email != '' AND email_sent=1 AND replied=0 AND email_sent_at < datetime('now','-7 days') AND follow_up_sent=0` + UNSUB_CLAUSE;
      if (filter === 'follow_up_openers') sql = `SELECT * FROM churches WHERE email IS NOT NULL AND email != '' AND email_sent=1 AND replied=0 AND email_opened=1 AND email_sent_at < datetime('now','-7 days') AND follow_up_sent=0` + UNSUB_CLAUSE;
      if (filter === 'follow_up_cold')    sql = `SELECT * FROM churches WHERE email IS NOT NULL AND email != '' AND email_sent=1 AND replied=0 AND (email_opened=0 OR email_opened IS NULL) AND email_sent_at < datetime('now','-7 days') AND follow_up_sent=0` + UNSUB_CLAUSE;
      if (filter === 'breakup_warm')      sql = `SELECT * FROM churches WHERE email IS NOT NULL AND email != '' AND email_sent=1 AND follow_up_sent=1 AND replied=0 AND (breakup_sent=0 OR breakup_sent IS NULL) AND follow_up_sent_at < datetime('now','-7 days')` + UNSUB_CLAUSE;
      // Whitelist + param-bind to defeat SQL injection (org_type is a fixed enum from import scripts)
      const ALLOWED_ORG_TYPES = ['nonprofit','school','youth','business','network','missions','media','recovery','prison','men','women','church','mixed'];
      let orgTypeParam = null;
      if (orgTypeFilter) {
        const candidate = String(orgTypeFilter).toLowerCase().trim();
        if (ALLOWED_ORG_TYPES.includes(candidate)) {
          sql += ` AND org_type = ?`;
          orgTypeParam = candidate;
        }
        // unknown org_type → silently ignored (do not splice user input into SQL)
      }
      // GAUGE A-tier filters use lead_score sort order; others use tier+name
      if (filter === 'tier_a_high_score' || filter === 'tier_ab_score') {
        sql += ' ORDER BY lead_score DESC, name ASC LIMIT 100';
      } else {
        sql += ' ORDER BY tier ASC, name ASC LIMIT 100';
      }
      churches = orgTypeParam ? db.prepare(sql).all(orgTypeParam) : db.prepare(sql).all();
    }

    if (!churches.length) return res.json({ ok: true, sent: 0, skipped: 0, message: 'No eligible churches found' });
    if (dry_run) return res.json({ ok: true, dry_run: true, count: churches.length, churches: churches.map(c => ({ id:c.id, name:c.name, email:c.email, template })) });

    let sent = 0, failed = 0, errors = [];
    const isBreakup =
      filter === 'breakup_warm' ||
      (typeof template === 'string' && template === 'breakup_warm');
    const isFollowUp = !isBreakup && (
      filter === 'follow_up' ||
      filter === 'follow_up_openers' ||
      filter === 'follow_up_cold' ||
      (typeof template === 'string' && template.startsWith('follow_up'))
    );

    // LABS (Agent 38) — variant selector. Weighted-random pick from active variants per template.
    // Falls through to hardcoded buildCampaignEmail subject if no DB variants exist for this template.
    function pickVariant(templateName, churchObj) {
      const variants = db.prepare(
        `SELECT * FROM email_variants WHERE template = ? AND active = 1 ORDER BY id ASC`
      ).all(templateName);
      if (!variants.length) return null;
      const totalWeight = variants.reduce((acc, v) => acc + (v.weight || 0), 0);
      if (totalWeight === 0) return null;
      let r = Math.random() * totalWeight;
      for (const v of variants) {
        r -= (v.weight || 0);
        if (r <= 0) {
          // Interpolate ${name} / ${city} / ${first} placeholders in subject
          const first = (churchObj.pastor ? churchObj.pastor.split(' ')[0] : 'Pastor');
          const subject = String(v.subject || '')
            .replace(/\$\{name\}/g, churchObj.name || 'your church')
            .replace(/\$\{city\}/g, churchObj.city || 'Columbia')
            .replace(/\$\{first\}/g, first);
          return { ...v, subject };
        }
      }
      return null;
    }

    for (const church of churches) {
      try {
        const built = buildCampaignEmail(church, template, baseUrl, false);
        let { subject, html, text } = built;
        const variant = pickVariant(template, church);
        if (variant) subject = variant.subject;   // body stays from buildCampaignEmail; only subject A/B for now

        // Plain-text first variant: ship only the text body, no HTML, no tracking pixel.
        // Lemlist 2026: cold B2B plain-text gets 2x reply rate vs HTML.
        const sendPayload = text_only
          ? { to: church.email, subject, text }
          : { to: church.email, subject, html, text };
        const result = await sendViaResend(sendPayload);
        if (!result.ok) {
          failed++;
          errors.push({ church: church.name, error: result.error });
          continue;
        }
        if (isBreakup) {
          db.prepare(`UPDATE churches SET breakup_sent=1, breakup_sent_at=datetime('now') WHERE id=?`).run(church.id);
        } else if (isFollowUp) {
          db.prepare(`UPDATE churches SET follow_up_sent=1, follow_up_sent_at=datetime('now') WHERE id=?`).run(church.id);
        } else {
          db.prepare(`UPDATE churches SET email_sent=1, email_sent_at=datetime('now') WHERE id=?`).run(church.id);
        }
        // LABS — record per-send variant tracking for attribution
        if (variant) {
          db.prepare(`INSERT INTO email_sends (church_id, template, variant_id) VALUES (?, ?, ?)`).run(church.id, template, variant.variant_id);
          db.prepare(`UPDATE email_variants SET sent_count = sent_count + 1 WHERE id = ?`).run(variant.id);
        }
        sent++;
        // Brief delay to stay within Resend rate limits
        await new Promise(r => setTimeout(r, 120));
      } catch (err) {
        failed++;
        errors.push({ church: church.name, error: err.message });
      }
    }

    res.json({ ok: true, sent, failed, total: churches.length, errors: errors.slice(0, 10) });
  });

  // ── HEALTH ────────────────────────────────────────────────────────────────
  // ── UNSUBSCRIBE ───────────────────────────────────────────────────────────
  // Public, signed-token endpoint — does NOT require SEED_TOKEN or session.
  // Called by the unsubscribe.html page hosted on crownmediagroup.co.
  app.post('/api/kingdom-reach/unsubscribe', (req, res) => {
    const { id, t } = req.body || {};
    const churchId = parseInt(id);
    if (!churchId || !t) return res.status(400).json({ error: 'missing_id_or_token' });

    const expected = unsubscribeSig(churchId);
    if (t !== expected) return res.status(401).json({ error: 'invalid_token' });

    const result = db.prepare(`
      UPDATE churches
      SET unsubscribed = 1, unsubscribed_at = datetime('now')
      WHERE id = ?
    `).run(churchId);

    if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true });
  });

  app.get('/api/kingdom-reach/health', (req, res) => {
    res.json({
      ok: true,
      churches: db.prepare('SELECT COUNT(*) as c FROM churches').get().c,
      dispatches: db.prepare('SELECT COUNT(*) as c FROM kingdom_dispatches').get().c,
      resend: !!process.env.RESEND_API_KEY,
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      inbox: INBOX_DIR,
      output: OUTPUT_DIR,
      last_dispatch_at: db.prepare('SELECT MAX(created_at) as t FROM kingdom_dispatches').get().t || null,
      failed_today: db.prepare("SELECT COUNT(*) as c FROM kingdom_dispatches WHERE status='error' AND date(created_at)=date('now')").get().c,
      followups_pending: db.prepare("SELECT COUNT(*) as c FROM kingdom_dispatches WHERE email_sent=1 AND followup_1_sent=0 AND created_at < datetime('now', '-2 days')").get().c,
    });
  });

  console.log('[Kingdom Reach] Mounted — /kingdom-reach (form), /kingdom-reach/dashboard (CRM table)');
}

// ─── PIPELINE ────────────────────────────────────────────────────────────────
async function runPipeline(db, dispatchId, churchHint, { sendNow = false } = {}) {
  const start = Date.now();
  const update = (sql, ...args) => db.prepare(`UPDATE kingdom_dispatches SET ${sql}, updated_at=datetime('now') WHERE id=?`).run(...args, dispatchId);

  const transcript = db.prepare('SELECT transcript FROM kingdom_dispatches WHERE id=?').get(dispatchId).transcript;
  const data = await extractTranscript({ transcript, churchHint });

  // Upsert church record
  const slug = slugify(data.church_name);
  let church = db.prepare('SELECT * FROM churches WHERE name = ? COLLATE NOCASE').get(data.church_name);
  if (!church) {
    db.prepare(`INSERT INTO churches
      (name, pastor, phone, address, email, has_website, recommended_tier, pipeline_value,
       pain_points, interests, key_quotes, sentiment, budget, follow_up_date, notes, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Contacted')`)
      .run(data.church_name, data.pastor_name, data.phone, data.address,
           churchHint.email || '', churchHint.website ? 1 : 0,
           data.recommended_tier, pipelineValue(data.recommended_tier),
           JSON.stringify(data.pain_points), JSON.stringify(data.interests), JSON.stringify(data.key_quotes),
           data.overall_sentiment, data.budget_mentioned || '', data.follow_up_date || null, data.notes);
    church = db.prepare('SELECT * FROM churches WHERE name = ? COLLATE NOCASE').get(data.church_name);
  } else {
    db.prepare(`UPDATE churches SET
      pastor = COALESCE(NULLIF(?, ''), pastor),
      phone  = COALESCE(NULLIF(?, ''), phone),
      address= COALESCE(NULLIF(?, ''), address),
      recommended_tier = ?,
      pipeline_value   = ?,
      pain_points = ?, interests = ?, key_quotes = ?,
      sentiment = ?, budget = ?, follow_up_date = COALESCE(?, follow_up_date),
      notes = CASE WHEN notes = '' THEN ? ELSE notes || '\n' || ? END,
      status = CASE WHEN status IN ('Client','Not Interested') THEN status ELSE 'Contacted' END
      WHERE id = ?`)
      .run(data.pastor_name, data.phone, data.address,
           data.recommended_tier, pipelineValue(data.recommended_tier),
           JSON.stringify(data.pain_points), JSON.stringify(data.interests), JSON.stringify(data.key_quotes),
           data.overall_sentiment, data.budget_mentioned || '', data.follow_up_date || null,
           data.notes, data.notes, church.id);
  }

  update('church_id=?, extracted_json=?, status=?', church.id, JSON.stringify(data), 'processing');

  // Build deliverables in parallel
  const tasks = [];
  if (data.website_needed) tasks.push(Promise.resolve(writeSite(OUTPUT_DIR, data)).then(r => ({ kind:'site', ...r })));
  tasks.push(writeProposal(OUTPUT_DIR, data).then(r => ({ kind:'proposal', ...r })));
  tasks.push(Promise.resolve(writeEmailDraft(OUTPUT_DIR, data, {})).then(r => ({ kind:'email', ...r })));

  const built = await Promise.all(tasks);
  const sitePath  = built.find(x => x.kind === 'site')?.path     || null;
  const propPath  = built.find(x => x.kind === 'proposal')?.path || null;
  const emailPath = built.find(x => x.kind === 'email')?.path    || null;

  update('website_path=?, proposal_path=?, email_draft_path=?, status=?',
    sitePath, propPath, emailPath, 'ready');

  if (sendNow) {
    const to = churchHint.email || db.prepare('SELECT email FROM churches WHERE id = ?').get(church.id)?.email;
    if (to) {
      const proposalUrl = `https://crm.crownmediagroup.co/kingdom-reach/output/${slug}/proposal`;
      const draft  = (await import('./generators/email.js')).buildEmail(data, church, proposalUrl);
      const result = await sendViaResend({ to, subject: draft.subject, html: draft.html, text: draft.text,
        attachmentPath: propPath, attachmentName: `${slug}_proposal.pdf` });
      if (result.ok) {
        db.prepare(`UPDATE kingdom_dispatches SET email_sent=1, email_sent_at=datetime('now'),
          email_message_id=?, status='sent', updated_at=datetime('now') WHERE id=?`)
          .run(result.id || '', dispatchId);
        db.prepare(`UPDATE churches SET status='Proposal Sent' WHERE id=? AND status NOT IN ('Client','Not Interested')`).run(church.id);
      } else {
        update('error=?', `Auto-send failed: ${result.error}`);
      }
    }
  }

  console.log(`[Kingdom Reach] Pipeline done — ${data.church_name} (${slug}) in ${Math.round((Date.now()-start)/1000)}s`);
}

function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function sanitize(s) { return String(s || '').replace(/[^a-z0-9\-_]/gi, '').slice(0, 80); }

export { runPipeline };
