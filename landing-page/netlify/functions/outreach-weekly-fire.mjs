// outreach-weekly-fire.mjs — scheduled Mon 14:00 UTC (9am EST)
//
// Fires the next safe outreach wave with personalized pitch PDFs.
// - Respects the outreach_paused safety brake.
// - Hard cap: 25 sends per run (stays inside Netlify's 10s budget; Resend SDK is fast).
// - Marks email_sent=1, email_sent_at=NOW(), status='Pitched' per recipient.
//
// Can also be invoked manually via:
//   curl -X POST "https://crownmediagroup.co/.netlify/functions/outreach-weekly-fire?dry=1"

import {
  crmFetchAllChurches,
  crmPatchChurch,
  getWorkspaceSettings,
  filterSafeToSend,
  sendEmail,
  pitchEmailBody,
  firstNameFrom,
} from './_outreach-helpers.mjs';
import { buildPitchPdfBytes } from './_pitch-pdf-builder.mjs';

const HARD_CAP_PER_RUN = 25;

export default async (req, _context) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';
  const startedAt = Date.now();

  // Safety brake
  let settings;
  try {
    settings = await getWorkspaceSettings();
  } catch (e) {
    return Response.json({ ok: false, error: 'workspace-settings unreachable: ' + e.message }, { status: 500 });
  }

  if (settings.outreach_paused === 'true') {
    return Response.json({
      ok: true,
      paused: true,
      reason: settings.safety_pause_reason || 'outreach_paused=true (manual or auto-safety)',
      sent: 0,
    });
  }

  // Pull cohort
  let churches;
  try { churches = await crmFetchAllChurches(); }
  catch (e) { return Response.json({ ok: false, error: 'CRM fetch failed: ' + e.message }, { status: 500 }); }

  const safeCohort = filterSafeToSend(churches, { minDaysSinceLastTouch: 7 });

  // Sort cold first (never contacted), then by oldest last-touch
  safeCohort.sort((a, b) => {
    const aT = a.email_sent_at ? new Date(a.email_sent_at).getTime() : 0;
    const bT = b.email_sent_at ? new Date(b.email_sent_at).getTime() : 0;
    return aT - bT;
  });

  const targets = safeCohort.slice(0, HARD_CAP_PER_RUN);

  if (dryRun) {
    return Response.json({
      ok: true,
      dry_run: true,
      eligible_total: safeCohort.length,
      would_send: targets.length,
      sample: targets.slice(0, 10).map(c => ({ id: c.id, name: c.name, email: c.email, last_touch: c.email_sent_at })),
    });
  }

  const results = { sent: 0, failed: 0, errors: [] };

  for (const church of targets) {
    try {
      const { bytes, filename } = await buildPitchPdfBytes(church);
      const body = pitchEmailBody({
        name: church.name,
        firstName: firstNameFrom(church.pastor),
        orgType: (church.org_type || 'church').toLowerCase(),
      });
      const sendResult = await sendEmail({
        to: church.email,
        subject: body.subject,
        text: body.text,
        attachmentBytes: bytes,
        attachmentFilename: filename,
        headers: { 'X-Church-Id': String(church.id) },
      });
      if (!sendResult.ok) {
        results.failed++;
        results.errors.push({ id: church.id, email: church.email, error: sendResult.error });
        continue;
      }
      await crmPatchChurch(church.id, {
        email_sent: 1,
        email_sent_at: new Date().toISOString(),
        status: 'Pitched',
        notes: ` [WEEKLY-FIRE ${new Date().toISOString().slice(0,10)} resend_id=${sendResult.id || ''}]`,
      });
      results.sent++;
    } catch (e) {
      results.failed++;
      results.errors.push({ id: church.id, email: church.email, error: e.message });
    }
  }

  return Response.json({
    ok: true,
    eligible_total: safeCohort.length,
    cap: HARD_CAP_PER_RUN,
    sent: results.sent,
    failed: results.failed,
    errors: results.errors.slice(0, 10),
    elapsed_ms: Date.now() - startedAt,
  });
};

// Netlify scheduled function — wired in netlify.toml
