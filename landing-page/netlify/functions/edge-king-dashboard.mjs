// GET /api/edge-king-dashboard?email=...&token=...
// Returns King's bot state: live account, P&L history, positions, trades, kill switches.
// Restricted to King's allowlist + EDGE_KING_DASH_TOKEN.

import { supabase, json } from './_edge-helpers.mjs';
import { loadBrokerage, alpacaAccount, alpacaPositions } from './_edge-bot-helpers.mjs';
import { isKingEmail } from './_strategy-registry.mjs';

const DASH_TOKEN = process.env.EDGE_KING_DASH_TOKEN;

export default async (req) => {
  if (!DASH_TOKEN) return json(503, { error: 'server_misconfig', detail: 'EDGE_KING_DASH_TOKEN not set' });

  const url   = new URL(req.url);
  const email = (url.searchParams.get('email') || '').toLowerCase().trim();
  const token = url.searchParams.get('token') || '';

  if (!isKingEmail(email))   return json(403, { error: 'tier_zero_required' });
  if (token !== DASH_TOKEN)  return json(401, { error: 'unauthorized' });

  // 1. Brokerage + live account snapshot from Alpaca
  const brokerage = await loadBrokerage(email);
  let liveAccount   = null;
  let livePositions = [];
  if (brokerage) {
    const acct = await alpacaAccount(brokerage);
    if (acct.ok) liveAccount = acct.data;
    const pos = await alpacaPositions(brokerage);
    if (pos.ok) livePositions = pos.data;
  }

  // 2. 90 days of equity snapshots (chart data)
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data: snaps } = await supabase
    .from('edge_bot_snapshots')
    .select('snapshot_date, equity, daily_pnl, cumulative_pnl')
    .eq('user_email', email)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });

  // 3. Last 50 trades
  const { data: trades } = await supabase
    .from('edge_bot_executions')
    .select('symbol, side, qty, notional, status, signal_reason, mode, executed_at, notes')
    .eq('user_email', email)
    .order('executed_at', { ascending: false })
    .limit(50);

  // 4. Active strategy
  const { data: strategy } = await supabase
    .from('edge_bot_strategies')
    .select('strategy, symbols, position_size_usd, max_open_positions, started_at, tier_required')
    .eq('user_email', email)
    .eq('active', true)
    .maybeSingle();

  // 5. Recent kill switches
  const { data: killSwitches } = await supabase
    .from('edge_kill_switches')
    .select('switch_name, reason, positions_flattened, triggered_at, recovered_at')
    .eq('user_email', email)
    .order('triggered_at', { ascending: false })
    .limit(10);

  return json(200, {
    ok: true,
    email,
    brokerage: brokerage ? {
      mode:          brokerage.mode,
      tier:          brokerage.tier,
      health_status: brokerage.health_status,
      connected_at:  brokerage.connected_at,
    } : null,
    liveAccount,
    livePositions,
    activeStrategy: strategy || null,
    snapshots:      snaps        || [],
    trades:         trades       || [],
    killSwitches:   killSwitches || [],
  });
};

export const config = { path: '/api/edge-king-dashboard' };
