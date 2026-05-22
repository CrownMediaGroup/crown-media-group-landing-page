// mean-revert.mjs — RSI-based mean reversion. Library-backed for math correctness.
// Buys when oversold momentum reverses; sells when overbought momentum normalizes.

import pkg from 'technicalindicators';
const { RSI } = pkg;

const RSI_PERIOD = 14;
const OVERSOLD   = 30;
const OVERBOUGHT = 70;

export function evaluate(bars) {
  const closes = bars.map(b => b.c).filter(c => Number.isFinite(c));
  if (closes.length < RSI_PERIOD + 2) return { action: 'hold', reason: 'not_enough_history' };

  const rsiSeries = RSI.calculate({ period: RSI_PERIOD, values: closes });
  if (rsiSeries.length < 2) return { action: 'hold', reason: 'rsi_unavailable' };

  const rsiNow  = rsiSeries[rsiSeries.length - 1];
  const rsiPrev = rsiSeries[rsiSeries.length - 2];

  if (rsiPrev < OVERSOLD && rsiNow >= OVERSOLD) {
    return {
      action:     'buy',
      reason:     `RSI(${RSI_PERIOD}) crossed above ${OVERSOLD} from oversold (${rsiNow.toFixed(1)})`,
      confidence: Math.min(1, (OVERSOLD - rsiPrev) / 20 + 0.5),
    };
  }
  if (rsiPrev > OVERBOUGHT && rsiNow <= OVERBOUGHT) {
    return {
      action:     'sell',
      reason:     `RSI(${RSI_PERIOD}) crossed below ${OVERBOUGHT} from overbought (${rsiNow.toFixed(1)})`,
      confidence: Math.min(1, (rsiPrev - OVERBOUGHT) / 20 + 0.5),
    };
  }
  return { action: 'hold', reason: `RSI=${rsiNow.toFixed(1)}` };
}

export const META = {
  name:        'Mean Revert',
  slug:        'mean_revert',
  horizon:     'hours to days',
  description: 'RSI-based mean reversion. Buys oversold conditions, sells when momentum normalizes.',
};
