// trend-follow.mjs — SMA-crossover trend follower. Library-backed for math correctness.
// Buys when fast SMA crosses above slow SMA; sells when it crosses back below.

import pkg from 'technicalindicators';
const { SMA } = pkg;

const FAST_PERIOD = 10;
const SLOW_PERIOD = 30;

/**
 * Evaluate one symbol's bars and return a signal.
 * @param {Array<{c:number, t:string}>} bars — daily closes ordered oldest→newest
 * @returns {{action:'buy'|'sell'|'hold', reason:string, confidence?:number}}
 */
export function evaluate(bars) {
  const closes = bars.map(b => b.c).filter(c => Number.isFinite(c));
  if (closes.length < SLOW_PERIOD + 1) return { action: 'hold', reason: 'not_enough_history' };

  const fastSeries = SMA.calculate({ period: FAST_PERIOD, values: closes });
  const slowSeries = SMA.calculate({ period: SLOW_PERIOD, values: closes });
  if (fastSeries.length < 2 || slowSeries.length < 2) {
    return { action: 'hold', reason: 'sma_unavailable' };
  }

  const fastNow  = fastSeries[fastSeries.length - 1];
  const fastPrev = fastSeries[fastSeries.length - 2];
  const slowNow  = slowSeries[slowSeries.length - 1];
  const slowPrev = slowSeries[slowSeries.length - 2];

  if (fastPrev <= slowPrev && fastNow > slowNow) {
    const spread = ((fastNow - slowNow) / slowNow) * 100;
    return {
      action:     'buy',
      reason:     `SMA${FAST_PERIOD} crossed above SMA${SLOW_PERIOD} (spread ${spread.toFixed(2)}%)`,
      confidence: Math.min(1, 0.5 + Math.abs(spread) / 10),
    };
  }
  if (fastPrev >= slowPrev && fastNow < slowNow) {
    const spread = ((slowNow - fastNow) / slowNow) * 100;
    return {
      action:     'sell',
      reason:     `SMA${FAST_PERIOD} crossed below SMA${SLOW_PERIOD} (spread ${spread.toFixed(2)}%)`,
      confidence: Math.min(1, 0.5 + Math.abs(spread) / 10),
    };
  }
  return { action: 'hold', reason: `fast=${fastNow.toFixed(2)} slow=${slowNow.toFixed(2)} no_cross` };
}

export const META = {
  name:        'Trend Follow',
  slug:        'trend_follow',
  horizon:     'days to weeks',
  description: 'SMA-crossover trend follower. Buys when momentum builds, exits when it fades.',
};
