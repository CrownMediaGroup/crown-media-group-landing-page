// GET /api/edge-dashboard?email=...
// Returns everything the member dashboard needs in one shot:
//   - subscription tier + features
//   - watchlists + their symbols
//   - latest brief of each type the tier is entitled to
//   - last 25 alerts for this user
//   - simple market snapshot (today's date, market open/closed)
//
// LEGAL: this endpoint does NOT return personalized investment advice.
// All briefs are identical across all subscribers — same "newspaper" content.

import { supabase, resolveEdgeSubscription, json, LEGAL_DISCLAIMER } from './_edge-helpers.mjs';

function marketStatusNow() {
  // Quick + dirty US equity market status (NYSE/Nasdaq)
  const now = new Date();
  const day = now.getUTCDay();        // 0 = Sun
  const utcHour = now.getUTCHours();
  const utcMin  = now.getUTCMinutes();
  const minutesUTC = utcHour * 60 + utcMin;
  // Regular hours: 13:30 UTC – 20:00 UTC (9:30 AM – 4:00 PM ET, ignoring DST nuance)
  const open = day >= 1 && day <= 5 && minutesUTC >= (13 * 60 + 30) && minutesUTC < (20 * 60);
  return { open, day, utc_time: now.toISOString() };
}

export default async (req) => {
  const url   = new URL(req.url);
  const email = (url.searchParams.get('email') || '').toLowerCase().trim();

  const sub = await resolveEdgeSubscription(email);
  if (!sub.ok) return json(403, { error: 'no_active_edge_subscription', reason: sub.reason });

  // Watchlists
  const { data: watchlists } = await supabase
    .from('edge_watchlists')
    .select('id,name,symbols,created_at,updated_at')
    .eq('user_email', email)
    .eq('active', true)
    .order('created_at', { ascending: true });

  // Latest brief of each type the tier is entitled to
  const briefs = {};
  for (const t of sub.features.briefTypes) {
    const { data: b } = await supabase
      .from('edge_briefs')
      .select('id,brief_type,brief_date,summary,content_html,symbols,created_at')
      .eq('brief_type', t)
      .order('brief_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (b) briefs[t] = b;
  }

  // Recent alerts (last 25)
  const { data: alerts } = await supabase
    .from('edge_alerts')
    .select('id,symbol,message,payload,triggered_at,delivered_via,opened_at')
    .eq('user_email', email)
    .order('triggered_at', { ascending: false })
    .limit(25);

  return json(200, {
    tier:       sub.tier,
    features:   sub.features,
    market:     marketStatusNow(),
    watchlists: watchlists || [],
    briefs,
    alerts:     alerts || [],
    disclaimer: LEGAL_DISCLAIMER,
  });
};

export const config = { path: '/api/edge-dashboard' };
