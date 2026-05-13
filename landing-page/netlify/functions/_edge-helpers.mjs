// Shared helpers for Kingdom Edge endpoints
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

export const TIER_FEATURES = {
  watch: { watchlistMax: 1,  watchlistSymbolsMax: 10, alertsPerDay: 5,  briefTypes: ['morning'] },
  trade: { watchlistMax: 3,  watchlistSymbolsMax: 20, alertsPerDay: 25, briefTypes: ['morning','midday','close'] },
  edge:  { watchlistMax: 10, watchlistSymbolsMax: 50, alertsPerDay: 100, briefTypes: ['morning','midday','close'] },
};

export function tierFromProductId(productId = '') {
  if (productId === 'edge-watch-37')  return 'watch';
  if (productId === 'edge-trade-97')  return 'trade';
  if (productId === 'edge-edge-297')  return 'edge';
  return null;
}

export async function resolveEdgeSubscription(email) {
  if (!email) return { ok: false, reason: 'missing_email' };

  const { data: clients, error } = await supabase
    .from('upkeep_clients')
    .select('email, product_id, stripe_subscription_id, status')
    .eq('email', email)
    .like('product_id', 'edge-%')
    .eq('status', 'active');

  if (error) return { ok: false, reason: 'db_error', error: error.message };
  if (!clients || clients.length === 0) return { ok: false, reason: 'no_active_edge_subscription' };

  const order = { edge: 3, trade: 2, watch: 1 };
  const best = clients
    .map(c => ({ ...c, tier: tierFromProductId(c.product_id) }))
    .filter(c => c.tier)
    .sort((a, b) => (order[b.tier] || 0) - (order[a.tier] || 0))[0];

  if (!best) return { ok: false, reason: 'unknown_tier' };

  return {
    ok:             true,
    tier:           best.tier,
    productId:      best.product_id,
    subscriptionId: best.stripe_subscription_id,
    features:       TIER_FEATURES[best.tier],
  };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const LEGAL_DISCLAIMER = 'Kingdom Edge is an educational research tool. Not investment advice. Trading involves risk of loss.';
