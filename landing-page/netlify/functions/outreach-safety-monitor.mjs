// outreach-safety-monitor.mjs — scheduled daily 04:00 UTC
//
// Reads aggregate stats from the CRM, compares against thresholds, and
// auto-pauses outreach if anything looks wrong.
//
// Triggers a pause if ANY of:
//   - reply_rate < REPLY_RATE_MIN_PCT over last 7 days (when sent >= MIN_SENT)
//   - bounce_rate > BOUNCE_RATE_MAX_PCT over last 7 days (when sent >= MIN_SENT)
//   - unsub_24h > UNSUB_24H_MAX
//
// Sends King an email when paused.
//
// Manual:
//   curl -X POST "https://crownmediagroup.co/.netlify/functions/outreach-safety-monitor?dry=1"

import {
  getStats7d,
  getWorkspaceSettings,
  setWorkspaceSetting,
  sendEmail,
} from './_outreach-helpers.mjs';

const REPLY_RATE_MIN_PCT  = 2.0;   // below this = cold pool exhausted
const BOUNCE_RATE_MAX_PCT = 5.0;   // above this = list quality dropped
const UNSUB_24H_MAX       = 3;     // more than 3 unsubs in a day = message is wrong
const MIN_SENT_FOR_RATES  = 30;    // don't pause based on rates if sample is tiny

const ALERT_TO = 'king@crownmediagroup.co';

export default async (req, _context) => {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry') === '1';

  let stats, settings;
  try {
    [stats, settings] = await Promise.all([getStats7d(), getWorkspaceSettings()]);
  } catch (e) {
    return Response.json({ ok: false, error: 'fetch failed: ' + e.message }, { status: 500 });
  }

  const triggers = [];

  if (stats.sent_7d >= MIN_SENT_FOR_RATES && stats.reply_rate < REPLY_RATE_MIN_PCT) {
    triggers.push(`reply rate ${stats.reply_rate}% < ${REPLY_RATE_MIN_PCT}% over ${stats.sent_7d} sends in last 7 days`);
  }
  if (stats.sent_7d >= MIN_SENT_FOR_RATES && stats.bounce_rate > BOUNCE_RATE_MAX_PCT) {
    triggers.push(`bounce rate ${stats.bounce_rate}% > ${BOUNCE_RATE_MAX_PCT}% over ${stats.sent_7d} sends in last 7 days`);
  }
  if (stats.unsub_24h > UNSUB_24H_MAX) {
    triggers.push(`${stats.unsub_24h} unsubs in last 24h > ${UNSUB_24H_MAX} threshold`);
  }

  // Already paused?
  const alreadyPaused = settings.outreach_paused === 'true';
  const shouldPause = triggers.length > 0;

  if (shouldPause && !alreadyPaused) {
    const reason = triggers.join('; ');
    if (!dryRun) {
      await setWorkspaceSetting('outreach_paused', 'true');
      await setWorkspaceSetting('safety_pause_reason', reason);
      await sendEmail({
        to: ALERT_TO,
        subject: '[Kingdom Reach] OUTREACH PAUSED — safety brake triggered',
        text: `Safety monitor just paused all scheduled outreach.

Stats from last 7 days:
  sent_7d:     ${stats.sent_7d}
  replied_7d:  ${stats.replied_7d}
  bounced_7d:  ${stats.bounced_7d}
  unsub_24h:   ${stats.unsub_24h}
  reply_rate:  ${stats.reply_rate}%
  bounce_rate: ${stats.bounce_rate}%

Triggered because: ${reason}

To resume: PATCH outreach_paused back to false:
  curl -X PATCH "https://crm.crownmediagroup.co/api/kingdom-reach/workspace-settings/outreach_paused" \\
       -H "Content-Type: application/json" \\
       -d '{"token":"<SEED_TOKEN>","value":"false"}'

Investigate the cause before resuming. Common fixes:
  - Bad list import: review recent enrichments
  - Message problem: rewrite the pitch template
  - Reputation hit: switch send domain or warm up`,
      });
    }
    return Response.json({
      ok: true,
      action: dryRun ? 'would-pause' : 'paused',
      reason,
      stats,
    });
  }

  if (!shouldPause && alreadyPaused) {
    // Don't auto-unpause — King has to do it manually after investigating
    return Response.json({
      ok: true,
      action: 'kept paused (manual unpause required)',
      pause_reason: settings.safety_pause_reason || '(unknown)',
      stats,
    });
  }

  return Response.json({
    ok: true,
    action: 'healthy',
    stats,
  });
};
