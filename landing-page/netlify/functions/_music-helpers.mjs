// Shared helpers for Kingdom Sound endpoints
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Tier limits — keep aligned with SUBSCRIPTIONS in create-subscription.mjs
export const TIER_QUOTAS = {
  starter: 5,
  pro:     20,
  studio:  Infinity,
};

export function tierFromProductId(productId = '') {
  if (productId === 'music-starter-27') return 'starter';
  if (productId === 'music-pro-67')     return 'pro';
  if (productId === 'music-studio-147') return 'studio';
  return null;
}

/**
 * Resolve a caller's active music subscription by email.
 * Returns { ok:true, tier, productId, subscriptionId } or { ok:false, reason }.
 */
export async function resolveMusicSubscription(email) {
  if (!email) return { ok: false, reason: 'missing_email' };

  const { data: clients, error } = await supabase
    .from('upkeep_clients')
    .select('email, product_id, stripe_subscription_id, status')
    .eq('email', email)
    .like('product_id', 'music-%')
    .eq('status', 'active');

  if (error) return { ok: false, reason: 'db_error', error: error.message };
  if (!clients || clients.length === 0) return { ok: false, reason: 'no_active_music_subscription' };

  // If multiple, pick the highest tier (studio > pro > starter)
  const order = { studio: 3, pro: 2, starter: 1 };
  const best  = clients
    .map(c => ({ ...c, tier: tierFromProductId(c.product_id) }))
    .filter(c => c.tier)
    .sort((a, b) => (order[b.tier] || 0) - (order[a.tier] || 0))[0];

  if (!best) return { ok: false, reason: 'unknown_tier' };

  return {
    ok:             true,
    tier:           best.tier,
    productId:      best.product_id,
    subscriptionId: best.stripe_subscription_id,
  };
}

/**
 * Count downloads in the current calendar month for an email.
 */
export async function monthlyDownloadsFor(email) {
  const monthBucket = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const { count, error } = await supabase
    .from('music_downloads')
    .select('id', { count: 'exact', head: true })
    .eq('user_email', email)
    .eq('month_bucket', monthBucket);

  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count || 0, monthBucket };
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
