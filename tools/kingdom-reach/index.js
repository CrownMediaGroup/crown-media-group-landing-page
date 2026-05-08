// tools/kingdom-reach/index.js — Kingdom Reach module mounted into the CRM Express app
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync } from 'fs';

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
    bodyHtml = campaignHtml({ first, name, city, pixel, subject,
      bodyLines: [
        `Just following up on my note from a few days ago. I know ministry keeps you busy — I completely understand.`,
        `I put together a quick idea specifically for <strong>${esc(name)}</strong> — happy to share it if there's any interest. It would take about 10 minutes to look over and zero commitment.`,
        `Is there a good person to run this by?`,
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
    bodyHtml = campaignHtml({ first, name, city, pixel, subject,
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
    bodyHtml = campaignHtml({ first, name, city, pixel, subject,
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

function campaignHtml({ first, name, city, pixel, subject, bodyLines }) {
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
    <p style="margin:16px 0 0;font-size:11px;color:#aaa;text-align:center">Crown Media Group · Columbia, SC · <a href="mailto:king@crownmediagroup.co?subject=Unsubscribe" style="color:#aaa">Unsubscribe</a></p>
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
    const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';
    if (req.query.token !== SEED_TOKEN && !req.kingdomUser) {
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

  app.patch('/api/kingdom-reach/churches/:id', requireAuth, (req, res) => {
    const allowed = ['status','recommended_tier','follow_up_date','notes','phone','email','pastor','website','has_website','pipeline_value','name','address','email_sent','email_sent_at','email_opened','email_opened_at','follow_up_sent','follow_up_sent_at','replied','replied_at'];
    const fields  = Object.keys(req.body || {}).filter(k => allowed.includes(k));
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
      const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';
      if (token !== SEED_TOKEN && !req.kingdomUser) return res.status(403).json({ error: 'auth required' });
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
    const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';
    if (token !== SEED_TOKEN && !req.kingdomUser) return res.status(403).json({ error: 'auth required' });
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
    const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';
    if (token !== SEED_TOKEN && !req.kingdomUser) return res.status(403).json({ error: 'auth required' });
    if (!email && !name) return res.status(400).json({ error: 'email or name required' });
    let r;
    if (email) {
      r = db.prepare(`UPDATE churches SET replied=1, replied_at=COALESCE(replied_at,datetime('now')), status=CASE WHEN status IN ('Client','Not Interested') THEN status ELSE 'Contacted' END WHERE email=?`).run(email);
    } else {
      r = db.prepare(`UPDATE churches SET replied=1, replied_at=COALESCE(replied_at,datetime('now')), status=CASE WHEN status IN ('Client','Not Interested') THEN status ELSE 'Contacted' END WHERE name=? COLLATE NOCASE`).run(name);
    }
    res.json({ ok: true, updated: r.changes });
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
    const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';
    if ((req.body?.token) !== SEED_TOKEN && !req.kingdomUser) {
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
    }
    res.set({ 'Content-Type':'image/gif', 'Cache-Control':'no-cache,no-store,must-revalidate', 'Pragma':'no-cache' });
    res.send(PIXEL);
  });

  // ── CAMPAIGN PREVIEW (generate personalized email HTML for a church) ─────
  app.post('/api/kingdom-reach/campaign/preview', (req, res) => {
    const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';
    if (req.body?.token !== SEED_TOKEN && !req.kingdomUser) {
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
    const SEED_TOKEN = process.env.SEED_TOKEN || 'KingdomSeed2026';
    if (req.body?.token !== SEED_TOKEN && !req.kingdomUser) {
      const session = validateSession && getCookie ? validateSession(getCookie(req, 'crm_session')) : null;
      if (!session) return res.status(401).json({ error: 'Unauthorized' });
    }

    const { template = 'no_website', filter = 'not_sent', church_ids, org_type: orgTypeFilter, dry_run = false } = req.body || {};
    const proto   = req.headers['x-forwarded-proto'] || 'https';
    const host    = req.headers['x-forwarded-host'] || req.headers.host || 'crm.crownmediagroup.co';
    const baseUrl = `${proto}://${host}`;

    let churches;
    if (Array.isArray(church_ids) && church_ids.length) {
      const placeholders = church_ids.map(() => '?').join(',');
      churches = db.prepare(`SELECT * FROM churches WHERE id IN (${placeholders}) AND email IS NOT NULL AND email != ''`).all(...church_ids);
    } else {
      let sql = `SELECT * FROM churches WHERE email IS NOT NULL AND email != '' AND email_sent = 0`;
      if (filter === 'no_website')    sql += ' AND has_website = 0';
      if (filter === 'has_website')   sql += ' AND has_website = 1';
      if (filter === 'tier_a')        sql += " AND tier = 'A'";
      if (filter === 'tier_ab')       sql += " AND tier IN ('A','B')";
      if (filter === 'orgs_only')     sql += " AND org_type != 'church'";
      if (filter === 'churches_only') sql += " AND (org_type = 'church' OR org_type IS NULL)";
      if (filter === 'follow_up')     sql = `SELECT * FROM churches WHERE email IS NOT NULL AND email != '' AND email_sent=1 AND replied=0 AND email_sent_at < datetime('now','-7 days') AND follow_up_sent=0`;
      if (orgTypeFilter)              sql += ` AND org_type = '${orgTypeFilter.replace(/'/g,"''")}'`;
      sql += ' ORDER BY tier ASC, name ASC LIMIT 100';
      churches = db.prepare(sql).all();
    }

    if (!churches.length) return res.json({ ok: true, sent: 0, skipped: 0, message: 'No eligible churches found' });
    if (dry_run) return res.json({ ok: true, dry_run: true, count: churches.length, churches: churches.map(c => ({ id:c.id, name:c.name, email:c.email, template })) });

    let sent = 0, failed = 0, errors = [];
    const isFollowUp = filter === 'follow_up';

    for (const church of churches) {
      try {
        const { subject, html, text } = buildCampaignEmail(church, template, baseUrl, false);
        const result = await sendViaResend({ to: church.email, subject, html, text });
        if (!result.ok) {
          failed++;
          errors.push({ church: church.name, error: result.error });
          continue;
        }
        if (isFollowUp) {
          db.prepare(`UPDATE churches SET follow_up_sent=1, follow_up_sent_at=datetime('now') WHERE id=?`).run(church.id);
        } else {
          db.prepare(`UPDATE churches SET email_sent=1, email_sent_at=datetime('now') WHERE id=?`).run(church.id);
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
