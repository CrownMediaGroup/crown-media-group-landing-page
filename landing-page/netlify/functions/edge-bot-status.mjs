// GET /api/edge-bot-status?email=... — returns the user's current bot state for the dashboard.
// Includes: connection status, active strategy, recent executions, last snapshot P&L.

import { supabase, resolveEdgeSubscription, json } from './_edge-helpers.mjs';
import { loadBrokerage, alpacaAccount } from './_edge-bot-helpers.mjs';

export default async (req) => {
  const url   = new URL(req.url);
  const email = (url.searchParams.get('email') || '').toLowerCase().trim();
  if (!email) return json(400, { error: 'missing_email' });

  const sub = await resolveEdgeSubscription(email);
  if (!sub.ok) return json(403, { error: 'no_active_edge_subscription' });

  // Brokerage
  const brokerage = await loadBrokerage(email);
  let live_account = null;
  if (brokerage) {
    const acct = await alpacaAccount(brokerage);
    if (acct.ok) {
      live_account = {
        portfolio_value: parseFloat(acct.data.portfolio_value || 0),
        cash:            parseFloat(acct.data.cash || 0),
        buying_power:    parseFloat(acct.data.buying_power || 0),
        status:          acct.data.status,
      };
    }
  }

  // Strategy
  const { data: strategy } = await supabase
    .from('edge_bot_strategies')
    .select('id, strategy, symbols, active, position_size_usd, max_open_positions, started_at, config')
    .eq('user_email', email)
    .eq('active', true)
    .maybeSingle();

  // Recent executions
  const { data: executions } = await supabase
    .from('edge_bot_executions')
    .select('id, symbol, side, qty, notional, status, filled_price, signal_reason, executed_at')
    .eq('user_email', email)
    .order('executed_at', { ascending: false })
    .limit(25);

  // Latest snapshot
  const { data: snapshot } = await supabase
    .from('edge_bot_snapshots')
    .select('snapshot_date, equity, cash, buying_power, daily_pnl, cumulative_pnl, open_positions')
    .eq('user_email', email)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return json(200, {
    tier: sub.tier,
    brokerage: brokerage ? {
      connected:    true,
      mode:         brokerage.mode,
      connected_at: brokerage.connected_at,
      health:       brokerage.health_status,
    } : { connected: false },
    live_account,
    strategy: strategy || null,
    executions: executions || [],
    snapshot: snapshot || null,
  });
};

export const config = { path: '/api/edge-bot-status' };
