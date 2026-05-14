// mean-revert.mjs — RSI-based mean-reversion strategy.
// Buys oversold (RSI < 30) with confirmation, sells on RSI > 70 or stop.
// v0.1 — basic implementation.

const RSI_PERIOD = 14;
const OVERSOLD   = 30;
const OVERBOUGHT = 70;

function rsi(closes, period = RSI_PERIOD) {
  if (closes.length < period + 1) return null;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const change = slice[i] - slice[i - 1];
    if (change > 0) gains += change; else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

export function evaluate(bars) {
  const closes = bars.map(b => b.c);
  if (closes.length < RSI_PERIOD + 2) return { action: 'hold', reason: 'not_enough_history' };

  const rsiNow  = rsi(closes);
  const rsiPrev = rsi(closes.slice(0, -1));

  if (rsiPrev < OVERSOLD && rsiNow >= OVERSOLD) {
    return { action: 'buy', reason: `RSI(${RSI_PERIOD}) crossed back above ${OVERSOLD} (${rsiNow.toFixed(1)})` };
  }
  if (rsiPrev > OVERBOUGHT && rsiNow <= OVERBOUGHT) {
    return { action: 'sell', reason: `RSI(${RSI_PERIOD}) crossed back below ${OVERBOUGHT} (${rsiNow.toFixed(1)})` };
  }
  return { action: 'hold', reason: `RSI=${rsiNow.toFixed(1)}` };
}

export const META = {
  name:       'Mean Revert',
  slug:       'mean_revert',
  horizon:    'hours to days',
  description:'RSI-based mean reversion. Buys oversold conditions, sells when momentum normalizes.',
};
