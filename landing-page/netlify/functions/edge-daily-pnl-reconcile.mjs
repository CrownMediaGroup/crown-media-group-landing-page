// Scheduled (post-NYSE close): compute daily_pnl + cumulative_pnl for each user's snapshot.
// Source-of-truth for the daily-loss risk gate. Without this, the gate has no data to read.
//
// Logic: For each user with a snapshot today AND yesterday → daily_pnl = today.equity - yesterday.equity.
// cumulative_pnl = yesterday.cumulative_pnl + daily_pnl (rolls forward from zero on first day).
//
// Triggered by netlify.toml cron at 21:30 UTC daily (~30 min after NYSE close).

import { supabase, json } from './_edge-helpers.mjs';

const INTERNAL_SECRET = process.env.EDGE_INTERNAL_SECRET;

export default async (req) => {
  const evt = req.headers.get('x-nf-event-type') || req.headers.get('x-netlify-event') || '';
  const isScheduled = evt.toLowerCase().includes('schedule');

  let body = {};
  try { const t = await req.text(); if (t) body = JSON.parse(t); } catch { /* noop */ }

  if (!isScheduled) {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!INTERNAL_SECRET)      return json(503, { error: 'server_misconfig' });
    if (body.secret !== INTERNAL_SECRET) return json(401, { error: 'unauthorized' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const yest  = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const { data: todays } = await supabase
    .from('edge_bot_snapshots')
    .select('user_email, equity')
    .eq('snapshot_date', today);

  const { data: yesterdays } = await supabase
    .from('edge_bot_snapshots')
    .select('user_email, equity, cumulative_pnl')
    .eq('snapshot_date', yest);

  const yMap = new Map(
    (yesterdays || []).map(s => [
      s.user_email,
      { eq: Number(s.equity) || 0, cum: Number(s.cumulative_pnl) || 0 },
    ]),
  );

  let reconciled = 0;
  for (const t of (todays || [])) {
    const y = yMap.get(t.user_email);
    const todayEq = Number(t.equity) || 0;
    const dailyPnl = y ? (todayEq - y.eq) : 0;
    const cumPnl   = y ? (y.cum + dailyPnl) : 0;
    const { error } = await supabase
      .from('edge_bot_snapshots')
      .update({ daily_pnl: dailyPnl, cumulative_pnl: cumPnl })
      .eq('user_email', t.user_email)
      .eq('snapshot_date', today);
    if (!error) reconciled++;
  }

  return json(200, { ok: true, reconciled, today, yest });
};

export const config = { path: '/api/edge-daily-pnl-reconcile' };
