#!/usr/bin/env node
// Kingdom Edge Backtest Harness
// Replays a strategy over historical Alpaca bars and computes Sharpe, max drawdown,
// win rate, profit factor. Writes a markdown report to Agency/ops/notes/.
//
// Usage:
//   node tools/edge-backtest.mjs --strategy trend_follow --symbols SPY,QQQ,AAPL --years 3
//   node tools/edge-backtest.mjs --strategy mean_revert  --symbols AAPL --years 1 --capital 10000
//   node tools/edge-backtest.mjs --all
//
// Requires APCA_API_KEY_ID + APCA_API_SECRET in landing-page/.env (free Alpaca account works).
// Strategies must pass: Sharpe ≥ 0.5 AND Max DD ≤ 25% to be eligible for production.

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

// ── ENV LOADING ─────────────────────────────────────────────────────────────
function loadEnv() {
  const tryPaths = [
    path.join(ROOT, '.env'),
    path.join(ROOT, 'landing-page', '.env'),
  ];
  for (const p of tryPaths) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m) {
          const val = m[2].replace(/^["']|["']$/g, '').trim();
          if (!process.env[m[1]]) process.env[m[1]] = val;
        }
      }
    }
  }
}
loadEnv();

const ALPACA_KEY    = process.env.APCA_API_KEY_ID    || process.env.ALPACA_API_KEY_ID;
const ALPACA_SECRET = process.env.APCA_API_SECRET    || process.env.ALPACA_SECRET_KEY;
const DATA_BASE     = 'https://data.alpaca.markets/v2';

if (!ALPACA_KEY || !ALPACA_SECRET) {
  console.error('Missing APCA_API_KEY_ID / APCA_API_SECRET. Add them to landing-page/.env.');
  console.error('Get free paper-mode keys at https://app.alpaca.markets/paper/dashboard/overview');
  process.exit(1);
}

// ── CLI ARGS ────────────────────────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const next = process.argv[i + 1];
    const v = next && !next.startsWith('--') ? process.argv[++i] : 'true';
    args[k] = v;
  }
}

const STRATEGIES       = ['trend_follow', 'mean_revert', 'breakout'];
const DEFAULT_UNIVERSE = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA'];

const targetStrategies = args.all ? STRATEGIES : [args.strategy || 'trend_follow'];
const symbols          = (args.symbols || DEFAULT_UNIVERSE.join(',')).split(',').map(s => s.trim()).filter(Boolean);
const years            = Number(args.years    || 3);
const capital          = Number(args.capital  || 10000);
const positionSize     = Number(args.position || capital * 0.1);

const endDate   = new Date();
const startDate = new Date(endDate.getTime() - years * 365 * 86400000);
const startISO  = startDate.toISOString().slice(0, 10);
const endISO    = endDate.toISOString().slice(0, 10);

console.log('Backtest config:');
console.log(`  Strategies:    ${targetStrategies.join(', ')}`);
console.log(`  Symbols:       ${symbols.join(', ')}`);
console.log(`  Period:        ${startISO} → ${endISO} (${years}y)`);
console.log(`  Capital:       $${capital}`);
console.log(`  Position size: $${positionSize}`);
console.log('');

// ── DATA FETCH ──────────────────────────────────────────────────────────────
async function fetchBars(symbol) {
  const all = [];
  let token = null;
  let page  = 0;
  do {
    const params = new URLSearchParams({
      timeframe:  '1Day',
      start:      startISO,
      end:        endISO,
      limit:      '10000',
      adjustment: 'all',
    });
    if (token) params.set('page_token', token);
    const res = await fetch(`${DATA_BASE}/stocks/${encodeURIComponent(symbol)}/bars?${params}`, {
      headers: {
        'APCA-API-KEY-ID':     ALPACA_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET,
      },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`bar fetch failed for ${symbol}: ${res.status} ${txt.slice(0, 200)}`);
    }
    const j = await res.json();
    all.push(...(j.bars || []));
    token = j.next_page_token;
    page++;
    if (page > 20) break;
  } while (token);
  return all;
}

// ── STRATEGY LOADER ─────────────────────────────────────────────────────────
async function loadStrategy(slug) {
  const file = path.join(ROOT, 'landing-page', 'netlify', 'functions', '_strategies', `${slug.replace('_','-')}.mjs`);
  if (!fs.existsSync(file)) throw new Error(`strategy not found: ${file}`);
  const url = pathToFileURL(file).href;
  return import(url);
}

// ── BACKTEST CORE ───────────────────────────────────────────────────────────
async function runBacktest(strategySlug, symbol, bars) {
  const mod = await loadStrategy(strategySlug);
  let cash       = capital;
  let position   = null;        // { qty, entryPrice, entryDate }
  const trades       = [];
  const equityCurve  = [];

  for (let i = 30; i < bars.length; i++) {
    const history  = bars.slice(0, i + 1);
    const signal   = mod.evaluate(history);
    const todayBar = bars[i];
    const nextBar  = bars[i + 1];
    const nextOpen = nextBar?.o ?? todayBar.c;

    // mark-to-market equity at today's close
    const mtm = position ? cash + position.qty * todayBar.c : cash;
    equityCurve.push({ date: todayBar.t, equity: mtm });

    if (signal.action === 'buy' && !position && nextBar) {
      const qty = Math.floor(positionSize / nextOpen);
      if (qty > 0) {
        cash    -= qty * nextOpen;
        position = { qty, entryPrice: nextOpen, entryDate: nextBar.t };
      }
    } else if (signal.action === 'sell' && position && nextBar) {
      const exitPrice = nextOpen;
      const pnl       = (exitPrice - position.entryPrice) * position.qty;
      cash += position.qty * exitPrice;
      trades.push({
        entryDate:  position.entryDate,
        exitDate:   nextBar.t,
        entryPrice: position.entryPrice,
        exitPrice,
        qty:        position.qty,
        pnl,
        returnPct:  (exitPrice / position.entryPrice - 1) * 100,
      });
      position = null;
    }
  }

  // Force-close any open position at the end of the test
  if (position && bars.length) {
    const last = bars[bars.length - 1];
    const pnl  = (last.c - position.entryPrice) * position.qty;
    cash += position.qty * last.c;
    trades.push({
      entryDate:  position.entryDate,
      exitDate:   last.t,
      entryPrice: position.entryPrice,
      exitPrice:  last.c,
      qty:        position.qty,
      pnl,
      returnPct:  (last.c / position.entryPrice - 1) * 100,
      forcedClose: true,
    });
  }

  return { cash, trades, equityCurve };
}

// ── METRICS ─────────────────────────────────────────────────────────────────
function computeMetrics(equityCurve, trades, startCap) {
  if (equityCurve.length < 2) {
    return { sharpe: 0, maxDD: 0, winRate: 0, profitFactor: 0, totalReturn: 0, trades: 0 };
  }
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = Math.max(1, equityCurve[i - 1].equity);
    returns.push((equityCurve[i].equity - equityCurve[i - 1].equity) / prev);
  }
  const mean   = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  const stdev  = Math.sqrt(variance);
  const sharpe = stdev === 0 ? 0 : (mean * 252) / (stdev * Math.sqrt(252));

  let peak  = equityCurve[0].equity;
  let maxDD = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak > 0 ? (peak - pt.equity) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  const wins         = trades.filter(t => t.pnl > 0);
  const losses       = trades.filter(t => t.pnl <= 0);
  const winRate      = trades.length === 0 ? 0 : wins.length / trades.length;
  const grossWin     = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss    = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss;
  const totalReturn  = (equityCurve[equityCurve.length - 1].equity - startCap) / startCap;

  return {
    sharpe:       +sharpe.toFixed(2),
    maxDD:        +(maxDD * 100).toFixed(2),
    winRate:      +(winRate * 100).toFixed(1),
    profitFactor: profitFactor === Infinity ? 'inf' : +profitFactor.toFixed(2),
    totalReturn:  +(totalReturn * 100).toFixed(2),
    trades:       trades.length,
  };
}

// ── REPORT BUILDER ──────────────────────────────────────────────────────────
const report = [];
const ts     = new Date().toISOString().slice(0, 10);
report.push(`# Kingdom Edge Backtest — ${ts}`);
report.push('');
report.push(`Period: ${startISO} → ${endISO} · Capital: $${capital} · Position size: $${positionSize}`);
report.push('');
report.push('| Strategy | Symbol | Trades | Win Rate | Profit Factor | Total Return | Sharpe | Max DD | Gate |');
report.push('|---|---|---|---|---|---|---|---|---|');

for (const strategy of targetStrategies) {
  for (const symbol of symbols) {
    try {
      process.stdout.write(`Fetching ${symbol}... `);
      const bars = await fetchBars(symbol);
      console.log(`${bars.length} bars`);
      if (bars.length < 50) {
        console.warn(`  Skip ${symbol}: only ${bars.length} bars`);
        continue;
      }
      console.log(`  Backtesting ${strategy} on ${symbol}`);
      const { trades, equityCurve } = await runBacktest(strategy, symbol, bars);
      const m = computeMetrics(equityCurve, trades, capital);
      const gatePass = m.sharpe >= 0.5 && m.maxDD <= 25 ? 'PASS' : 'FAIL';
      report.push(`| ${strategy} | ${symbol} | ${m.trades} | ${m.winRate}% | ${m.profitFactor} | ${m.totalReturn}% | ${m.sharpe} | ${m.maxDD}% | ${gatePass} |`);
      console.log(`    → Sharpe ${m.sharpe} · MaxDD ${m.maxDD}% · Return ${m.totalReturn}% · ${m.trades} trades · ${gatePass}`);
    } catch (e) {
      console.error(`  ERROR ${strategy}/${symbol}: ${e.message}`);
      report.push(`| ${strategy} | ${symbol} | ERROR | - | - | - | - | - | - |`);
    }
  }
}

report.push('');
report.push('## Gating Rules');
report.push('- **PASS** = Sharpe ≥ 0.5 AND Max DD ≤ 25%. Strategy is eligible for production use.');
report.push('- **FAIL** = strategy must be revised before deployment to King Tier-0 or paying customers.');
report.push('');
report.push('## Caveats');
report.push('- Backtests use end-of-day bars only (no intraday execution slippage modeled).');
report.push('- No commission applied (Alpaca is commission-free for stocks).');
report.push('- Spread typically 1-3¢ per trade not modeled.');
report.push('- Survivorship bias risk if symbol universe is hand-picked winners.');
report.push('- Past performance is NOT predictive of future results.');

const outDir  = path.join(ROOT, 'Agency', 'ops', 'notes');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `EDGE-BACKTEST-${ts}.md`);
fs.writeFileSync(outPath, report.join('\n'), 'utf8');
console.log('');
console.log(`Report written to ${outPath}`);
