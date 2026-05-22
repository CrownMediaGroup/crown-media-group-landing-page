// breakout.mjs — N-day high breakout with volume confirmation + ATR trailing stop.
// Buys when price closes above the highest close of the last N days on >1.2x avg volume.
// Exits when price falls more than ATR_STOP_MULT × ATR below the recent peak.

import pkg from 'technicalindicators';
const { ATR } = pkg;

const LOOKBACK      = 20;
const VOL_CONFIRM   = 1.2;
const ATR_PERIOD    = 14;
const ATR_STOP_MULT = 2.5;

export function evaluate(bars) {
  if (bars.length < Math.max(LOOKBACK, ATR_PERIOD) + 2) {
    return { action: 'hold', reason: 'not_enough_history' };
  }

  const last      = bars[bars.length - 1];
  const lookback  = bars.slice(-(LOOKBACK + 1), -1);
  const highestPrev = Math.max(...lookback.map(b => b.c));
  const avgVol    = lookback.reduce((s, b) => s + (b.v || 0), 0) / lookback.length;

  // Breakout entry
  if (last.c > highestPrev && (last.v || 0) > avgVol * VOL_CONFIRM) {
    const breakoutPct = ((last.c - highestPrev) / highestPrev) * 100;
    return {
      action:     'buy',
      reason:     `Closed at ${last.c.toFixed(2)} above ${LOOKBACK}-day high ${highestPrev.toFixed(2)} on ${((last.v || 0) / avgVol).toFixed(1)}x avg volume`,
      confidence: Math.min(1, 0.5 + breakoutPct / 10),
    };
  }

  // ATR-based trailing stop on exit
  const high  = bars.map(b => b.h ?? b.c);
  const low   = bars.map(b => b.l ?? b.c);
  const close = bars.map(b => b.c);
  const atrSeries = ATR.calculate({ period: ATR_PERIOD, high, low, close });
  const atr = atrSeries[atrSeries.length - 1];
  const recentPeak = Math.max(...bars.slice(-LOOKBACK).map(b => b.h ?? b.c));
  if (atr && last.c < recentPeak - ATR_STOP_MULT * atr) {
    return {
      action:     'sell',
      reason:     `Closed at ${last.c.toFixed(2)} below ATR trailing stop (peak ${recentPeak.toFixed(2)} − ${ATR_STOP_MULT}×ATR ${atr.toFixed(2)})`,
      confidence: 0.8,
    };
  }

  return {
    action: 'hold',
    reason: `last=${last.c.toFixed(2)} ${LOOKBACK}d_high=${highestPrev.toFixed(2)} atr=${atr ? atr.toFixed(2) : 'n/a'}`,
  };
}

export const META = {
  name:        'Breakout',
  slug:        'breakout',
  horizon:     'days',
  description: '20-day high breakout with volume confirmation + ATR trailing stop.',
};
