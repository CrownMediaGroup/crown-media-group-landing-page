// POST /api/edge-alpaca-connect — store user's Alpaca API key (encrypted).
// Body: { email, api_key_id, api_secret, mode: 'paper'|'live' }
//
// Validates the key by calling Alpaca /account before saving. Live-mode requires
// the user be subscribed to edge-edge-297 (Live Trader) AND the live-trader feature
// flag be enabled (via EDGE_LIVE_ENABLED env var, off by default until attorney signs off).

import { supabase, resolveEdgeSubscription, json } from './_edge-helpers.mjs';
import { encryptSecret, alpacaFetch } from './_edge-bot-helpers.mjs';

const LIVE_ENABLED = process.env.EDGE_LIVE_ENABLED === 'true';

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let body; try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const email      = (body.email || '').toLowerCase().trim();
  const keyId      = (body.api_key_id || '').trim();
  const apiSecret  = (body.api_secret || '').trim();
  const mode       = (body.mode || 'paper').toLowerCase();

  if (!email || !keyId || !apiSecret) return json(400, { error: 'missing_fields' });
  if (!['paper', 'live'].includes(mode)) return json(400, { error: 'invalid_mode' });

  // 1. Verify edge subscription
  const sub = await resolveEdgeSubscription(email);
  if (!sub.ok) return json(403, { error: 'no_active_edge_subscription' });

  // 2. Watch tier doesn't get bot access
  if (sub.tier === 'watch') return json(403, { error: 'watch_tier_no_bot', upgrade_url: '/edge.html#tiers' });

  // 3. Live mode gated by feature flag + Edge tier
  if (mode === 'live') {
    if (!LIVE_ENABLED) return json(403, { error: 'live_mode_not_yet_available', message: 'Live trading unlocks after securities attorney review.' });
    if (sub.tier !== 'edge') return json(403, { error: 'live_requires_edge_tier' });
  }

  // 4. Validate against Alpaca (call /account with the provided keys)
  const probe = await alpacaFetch({ api_key_id: keyId, api_secret: apiSecret, mode }, '/account');
  if (!probe.ok) {
    return json(401, { error: 'alpaca_auth_failed', detail: probe.error?.slice(0, 200) || `http_${probe.status}` });
  }

  // 5. Encrypt + upsert
  const enc_key    = encryptSecret(keyId);
  const enc_secret = encryptSecret(apiSecret);

  const { data, error } = await supabase
    .from('edge_brokerage_connections')
    .upsert({
      user_email:        email,
      product_id:        sub.productId,
      broker:            'alpaca',
      mode,
      api_key_id_enc:    enc_key,
      api_secret_enc:    enc_secret,
      last_health_check: new Date().toISOString(),
      health_status:     'ok',
      notes:             `Connected ${mode} mode. Alpaca account status: ${probe.data?.status || 'unknown'}`,
    }, { onConflict: 'user_email' })
    .select().single();

  if (error) return json(500, { error: 'db_error', detail: error.message });

  return json(200, {
    ok: true,
    mode,
    account: {
      status: probe.data?.status,
      portfolio_value: probe.data?.portfolio_value,
      buying_power: probe.data?.buying_power,
      cash: probe.data?.cash,
    },
    next_step: 'Pick a strategy and start the bot from your dashboard.',
  });
};

export const config = { path: '/api/edge-alpaca-connect' };
