// POST /api/edge-bot-strategy — set or update the user's active strategy.
// Body: { email, strategy: 'trend_follow'|'mean_revert'|'breakout', symbols: [...], position_size_usd?, max_open_positions? }
//
// Only one strategy active per user at a time. Re-posting deactivates the previous one.

import { supabase, resolveEdgeSubscription, json } from './_edge-helpers.mjs';
import { getStrategy } from './_strategies/index.mjs';
import { canUseStrategy, isKingEmail, strategiesFor } from './_strategy-registry.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let body; try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const email    = (body.email || '').toLowerCase().trim();
  const strategy = (body.strategy || '').toLowerCase();
  const symbols  = Array.isArray(body.symbols) ? body.symbols.map(s => String(s).toUpperCase().trim()).filter(Boolean) : [];
  const position_size_usd  = parseInt(body.position_size_usd)  || 1000;
  const max_open_positions = parseInt(body.max_open_positions) || 3;

  if (!email)                return json(400, { error: 'missing_email' });
  if (!getStrategy(strategy)) return json(400, { error: 'unknown_strategy', valid: strategiesFor('tier_zero') });
  if (symbols.length === 0)  return json(400, { error: 'no_symbols' });
  if (symbols.length > 20)   return json(400, { error: 'too_many_symbols', max: 20 });

  const sub = await resolveEdgeSubscription(email);
  if (!sub.ok && !isKingEmail(email)) return json(403, { error: 'no_active_edge_subscription' });
  if (sub.ok && sub.tier === 'watch')  return json(403, { error: 'watch_tier_no_bot' });

  // Read brokerage tier (auto-set to tier_zero for King on Alpaca connect)
  const { data: brokerage } = await supabase
    .from('edge_brokerage_connections')
    .select('tier, mode')
    .eq('user_email', email)
    .maybeSingle();

  const effectiveTier = brokerage?.tier
    || (isKingEmail(email) ? 'tier_zero' : (brokerage?.mode === 'live' ? 'live' : 'paper'));

  if (!canUseStrategy(effectiveTier, strategy)) {
    return json(403, {
      error: 'strategy_not_allowed_for_tier',
      tier:  effectiveTier,
      available: strategiesFor(effectiveTier),
    });
  }

  // Deactivate prior strategies
  await supabase.from('edge_bot_strategies').update({ active: false, stopped_at: new Date().toISOString() })
    .eq('user_email', email).eq('active', true);

  // Insert new (records the tier_required so future runs can re-validate)
  const { data, error } = await supabase.from('edge_bot_strategies').insert({
    user_email: email,
    strategy,
    symbols,
    position_size_usd,
    max_open_positions,
    tier_required: effectiveTier,
    active: true,
  }).select().single();

  if (error) return json(500, { error: error.message });
  return json(200, { ok: true, strategy: data, tier: effectiveTier });
};

export const config = { path: '/api/edge-bot-strategy' };
