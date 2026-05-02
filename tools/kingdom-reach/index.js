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
  app.get('/api/kingdom-reach/churches', requireAuth, (req, res) => {
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
        SUM(pipeline_value) as pipeline_total
      FROM churches WHERE workspace_id = 1`).get();
    res.json({ ok:true, churches, totals });
  });

  app.patch('/api/kingdom-reach/churches/:id', requireAuth, (req, res) => {
    const allowed = ['status','recommended_tier','follow_up_date','notes','phone','email','pastor','website','has_website'];
    const fields  = Object.keys(req.body || {}).filter(k => allowed.includes(k));
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    vals.push(req.params.id);
    db.prepare(`UPDATE churches SET ${sets} WHERE id = ?`).run(...vals);
    res.json({ ok: true });
  });

  // ── DISPATCH LIST ─────────────────────────────────────────────────────────
  app.get('/api/kingdom-reach/dispatches', requireAuth, (req, res) => {
    const rows = db.prepare(`SELECT d.*, c.name as church_name, c.pastor, c.email
      FROM kingdom_dispatches d
      LEFT JOIN churches c ON c.id = d.church_id
      ORDER BY d.created_at DESC LIMIT 50`).all();
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
      const draft  = (await import('./generators/email.js')).buildEmail(data, { siteUrl: '' });
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
