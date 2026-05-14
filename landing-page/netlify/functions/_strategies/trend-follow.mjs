// trend-follow.mjs — Simple SMA-crossover trend-following strategy.
// Buys when fast SMA crosses above slow SMA; sells when it crosses back below.
// v0.1 — basic implementation. Suitable for liquid large-caps + ETFs.

const FAST_PERIOD = 10;
const SLOW_PERIOD = 30;

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Evaluate a single symbol's bars and return a signal.
 * @param {Array<{c:number, t:string}>} bars - daily closes
 * @returns {{action:'buy'|'sell'|'hold', reason:string}}
 */
export function evaluate(bars) {
  const closes = bars.map(b => b.c);
  if (closes.length < SLOW_PERIOD + 1) return { action: 'hold', reason: 'not_enough_history' };

  const fastNow  = sma(closes, FAST_PERIOD);
  const slowNow  = sma(closes, SLOW_PERIOD);
  const fastPrev = sma(closes.slice(0, -1), FAST_PERIOD);
  const slowPrev = sma(closes.slice(0, -1), SLOW_PERIOD);

  if (fastPrev <= slowPrev && fastNow > slowNow) {
    return { action: 'buy', reason: `SMA${FAST_PERIOD} crossed above SMA${SLOW_PERIOD}` };
  }
  if (fastPrev >= slowPrev && fastNow < slowNow) {
    return { action: 'sell', reason: `SMA${FAST_PERIOD} crossed below SMA${SLOW_PERIOD}` };
  }
  return { action: 'hold', reason: `fast=${fastNow.toFixed(2)} slow=${slowNow.toFixed(2)} no_cross` };
}

export const META = {
  name:       'Trend Follow',
  slug:       'trend_follow',
  horizon:    'days to weeks',
  description:'SMA-crossover trend follower. Buys when momentum builds, exits when it fades.',
};
