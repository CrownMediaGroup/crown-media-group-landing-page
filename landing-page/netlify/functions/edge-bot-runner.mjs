// POST /api/edge-bot-runner — execute one pass of every active bot.
// For each active edge_bot_strategies row:
//   1. Load user's brokerage connection
//   2. For each symbol in the strategy:
//      a. Fetch recent bars from Alpaca
//      b. Run the strategy evaluator
//      c. If buy/sell signal AND not over-position-limit → place order via Alpaca
//      d. Log to edge_bot_executions
//   3. Snapshot the user's account at end of pass
//
// Triggers:
//   - Manual: curl -X POST .../api/edge-bot-runner -d '{"secret":"..."}'
//   - Scheduled: add to netlify.toml with cron '*/5 13-20 * * 1-5'
//
// PAPER MODE ONLY by default. Live mode requires EDGE_LIVE_ENABLED=true + attorney sign-off.

import { supabase, json } from './_edge-helpers.mjs';
import { loadBrokerage, alpacaAccount, alpacaPositions, alpacaPlaceOrder, alpacaBars } from './_edge-bot-helpers.mjs';
import { getStrategy } from './_strategies/index.mjs';

const INTERNAL_SECRET = process.env.EDGE_INTERNAL_SECRET;

async function runOneUser(strategyRow) {
  const email     = strategyRow.user_email;
  const stratMod  = getStrategy(strategyRow.strategy);
  if (!stratMod) return { ok: false, email, error: 'unknown_strategy', strategy: strategyRow.strategy };

  const brokerage = await loadBrokerage(email);
  if (!brokerage) return { ok: false, email, error: 'no_brokerage_connected' };

  // Account check
  const acct = await alpacaAccount(brokerage);
  if (!acct.ok) return { ok: false, email, error: 'alpaca_account_failed', detail: acct.error };

  // Position check
  const posResp = await alpacaPositions(brokerage);
  const openPositions = posResp.ok ? posResp.data : [];
  const openCount = openPositions.length;

  const decisions = [];
  for (const symbol of strategyRow.symbols) {
    const bars = await alpacaBars(brokerage, symbol, { timeframe: '1Day', limit: 50 });
    if (!bars.ok) { decisions.push({ symbol, action: 'skip', reason: 'no_bars' }); continue; }
    const signal = stratMod.evaluate(bars.bars);
    decisions.push({ symbol, ...signal });

    const ownsThis = openPositions.some(p => p.symbol === symbol);

    if (signal.action === 'buy' && !ownsThis && openCount < strategyRow.max_open_positions) {
      const orderRes = await alpacaPlaceOrder(brokerage, {
        symbol,
        notional: strategyRow.position_size_usd,
        side:     'buy',
      });
      await supabase.from('edge_bot_executions').insert({
        user_email:    email,
        strategy_id:   strategyRow.id,
        symbol,
        side:          'buy',
        qty:           0,
        notional:      strategyRow.position_size_usd,
        order_id:      orderRes.ok ? orderRes.data?.id : null,
        status:        orderRes.ok ? 'submitted' : 'rejected',
        signal_reason: signal.reason,
        mode:          brokerage.mode,
        notes:         orderRes.ok ? null : (orderRes.error?.slice(0, 200) || `http_${orderRes.status}`),
      });
    } else if (signal.action === 'sell' && ownsThis) {
      const pos = openPositions.find(p => p.symbol === symbol);
      const orderRes = await alpacaPlaceOrder(brokerage, {
        symbol,
        qty:  Math.abs(parseFloat(pos.qty)),
        side: 'sell',
      });
      await supabase.from('edge_bot_executions').insert({
        user_email:    email,
        strategy_id:   strategyRow.id,
        symbol,
        side:          'sell',
        qty:           parseFloat(pos.qty),
        order_id:      orderRes.ok ? orderRes.data?.id : null,
        status:        orderRes.ok ? 'submitted' : 'rejected',
        signal_reason: signal.reason,
        mode:          brokerage.mode,
      });
    }
  }

  // Snapshot account state for the day
  await supabase.from('edge_bot_snapshots').upsert({
    user_email:     email,
    snapshot_date:  new Date().toISOString().slice(0, 10),
    equity:         parseFloat(acct.data?.equity || 0),
    cash:           parseFloat(acct.data?.cash || 0),
    buying_power:   parseFloat(acct.data?.buying_power || 0),
    open_positions: openPositions,
    mode:           brokerage.mode,
  }, { onConflict: 'user_email,snapshot_date' });

  return { ok: true, email, strategy: strategyRow.strategy, decisions };
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let body; try { body = await req.json(); } catch { body = {}; }
  if (!INTERNAL_SECRET) return json(503, { error: 'server_misconfig', detail: 'EDGE_INTERNAL_SECRET not set' });
  if (body.secret !== INTERNAL_SECRET) return json(401, { error: 'unauthorized' });

  // Get every active strategy across all users
  const { data: strategies } = await supabase
    .from('edge_bot_strategies')
    .select('*')
    .eq('active', true);

  const results = [];
  for (const strat of (strategies || [])) {
    try {
      results.push(await runOneUser(strat));
    } catch (e) {
      results.push({ ok: false, email: strat.user_email, error: e.message });
    }
  }

  return json(200, { ok: true, ran: results.length, results });
};

export const config = { path: '/api/edge-bot-runner' };
