// tools/kingdom-reach/lead-score.js
// GAUGE (Agent 43) — Lead scoring + ICP fit.
// Compute on every CRM record. Sorts the send queue so A-tier gets the best treatment.
// Tier A (95+) → full multi-channel + Loom + manual.
// Tier B (60-94) → email + LinkedIn auto.
// Tier C (<60) → email only.

import { appendEvent } from './archive.js';
import { emit } from './herald.js';

// ── Scoring rubric ───────────────────────────────────────────────────────────
const ORG_TYPE_WEIGHTS = {
  church: 100, school: 90, missions: 90, nonprofit: 85, recovery: 80,
  network: 75, media: 75, youth: 75, prison: 75, men: 70, women: 70,
  mixed: 65, business: 60,
};

const COLUMBIA_AREA_CITIES = new Set([
  'columbia','west columbia','cayce','irmo','lexington','blythewood','elgin',
  'forest acres','arcadia lakes','dentsville','seven oaks','red bank','gilbert',
  'chapin','hopkins','eastover','gadsden','batesburg','batesburg-leesville'
]);

const SC_NEAR_CITIES = new Set([
  'orangeburg','sumter','camden','aiken','newberry','florence','rock hill',
  'spartanburg','greenville','charleston','myrtle beach','beaufort','greenwood'
]);

/**
 * Compute a 0-100 lead score for one church row.
 */
export function computeLeadScore(church) {
  let score = 0;
  const breakdown = [];

  // Org type baseline (60-100)
  const ot = (church.org_type || 'church').toLowerCase();
  const otWeight = ORG_TYPE_WEIGHTS[ot] ?? 60;
  score += otWeight * 0.45;  // org type = 45% of score
  breakdown.push(`org_type(${ot})=+${(otWeight * 0.45).toFixed(0)}`);

  // Has website (+10)
  if (church.has_website || church.website) {
    score += 10;
    breakdown.push('website=+10');
  } else {
    score += 5;  // no-website is actually opportunity for our service
    breakdown.push('no_website_opportunity=+5');
  }

  // Has pastor name (personalization possible) (+8)
  if (church.pastor && String(church.pastor).trim()) {
    score += 8;
    breakdown.push('pastor=+8');
  }

  // Has phone (multi-channel possible) (+5)
  if (church.phone) {
    score += 5;
    breakdown.push('phone=+5');
  }

  // Geo proximity to Columbia
  const city = String(church.city || church.address || '').toLowerCase();
  let geoBoost = 0;
  for (const c of COLUMBIA_AREA_CITIES) { if (city.includes(c)) { geoBoost = 15; break; } }
  if (geoBoost === 0) { for (const c of SC_NEAR_CITIES) { if (city.includes(c)) { geoBoost = 8; break; } } }
  if (geoBoost === 0 && city.includes('sc')) geoBoost = 3;  // any SC city
  if (geoBoost > 0) { score += geoBoost; breakdown.push(`geo=+${geoBoost}`); }

  // Engagement signals from prior outreach (open without reply is positive intent)
  if (church.email_opened) { score += 8; breakdown.push('opened=+8'); }
  if (church.replied) {
    // If replied not_interested already, downscore. Else big boost.
    const notes = String(church.notes || '').toLowerCase();
    if (notes.includes('not interested') || notes.includes('not_interested')) {
      score -= 30; breakdown.push('not_interested=-30');
    } else {
      score += 25; breakdown.push('replied=+25');
    }
  }

  // Penalties
  if (church.email_bounced) { score -= 40; breakdown.push('bounced=-40'); }
  if (church.unsubscribed) { score -= 100; breakdown.push('unsubscribed=-100'); }
  const status = String(church.status || '').toLowerCase();
  if (status.includes('not interested')) { score -= 30; breakdown.push('not_interested_status=-30'); }

  // Bonus for existing pipeline value
  if (church.pipeline_value && church.pipeline_value > 0) {
    score += Math.min(10, church.pipeline_value / 100);
    breakdown.push(`pipeline=+${Math.min(10, church.pipeline_value / 100).toFixed(0)}`);
  }

  // Clamp 0-100
  const final = Math.max(0, Math.min(100, Math.round(score)));
  const tier = final >= 80 ? 'A' : final >= 55 ? 'B' : 'C';
  return { score: final, tier, breakdown };
}

/**
 * Score all CRM records. Updates lead_score column + tier in churches table.
 * Usage: SEED_TOKEN=... node tools/kingdom-reach/lead-score.js
 *
 * When called as a module via runScoring(db), runs in-process.
 */
export async function runScoring(db) {
  const churches = db.prepare('SELECT * FROM churches').all();
  let updated = 0;
  let tierCounts = { A: 0, B: 0, C: 0 };

  const updateStmt = db.prepare('UPDATE churches SET lead_score = ?, lead_score_at = datetime("now") WHERE id = ?');

  for (const c of churches) {
    const { score, tier } = computeLeadScore(c);
    updateStmt.run(score, c.id);
    tierCounts[tier]++;
    updated++;
  }

  // Archive event
  appendEvent({
    agent: 'GAUGE',
    entity_type: 'system',
    entity_id: 'scoring_run',
    action: 'compute',
    fields: { records_scored: updated, tier_a: tierCounts.A, tier_b: tierCounts.B, tier_c: tierCounts.C },
    source: 'lead-score.js runScoring',
  });

  // Herald P1
  emit({
    agent: 'GAUGE',
    severity: 'P1',
    action: `Scored ${updated} CRM records`,
    detail: `Tier A: ${tierCounts.A}, Tier B: ${tierCounts.B}, Tier C: ${tierCounts.C}`,
    next: 'A-tier records get full multi-channel sequence on next fire',
  });

  return { updated, tierCounts };
}

// ── HTTP version — uses live CRM API instead of local DB ─────────────────────
export async function runScoringViaAPI({ crmUrl, token }) {
  const res = await fetch(`${crmUrl}/api/kingdom-reach/churches?token=${token}`);
  const data = await res.json();
  const churches = data.churches || [];
  let updated = 0;
  const tierCounts = { A: 0, B: 0, C: 0 };

  for (const c of churches) {
    const { score, tier } = computeLeadScore(c);
    tierCounts[tier]++;
    const patchRes = await fetch(`${crmUrl}/api/kingdom-reach/churches/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, lead_score: score }),
    });
    if (patchRes.ok) updated++;
  }

  appendEvent({
    agent: 'GAUGE',
    entity_type: 'system',
    entity_id: 'scoring_run',
    action: 'compute_via_api',
    fields: { records_scored: updated, tier_a: tierCounts.A, tier_b: tierCounts.B, tier_c: tierCounts.C },
    source: 'lead-score.js runScoringViaAPI',
  });

  emit({
    agent: 'GAUGE',
    severity: 'P1',
    action: `Scored ${updated} CRM records via live API`,
    detail: `Tier A: ${tierCounts.A}, Tier B: ${tierCounts.B}, Tier C: ${tierCounts.C}`,
    next: 'A-tier records get priority on next send batch',
  });

  return { updated, tierCounts };
}

// CLI usage
const argv1 = process.argv[1] || '';
if (argv1 && import.meta.url === `file://${argv1.replace(/\\/g, '/')}`) {
  const crmUrl = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
  const token = process.env.SEED_TOKEN;
  if (!token) { console.error('SEED_TOKEN env var not set'); process.exit(1); }
  console.log(`GAUGE — scoring all CRM records via ${crmUrl}`);
  const result = await runScoringViaAPI({ crmUrl, token });
  console.log(`Done. Updated: ${result.updated}`);
  console.log(`Tier A: ${result.tierCounts.A}, Tier B: ${result.tierCounts.B}, Tier C: ${result.tierCounts.C}`);
}
