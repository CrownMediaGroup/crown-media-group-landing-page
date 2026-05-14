// breakout.mjs — N-day high breakout strategy with volume confirmation.
// Buys when price closes above the highest close of the last N days on >1.2x avg volume.
// v0.1 — basic implementation.

const LOOKBACK         = 20;
const VOL_CONFIRM      = 1.2;
const TRAILING_STOP_DAYS = 5; // exit when price closes below lowest close of last 5 days

export function evaluate(bars) {
  if (bars.length < LOOKBACK + 1) return { action: 'hold', reason: 'not_enough_history' };

  const last        = bars[bars.length - 1];
  const lookback    = bars.slice(-(LOOKBACK + 1), -1);
  const highestPrev = Math.max(...lookback.map(b => b.c));
  const avgVol      = lookback.reduce((s, b) => s + (b.v || 0), 0) / lookback.length;

  if (last.c > highestPrev && (last.v || 0) > avgVol * VOL_CONFIRM) {
    return { action: 'buy', reason: `Closed at ${last.c.toFixed(2)} above ${LOOKBACK}-day high ${highestPrev.toFixed(2)} on ${((last.v || 0) / avgVol).toFixed(1)}x avg volume` };
  }

  const recent = bars.slice(-TRAILING_STOP_DAYS);
  const lowestRecent = Math.min(...recent.map(b => b.c));
  if (last.c < lowestRecent * 1.001) {
    return { action: 'sell', reason: `Closed at ${last.c.toFixed(2)} ≤ ${TRAILING_STOP_DAYS}-day low ${lowestRecent.toFixed(2)} (trailing stop)` };
  }

  return { action: 'hold', reason: `last_close=${last.c.toFixed(2)} ${LOOKBACK}d_high=${highestPrev.toFixed(2)}` };
}

export const META = {
  name:       'Breakout',
  slug:       'breakout',
  horizon:    'days',
  description:'20-day high breakout with volume confirmation. Cuts losers fast via 5-day trailing stop.',
};
