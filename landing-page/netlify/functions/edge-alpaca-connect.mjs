// POST /api/edge-alpaca-connect — store user's Alpaca API key (encrypted).
// Body: { email, api_key_id, api_secret, mode: 'paper'|'live' }
//
// Validates the key by calling Alpaca /account before saving. Live-mode requires
// the user be subscribed to edge-edge-297 (Live Trader) AND the live-trader feature
// flag be enabled (via EDGE_LIVE_ENABLED env var, off by default until attorney signs off).

import { Resend } from 'resend';
import { supabase, resolveEdgeSubscription, json } from './_edge-helpers.mjs';
import { encryptSecret, alpacaFetch } from './_edge-bot-helpers.mjs';

const LIVE_ENABLED = process.env.EDGE_LIVE_ENABLED === 'true';
const resend = new Resend(process.env.RESEND_API_KEY);

async function logConnectionAttempt(email, ip, mode, success, error_reason) {
  try {
    await supabase.from('edge_bot_connection_attempts').insert({
      user_email: email, requester_ip: ip || null, mode, success, error_reason: error_reason || null,
    });
  } catch (e) { /* table may not exist yet in dev; fail silently */ }
}

async function checkAnomaly(ip) {
  if (!ip) return false;
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('edge_bot_connection_attempts')
    .select('user_email')
    .eq('requester_ip', ip)
    .gte('created_at', tenMinAgo);
  const distinctEmails = new Set((data || []).map(r => r.user_email));
  return distinctEmails.size >= 2;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let body; try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const email      = (body.email || '').toLowerCase().trim();
  const keyId      = (body.api_key_id || '').trim();
  const apiSecret  = (body.api_secret || '').trim();
  const mode       = (body.mode || 'paper').toLowerCase();
  const ip         = (req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || '').split(',')[0].trim();

  if (!email || !keyId || !apiSecret) {
    await logConnectionAttempt(email, ip, mode, false, 'missing_fields');
    return json(400, { error: 'missing_fields' });
  }
  if (!['paper', 'live'].includes(mode)) {
    await logConnectionAttempt(email, ip, mode, false, 'invalid_mode');
    return json(400, { error: 'invalid_mode' });
  }

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

  if (error) {
    await logConnectionAttempt(email, ip, mode, false, `db_error: ${error.message}`);
    return json(500, { error: 'db_error', detail: error.message });
  }

  // Log success
  await logConnectionAttempt(email, ip, mode, true, null);

  // Anomaly: same IP submitted multiple different emails in 10 min → alert King
  const anomaly = await checkAnomaly(ip);
  if (anomaly) {
    resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to:   'king@crownmediagroup.co',
      subject: `[Edge SECURITY] Multiple email connect attempts from one IP`,
      html: `<div style="font-family:sans-serif;padding:24px"><h3>Anomaly detected</h3><p>IP <code>${ip}</code> has connected Alpaca keys for 2+ distinct emails in the last 10 minutes. Latest: <strong>${email}</strong> (${mode} mode). Investigate.</p></div>`,
    }).catch(() => {});
  }

  // Send confirmation email to the connecting email — gives them a chance to revoke if it wasn't them
  resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to:   email,
    subject: `Alpaca account connected to Kingdom Edge${mode === 'paper' ? ' (paper mode)' : ' (LIVE)'}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
      <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
      <h1 style="font-size:22px;font-weight:800;margin-bottom:12px">Your Alpaca account is now connected.</h1>
      <p style="color:#8888aa;line-height:1.7">An Alpaca API key was just linked to your Kingdom Edge subscription in <strong>${mode}</strong> mode. The bot can now place ${mode === 'paper' ? 'simulated' : 'real'} trades on your account.</p>
      <p style="color:#8888aa;line-height:1.7;margin-top:16px"><strong>If this wasn't you:</strong> log into <a href="https://app.alpaca.markets/" style="color:#C9981A">Alpaca</a> immediately and rotate/delete the API key. Then reply to this email so we can investigate.</p>
      <p style="color:#555;font-size:13px;margin-top:24px">Connected from IP: <code>${ip || 'unknown'}</code></p>
      <p style="color:#333;font-size:12px;margin-top:24px">Crown Media Group · Columbia, SC · Kingdom Edge is an educational tool. Not investment advice. Trading involves risk of loss.</p>
    </div>`,
  }).catch(() => {});

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
    confirmation_email_sent: true,
  });
};

export const config = { path: '/api/edge-alpaca-connect' };
