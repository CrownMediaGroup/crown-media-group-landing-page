// Hard risk-management gates for the Kingdom Edge Bot.
// Every order MUST pass ALL gates before submission. Catastrophic gate failures
// (daily loss / drawdown) trigger auto-flatten of all positions.
//
// Tier-aware thresholds. tier_zero is King's personal account (gets in Phase 2);
// today everyone uses paper/live thresholds.

import { supabase } from './_edge-helpers.mjs';
import { alpacaPlaceOrder } from './_edge-bot-helpers.mjs';

const DEFAULTS = {
  paper:     { dailyLossPct: 3, drawdown5dPct: 8,  maxPositionPct: 5,  maxGrossExposurePct: 100, stopLossPct: 5,  takeProfitPct: 15 },
  live:      { dailyLossPct: 2, drawdown5dPct: 6,  maxPositionPct: 4,  maxGrossExposurePct: 100, stopLossPct: 4,  takeProfitPct: 12 },
  tier_zero: { dailyLossPct: 4, drawdown5dPct: 12, maxPositionPct: 8,  maxGrossExposurePct: 100, stopLossPct: 6,  takeProfitPct: 18 },
};

export function thresholdsFor(tier) {
  return DEFAULTS[tier] || DEFAULTS.paper;
}

function isCryptoSymbol(symbol = '') {
  return /\/(USD|USDT|USDC)$/.test(symbol);
}

export async function checkDailyLossGate(userEmail, equity, tier = 'paper') {
  const t = thresholdsFor(tier);
  const today = new Date().toISOString().slice(0, 10);
  const { data: snap } = await supabase
    .from('edge_bot_snapshots')
    .select('daily_pnl, equity')
    .eq('user_email', userEmail)
    .eq('snapshot_date', today)
    .maybeSingle();
  if (!snap || snap.daily_pnl == null) return { ok: true, gate: 'daily_loss', reason: 'no_snapshot_today' };
  const lossPct = Number(snap.daily_pnl) < 0
    ? (Math.abs(Number(snap.daily_pnl)) / Math.max(1, equity)) * 100
    : 0;
  if (lossPct >= t.dailyLossPct) {
    return { ok: false, gate: 'daily_loss', loss_pct: +lossPct.toFixed(2), threshold: t.dailyLossPct };
  }
  return { ok: true, gate: 'daily_loss', loss_pct: +lossPct.toFixed(2) };
}

export async function checkDrawdownGate(userEmail, lookbackDays = 5, tier = 'paper') {
  const t = thresholdsFor(tier);
  const since = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
  const { data: snaps } = await supabase
    .from('edge_bot_snapshots')
    .select('snapshot_date, equity')
    .eq('user_email', userEmail)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });
  if (!snaps || snaps.length < 2) return { ok: true, gate: 'drawdown_5d', reason: 'insufficient_history' };
  const peak = Math.max(...snaps.map(s => Number(s.equity) || 0));
  const cur  = Number(snaps[snaps.length - 1].equity) || 0;
  if (peak <= 0) return { ok: true, gate: 'drawdown_5d' };
  const ddPct = ((peak - cur) / peak) * 100;
  if (ddPct >= t.drawdown5dPct) {
    return { ok: false, gate: 'drawdown_5d', drawdown_pct: +ddPct.toFixed(2), threshold: t.drawdown5dPct };
  }
  return { ok: true, gate: 'drawdown_5d', drawdown_pct: +ddPct.toFixed(2) };
}

export function checkPositionSizeGate(notional, equity, tier = 'paper') {
  const t = thresholdsFor(tier);
  if (equity <= 0) return { ok: false, gate: 'position_size', reason: 'zero_equity' };
  const pct = (notional / equity) * 100;
  if (pct > t.maxPositionPct) {
    return { ok: false, gate: 'position_size', position_pct: +pct.toFixed(2), threshold: t.maxPositionPct };
  }
  return { ok: true, gate: 'position_size', position_pct: +pct.toFixed(2) };
}

export function checkGrossExposureGate(openPositions, notional, equity, tier = 'paper') {
  const t = thresholdsFor(tier);
  const currentExposure = (openPositions || []).reduce(
    (s, p) => s + Math.abs(Number(p.market_value) || 0), 0,
  );
  const projected = currentExposure + notional;
  if (equity <= 0) return { ok: false, gate: 'gross_exposure', reason: 'zero_equity' };
  const pct = (projected / equity) * 100;
  if (pct > t.maxGrossExposurePct) {
    return { ok: false, gate: 'gross_exposure', exposure_pct: +pct.toFixed(2), threshold: t.maxGrossExposurePct };
  }
  return { ok: true, gate: 'gross_exposure', exposure_pct: +pct.toFixed(2) };
}

/**
 * Pattern Day Trader compliance.
 * Accounts < $25k equity = max 3 day-trades (round-trip same day) over rolling 5 business days.
 * Crypto is exempt. Sell side does not open a new day-trade counter.
 */
export async function checkPdtCompliance(userEmail, equity, symbol, side) {
  if (equity >= 25000)        return { ok: true, gate: 'pdt', reason: 'above_25k_threshold' };
  if (isCryptoSymbol(symbol)) return { ok: true, gate: 'pdt', reason: 'crypto_exempt' };
  if (side !== 'buy')         return { ok: true, gate: 'pdt', reason: 'sell_does_not_open' };
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: execs } = await supabase
    .from('edge_bot_executions')
    .select('symbol, side, executed_at, status')
    .eq('user_email', userEmail)
    .gte('executed_at', since)
    .in('status', ['submitted', 'filled']);
  if (!execs || execs.length === 0) return { ok: true, gate: 'pdt', day_trades: 0 };
  const byDaySym = new Map();
  for (const e of execs) {
    const d = e.executed_at.slice(0, 10);
    const k = `${d}::${e.symbol}`;
    if (!byDaySym.has(k)) byDaySym.set(k, { buy: false, sell: false });
    if (e.side === 'buy')  byDaySym.get(k).buy  = true;
    if (e.side === 'sell') byDaySym.get(k).sell = true;
  }
  const dayTrades = [...byDaySym.values()].filter(v => v.buy && v.sell).length;
  if (dayTrades >= 3) {
    return { ok: false, gate: 'pdt', day_trades: dayTrades, threshold: 3, equity };
  }
  return { ok: true, gate: 'pdt', day_trades: dayTrades, equity };
}

/**
 * Compute bracket order legs (stop loss + take profit prices).
 */
export function computeBracketLegs(entryPrice, tier = 'paper') {
  const t = thresholdsFor(tier);
  const stop   = entryPrice * (1 - t.stopLossPct  / 100);
  const target = entryPrice * (1 + t.takeProfitPct / 100);
  return {
    stop:           +stop.toFixed(2),
    target:         +target.toFixed(2),
    stopLossPct:    t.stopLossPct,
    takeProfitPct:  t.takeProfitPct,
  };
}

/**
 * Run ALL gates and return aggregate result.
 */
export async function runAllGates({ userEmail, tier, equity, notional, openPositions, symbol, side }) {
  const results = [];
  results.push(await checkDailyLossGate(userEmail, equity, tier));
  results.push(await checkDrawdownGate(userEmail, 5, tier));
  results.push(checkPositionSizeGate(notional, equity, tier));
  results.push(checkGrossExposureGate(openPositions, notional, equity, tier));
  results.push(await checkPdtCompliance(userEmail, equity, symbol, side));
  const firstFailure = results.find(r => !r.ok);
  return { ok: !firstFailure, gates: results, firstFailure };
}

/**
 * Auto-flatten — liquidate every open position. Called on catastrophic gate failure.
 */
export async function autoFlatten(brokerage, openPositions, reason) {
  const results = [];
  for (const pos of (openPositions || [])) {
    const qty = Math.abs(parseFloat(pos.qty));
    if (qty <= 0) continue;
    const side = parseFloat(pos.qty) > 0 ? 'sell' : 'buy';
    const res = await alpacaPlaceOrder(brokerage, { symbol: pos.symbol, qty, side });
    results.push({ symbol: pos.symbol, qty, side, ok: res.ok, error: res.error });
  }
  // Best-effort kill-switch log (table arrives in Phase 2; swallow errors here).
  try {
    await supabase.from('edge_kill_switches').insert({
      user_email:           brokerage.user_email,
      switch_name:          reason?.gate || 'manual',
      reason:               JSON.stringify(reason),
      positions_flattened:  results.length,
    });
  } catch (_) { /* table not yet created */ }
  return results;
}
