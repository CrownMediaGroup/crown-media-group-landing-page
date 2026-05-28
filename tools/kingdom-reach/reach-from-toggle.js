// tools/kingdom-reach/reach-from-toggle.js
// Returns the correct FROM address for outbound CRM emails.
// Default: king@crownmediagroup.co (main domain — established reputation).
// If REACH_FROM_ADDRESS env var is set AND DNS verification passes:
//   returns the subdomain address (e.g., king@reach.crownmediagroup.co)
//   → preserves main domain reputation for transactional emails
//
// Used by send loop in tools/kingdom-reach/index.js. Existing scripts (send-pitch-emails.mjs)
// can also import this for the same toggle.

import { verifyDomain } from './dns-verify.js';

let cachedFrom = null;
let cachedExpiresAt = 0;

const DEFAULT_FROM = 'king@crownmediagroup.co';
const CACHE_TTL_MS = 5 * 60 * 1000;  // re-check every 5 min

/**
 * Get the FROM address. Memoized for 5 min.
 * @param {boolean} force - skip cache
 */
export async function getFromAddress(force = false) {
  const reachFrom = process.env.REACH_FROM_ADDRESS;
  if (!reachFrom) return DEFAULT_FROM;

  const now = Date.now();
  if (!force && cachedFrom && now < cachedExpiresAt) return cachedFrom;

  // Extract domain from REACH_FROM_ADDRESS
  const match = reachFrom.match(/@(.+)$/);
  if (!match) {
    cachedFrom = DEFAULT_FROM;
    cachedExpiresAt = now + CACHE_TTL_MS;
    return DEFAULT_FROM;
  }
  const domain = match[1].trim();

  try {
    const result = await verifyDomain(domain);
    if (result.overall === 'green') {
      cachedFrom = reachFrom;
    } else {
      console.warn(`[reach-from-toggle] DNS not green for ${domain} (${result.overall}) — falling back to ${DEFAULT_FROM}`);
      cachedFrom = DEFAULT_FROM;
    }
  } catch (e) {
    console.warn(`[reach-from-toggle] DNS check failed for ${domain}: ${e.message} — falling back to ${DEFAULT_FROM}`);
    cachedFrom = DEFAULT_FROM;
  }

  cachedExpiresAt = now + CACHE_TTL_MS;
  return cachedFrom;
}

/**
 * Synchronous getter — returns the cached value (or default if never checked).
 * For use in code paths where you can't await.
 */
export function getFromAddressSync() {
  return cachedFrom || DEFAULT_FROM;
}

/**
 * Force re-check on next getFromAddress call.
 */
export function clearCache() {
  cachedFrom = null;
  cachedExpiresAt = 0;
}

// CLI
const argv1 = process.argv[1] || '';
if (argv1.endsWith('reach-from-toggle.js') || argv1.endsWith('reach-from-toggle.mjs')) {
  const from = await getFromAddress(true);
  console.log(`Current FROM address: ${from}`);
  console.log(`REACH_FROM_ADDRESS env: ${process.env.REACH_FROM_ADDRESS || '(not set)'}`);
  console.log(`Default fallback:     ${DEFAULT_FROM}`);
}
