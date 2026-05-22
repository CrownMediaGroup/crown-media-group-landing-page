// Centralized strategy permissions per tier.
// Customers get the 3 baseline strategies. Tier-0 (King's personal) gets those PLUS
// Phase 3 privileged research strategies (momentum_rs, pairs_stat_arb, etc.) as they ship.

import { STRATEGIES } from './_strategies/index.mjs';

// Strategies any paying customer can use
const CUSTOMER_STRATEGIES = ['trend_follow', 'mean_revert', 'breakout'];

// Tier-0-only strategies (Phase 3 will append: momentum_rs, pairs_stat_arb, regime_aware_ensemble, crypto_grid)
const TIER_ZERO_ADDITIONAL = [];

export function strategiesFor(tier) {
  const base = CUSTOMER_STRATEGIES.filter(s => Boolean(STRATEGIES[s]));
  if (tier === 'tier_zero') {
    const extra = TIER_ZERO_ADDITIONAL.filter(s => Boolean(STRATEGIES[s]));
    return [...new Set([...base, ...extra])];
  }
  return base;
}

export function canUseStrategy(tier, strategySlug) {
  return strategiesFor(tier).includes(strategySlug);
}

// King's allowlist for auto-promotion to tier_zero on Alpaca connect.
// Override via EDGE_KING_EMAILS env var (comma-separated).
const KING_EMAILS = (process.env.EDGE_KING_EMAILS ||
  'ldavid226@gmail.com,king@crownmediagroup.co,david@crownmediagroup.co'
).split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export function isKingEmail(email = '') {
  return KING_EMAILS.includes(String(email).toLowerCase().trim());
}

/**
 * Determine the effective tier for a connection.
 * King's allowlisted emails → tier_zero (regardless of paper/live mode).
 * Everyone else → paper or live based on mode.
 */
export function tierFor(email, mode) {
  if (isKingEmail(email)) return 'tier_zero';
  return mode === 'live' ? 'live' : 'paper';
}
