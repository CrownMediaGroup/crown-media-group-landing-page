// POST /api/edge-bot-runner — execute one pass of every active bot.
//
// PHASE 1 HARDENING (2026-05-22):
//   - Pre-trade risk gates (daily loss, drawdown, position size, gross exposure, PDT)
//   - Catastrophic gate auto-flattens all positions
//   - Buys placed as BRACKET orders (entry + stop-loss + take-profit atomic)
//   - Execution alerts emailed via Resend on every fill
//   - Scheduler-aware: accepts Netlify scheduled invocations OR manual POST w/ secret
//   - Symbol-class filter via ?mode=stocks|crypto|all (for separate cron cadences)
//
// Triggers:
//   - Scheduled (NYSE hours):  netlify.toml [functions."edge-bot-runner"] schedule="*/5 13-20 * * 1-5"
//   - Manual:                  curl -X POST .../api/edge-bot-runner -d '{"secret":"..."}'
//
// PAPER MODE ONLY until EDGE_LIVE_ENABLED=true AND attorney sign-off recorded.

import { Resend } from 'resend';
import { supabase, json } from './_edge-helpers.mjs';
import {
  loadBrokerage,
  alpacaAccount,
  alpacaPositions,
  alpacaPlaceOrder,
  alpacaPlaceBracketOrder,
  alpacaLatestPrice,
  alpacaBars,
} from './_edge-bot-helpers.mjs';
import { getStrategy } from './_strategies/index.mjs';
import { runAllGates, computeBracketLegs, autoFlatten } from './_risk-gates.mjs';

const INTERNAL_SECRET = process.env.EDGE_INTERNAL_SECRET;
const ALERTS_FROM     = process.env.EDGE_ALERTS_FROM || 'edge@crownmediagroup.co';
const ALERTS_ENABLED  = (process.env.EDGE_ALERTS_ENABLED || 'true') === 'true';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function isCryptoSymbol(s = '') {
  return /\/(USD|USDT|USDC)$/.test(s);
}

async function sendAlert(toEmail, subject, html) {
  if (!ALERTS_ENABLED || !resend || !toEmail) return;
  try {
    await resend.emails.send({ from: ALERTS_FROM, to: toEmail, subject, html });
  } catch (e) {
    console.error('[edge-bot] alert send failed', e.message);
  }
}

async function runOneUser(strategyRow) {
  const email    = strategyRow.user_email;
  const stratMod = getStrategy(strategyRow.strategy);
  if (!stratMod) return { ok: false, email, error: 'unknown_strategy', strategy: strategyRow.strategy };

  const brokerage = await loadBrokerage(email);
  if (!brokerage) return { ok: false, email, error: 'no_brokerage_connected' };
  // attach email for downstream loggers (autoFlatten uses brokerage.user_email)
  brokerage.user_email = email;

  const acct = await alpacaAccount(brokerage);
  if (!acct.ok) return { ok: false, email, error: 'alpaca_account_failed', detail: acct.error };
  const equity = parseFloat(acct.data?.equity || 0);

  const posResp = await alpacaPositions(brokerage);
  const openPositions = posResp.ok ? posResp.data : [];
  const openCount = openPositions.length;

  // Phase 2: tier comes from brokerage.tier (set by alpaca-connect via _strategy-registry).
  // Falls back to mode-derived tier if old rows pre-date the migration.
  const tier = brokerage.tier || (brokerage.mode === 'live' ? 'live' : 'paper');

  const decisions = [];

  for (const symbol of strategyRow.symbols) {
    const bars = await alpacaBars(brokerage, symbol, { timeframe: '1Day', limit: 60 });
    if (!bars.ok || bars.bars.length === 0) {
      decisions.push({ symbol, action: 'skip', reason: 'no_bars' });
      continue;
    }

    const signal = stratMod.evaluate(bars.bars);
    const symKey = symbol.replace('/', '');
    const ownsThis = openPositions.some(p => p.symbol === symbol || p.symbol === symKey);

    if (signal.action === 'buy' && !ownsThis && openCount < strategyRow.max_open_positions) {
      const notional = Number(strategyRow.position_size_usd);

      // ── PRE-TRADE RISK GATES ────────────────────────────────────────────
      const gates = await runAllGates({
        userEmail: email, tier, equity, notional, openPositions, symbol, side: 'buy',
      });

      if (!gates.ok) {
        await supabase.from('edge_bot_executions').insert({
          user_email:    email,
          strategy_id:   strategyRow.id,
          symbol,
          side:          'buy',
          qty:           0,
          notional,
          status:        'rejected',
          signal_reason: signal.reason,
          mode:          brokerage.mode,
          notes:         `risk_gate_blocked:${gates.firstFailure?.gate || 'unknown'}`,
        });
        decisions.push({
          symbol,
          action: 'blocked_by_risk_gate',
          gate:   gates.firstFailure?.gate,
          detail: gates.firstFailure,
        });

        // Catastrophic gates → auto-flatten everything
        const catastrophic = ['daily_loss', 'drawdown_5d'];
        if (catastrophic.includes(gates.firstFailure?.gate)) {
          const flat = await autoFlatten(brokerage, openPositions, gates.firstFailure);
          await sendAlert(
            email,
            'Kingdom Edge: Risk gate triggered — positions flattened',
            `<p>Risk gate <b>${gates.firstFailure.gate}</b> triggered. Bot auto-flattened ${flat.length} position(s).</p>
             <p>Detail: <code>${JSON.stringify(gates.firstFailure)}</code></p>
             <p>The bot will NOT open new positions until you review and reset.</p>`,
          );
        }
        continue;
      }

      // ── ORDER PLACEMENT (BRACKET PREFERRED) ─────────────────────────────
      const priceRes = await alpacaLatestPrice(brokerage, symbol);
      let orderRes;
      let orderType;
      let bracketLegs = null;

      if (priceRes.ok && priceRes.price > 0 && !isCryptoSymbol(symbol)) {
        // Stocks: try bracket first (Alpaca doesn't support brackets on crypto).
        const qty = Math.max(1, Math.floor(notional / priceRes.price));
        bracketLegs = computeBracketLegs(priceRes.price, tier);
        orderRes = await alpacaPlaceBracketOrder(brokerage, {
          symbol,
          qty,
          side:        'buy',
          stop_price:  bracketLegs.stop,
          limit_price: bracketLegs.target,
        });
        orderType = 'bracket';
        if (!orderRes.ok) {
          // Some symbols/accounts reject brackets — fall back to plain market.
          orderRes  = await alpacaPlaceOrder(brokerage, { symbol, notional, side: 'buy' });
          orderType = 'market_naked_fallback';
        }
      } else {
        // Crypto or no price → plain market (no Alpaca bracket support for crypto).
        orderRes  = await alpacaPlaceOrder(brokerage, { symbol, notional, side: 'buy' });
        orderType = 'market';
      }

      await supabase.from('edge_bot_executions').insert({
        user_email:    email,
        strategy_id:   strategyRow.id,
        symbol,
        side:          'buy',
        qty:           0,
        notional,
        order_id:      orderRes.ok ? orderRes.data?.id : null,
        status:        orderRes.ok ? 'submitted' : 'rejected',
        signal_reason: signal.reason,
        mode:          brokerage.mode,
        notes:         orderRes.ok
          ? `order_type:${orderType}${bracketLegs ? ` stop:${bracketLegs.stop} tp:${bracketLegs.target}` : ''}`
          : (orderRes.error?.slice(0, 200) || `http_${orderRes.status}`),
      });

      if (orderRes.ok) {
        await sendAlert(
          email,
          `Kingdom Edge: BUY ${symbol} ($${notional})`,
          `<p>Bot placed a <b>${orderType}</b> BUY for <b>${symbol}</b>.</p>
           <p>Notional: $${notional}<br/>
              Signal: ${signal.reason}<br/>
              Mode: ${brokerage.mode}
              ${bracketLegs ? `<br/>Stop: $${bracketLegs.stop} · Target: $${bracketLegs.target}` : ''}
           </p>`,
        );
      }

      decisions.push({ symbol, action: 'buy', order_type: orderType, ok: orderRes.ok, reason: signal.reason });

    } else if (signal.action === 'sell' && ownsThis) {
      const pos = openPositions.find(p => p.symbol === symbol || p.symbol === symKey);
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
        notes:         orderRes.ok ? null : (orderRes.error?.slice(0, 200) || `http_${orderRes.status}`),
      });
      if (orderRes.ok) {
        await sendAlert(
          email,
          `Kingdom Edge: SELL ${symbol}`,
          `<p>Bot placed a SELL for <b>${symbol}</b> (qty ${pos.qty}).</p>
           <p>Signal: ${signal.reason}<br/>Mode: ${brokerage.mode}</p>`,
        );
      }
      decisions.push({ symbol, action: 'sell', ok: orderRes.ok, reason: signal.reason });

    } else {
      decisions.push({ symbol, action: 'hold', reason: signal.reason });
    }
  }

  // Snapshot account state for the day (for downstream P&L gates).
  await supabase.from('edge_bot_snapshots').upsert({
    user_email:     email,
    snapshot_date:  new Date().toISOString().slice(0, 10),
    equity,
    cash:           parseFloat(acct.data?.cash || 0),
    buying_power:   parseFloat(acct.data?.buying_power || 0),
    open_positions: openPositions,
    mode:           brokerage.mode,
  }, { onConflict: 'user_email,snapshot_date' });

  return { ok: true, email, strategy: strategyRow.strategy, decisions };
}

export default async (req) => {
  // Scheduler-aware auth: Netlify scheduled invocations include x-nf-event-type=schedule
  // and have an empty body. Manual POSTs must supply body.secret.
  const evt = req.headers.get('x-nf-event-type') || req.headers.get('x-netlify-event') || '';
  const isScheduled = evt.toLowerCase().includes('schedule');

  let body = {};
  try { const t = await req.text(); if (t) body = JSON.parse(t); } catch { /* noop */ }

  if (!isScheduled) {
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    if (!INTERNAL_SECRET)      return json(503, { error: 'server_misconfig', detail: 'EDGE_INTERNAL_SECRET not set' });
    if (body.secret !== INTERNAL_SECRET) return json(401, { error: 'unauthorized' });
  }

  // Symbol-class filter — allows stock-hours cron and crypto 24/7 cron to share this function.
  const url = new URL(req.url);
  const modeFilter = (url.searchParams.get('mode') || body.mode || 'all').toLowerCase();

  const { data: strategies } = await supabase
    .from('edge_bot_strategies')
    .select('*')
    .eq('active', true);

  const filtered = (strategies || []).filter(s => {
    if (modeFilter === 'all') return true;
    const hasCrypto = (s.symbols || []).some(isCryptoSymbol);
    if (modeFilter === 'crypto') return hasCrypto;
    if (modeFilter === 'stocks') return !hasCrypto;
    return true;
  });

  const results = [];
  for (const strat of filtered) {
    try {
      results.push(await runOneUser(strat));
    } catch (e) {
      results.push({ ok: false, email: strat.user_email, error: e.message });
    }
  }

  return json(200, {
    ok: true,
    invoked_via: isScheduled ? 'schedule' : 'manual',
    mode_filter: modeFilter,
    ran: results.length,
    results,
  });
};

// Scheduled-only — schedule is defined in netlify.toml. Path MUST be omitted
// (Netlify rejects scheduled functions with a custom path). Manual HTTP invocation
// is intentionally not supported in production; for ad-hoc test use Netlify CLI
// `netlify functions:invoke edge-bot-runner` from a logged-in dev machine.
export const config = {};
