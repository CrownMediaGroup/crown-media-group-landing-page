// Strategy registry — import all strategies and expose by slug
import * as trendFollow from './trend-follow.mjs';
import * as meanRevert  from './mean-revert.mjs';
import * as breakout    from './breakout.mjs';

export const STRATEGIES = {
  trend_follow: trendFollow,
  mean_revert:  meanRevert,
  breakout:     breakout,
};

export function getStrategy(slug) {
  return STRATEGIES[slug] || null;
}
