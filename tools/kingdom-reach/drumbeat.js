// tools/kingdom-reach/drumbeat.js
// DRUMBEAT (Agent 58) — Theory-of-Constraints bottleneck identifier.
// Reads POLARIS north-star + funnel cohort metrics + recent HERALD events.
// Identifies THE single bottleneck agent for this week. Hands to GUARDIAN.
//
// Usage:
//   SEED_TOKEN=... node tools/kingdom-reach/drumbeat.js
//   SEED_TOKEN=... node tools/kingdom-reach/drumbeat.js --week 2026-W22  (specific ISO week)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { recent as heraldRecent } from './herald.js';
import { stats as archiveStats } from './archive.js';
import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SPRINT_LAWS_DIR = join(REPO_ROOT, 'Agency', 'ops', 'sprint-laws');
const CRM_URL = 'https://crm.crownmediagroup.co';

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Compute funnel conversion rates and identify the weakest stage.
 */
function identifyFunnelBottleneck(churches) {
  const sent    = churches.filter(c => c.email_sent).length;
  const opened  = churches.filter(c => c.email_opened).length;
  const replied = churches.filter(c => c.replied).length;
  const pitched = churches.filter(c => (c.status||'').match(/Pitched|Hot|Proposal/i)).length;
  const client  = churches.filter(c => (c.status||'').toLowerCase().includes('client')).length;

  const rates = {
    sent_to_open:    sent ? opened / sent : 0,
    open_to_reply:   opened ? replied / opened : 0,
    reply_to_pitch:  replied ? pitched / replied : 0,
    pitch_to_close:  pitched ? client / pitched : 0,
  };

  const benchmarks = {
    sent_to_open:    0.45,
    open_to_reply:   0.20,
    reply_to_pitch:  0.50,
    pitch_to_close:  0.30,
  };

  let weakest = null;
  let weakestGap = -Infinity;
  for (const [stage, rate] of Object.entries(rates)) {
    const gap = benchmarks[stage] - rate;
    if (gap > weakestGap) {
      weakestGap = gap;
      weakest = stage;
    }
  }

  const stageToAgent = {
    sent_to_open:   { agent: 'WORDSMITH', why: 'subject lines underperforming — open rate is the upstream signal' },
    open_to_reply:  { agent: 'WORDSMITH + INKWELL', why: 'body copy not earning reply — Self-Refine pass needed' },
    reply_to_pitch: { agent: 'CLOSER + RADAR', why: 'replies not being converted to pitch meetings — call prep + booking flow' },
    pitch_to_close: { agent: 'BLUEPRINT + CLOSER', why: 'proposal not landing — Grand Slam Offer revision or pricing audit' },
  };

  return {
    sent, opened, replied, pitched, client,
    rates, benchmarks,
    weakest_stage: weakest,
    weakest_gap: weakestGap,
    primary: stageToAgent[weakest] || { agent: 'unknown', why: 'no signal' },
  };
}

/**
 * Pull HERALD buffer for recent activity signal.
 */
function recentAgentActivity(limit = 200) {
  const events = heraldRecent(limit);
  const byAgent = {};
  for (const e of events) {
    byAgent[e.agent] = (byAgent[e.agent] || 0) + 1;
  }
  return byAgent;
}

/**
 * Run the bottleneck analysis and write the markdown report.
 */
export async function runDrumbeat(opts = {}) {
  const token = process.env.SEED_TOKEN;
  if (!token) throw new Error('SEED_TOKEN required');
  const week = opts.week || isoWeek();

  // Pull funnel state
  const res = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${token}`);
  const data = await res.json();
  const churches = data.churches || [];
  const tot = data.totals || {};

  const funnel = identifyFunnelBottleneck(churches);
  const agentActivity = recentAgentActivity(200);
  const arch = archiveStats();

  // Build markdown report
  const now = new Date();
  let md = `# DRUMBEAT — Bottleneck Identification\n`;
  md += `## Week ${week} · ${now.toISOString()}\n\n`;
  md += `> DRUMBEAT (Agent 58) · Theory of Constraints (Goldratt) · feeds GUARDIAN (Agent 30) for next upgrade cycle.\n\n`;

  md += `## North Star (POLARIS)\n\n`;
  md += `**Master metric:** paying clients per month\n`;
  md += `**Current:** ${funnel.client}\n`;
  md += `**2026-06-30 target:** 3\n`;
  md += `**Gap:** ${3 - funnel.client} clients\n\n`;

  md += `## Funnel state\n\n`;
  md += `| Stage | Count | Rate | Benchmark | Gap |\n|---|---|---|---|---|\n`;
  md += `| Sent | ${funnel.sent} | — | — | — |\n`;
  md += `| Opened | ${funnel.opened} | ${(funnel.rates.sent_to_open*100).toFixed(1)}% | ${(funnel.benchmarks.sent_to_open*100).toFixed(0)}% | ${((funnel.benchmarks.sent_to_open - funnel.rates.sent_to_open)*100).toFixed(1)} pts |\n`;
  md += `| Replied | ${funnel.replied} | ${(funnel.rates.open_to_reply*100).toFixed(1)}% | ${(funnel.benchmarks.open_to_reply*100).toFixed(0)}% | ${((funnel.benchmarks.open_to_reply - funnel.rates.open_to_reply)*100).toFixed(1)} pts |\n`;
  md += `| Pitched | ${funnel.pitched} | ${(funnel.rates.reply_to_pitch*100).toFixed(1)}% | ${(funnel.benchmarks.reply_to_pitch*100).toFixed(0)}% | ${((funnel.benchmarks.reply_to_pitch - funnel.rates.reply_to_pitch)*100).toFixed(1)} pts |\n`;
  md += `| Client | ${funnel.client} | ${(funnel.rates.pitch_to_close*100).toFixed(1)}% | ${(funnel.benchmarks.pitch_to_close*100).toFixed(0)}% | ${((funnel.benchmarks.pitch_to_close - funnel.rates.pitch_to_close)*100).toFixed(1)} pts |\n\n`;

  md += `## THE BOTTLENECK\n\n`;
  md += `**Stage:** ${funnel.weakest_stage}\n`;
  md += `**Gap:** ${(funnel.weakest_gap*100).toFixed(1)} percentage points below benchmark\n`;
  md += `**Owning agent(s):** ${funnel.primary.agent}\n`;
  md += `**Reason:** ${funnel.primary.why}\n\n`;
  md += `## DRUMBEAT recommendation\n\n`;
  md += `1. **GUARDIAN writes a prompt upgrade** for ${funnel.primary.agent} this week.\n`;
  md += `2. **Other agents step back from optimization.** Whatever DRUMBEAT names is the focus.\n`;
  md += `3. **WARDEN distills the unblock attempt into next Sprint Law** by end of week.\n`;
  md += `4. **POLARIS re-evaluates** the week after unblock — is the next stage now the bottleneck?\n\n`;

  md += `## Agent activity (last 200 HERALD events)\n\n`;
  const topAgents = Object.entries(agentActivity).sort((a,b) => b[1]-a[1]).slice(0, 12);
  md += `| Agent | Event count |\n|---|---|\n`;
  for (const [a, n] of topAgents) md += `| ${a} | ${n} |\n`;
  if (!topAgents.length) md += `| — | No events yet |\n`;
  md += `\n`;

  md += `## ARCHIVE state\n\n`;
  md += `Total canonical events: ${arch.total}\n\n`;

  md += `---\n\n_Generated by tools/kingdom-reach/drumbeat.js · next run on Sunday 11 PM (when Inngest is wired)._\n`;

  // Write to sprint-laws dir
  const outPath = join(SPRINT_LAWS_DIR, `${week}-bottleneck.md`);
  if (!existsSync(SPRINT_LAWS_DIR)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(SPRINT_LAWS_DIR, { recursive: true });
  }
  writeFileSync(outPath, md);

  // Archive + Herald
  appendEvent({
    agent: 'DRUMBEAT',
    entity_type: 'sprint',
    entity_id: week,
    action: 'identify_bottleneck',
    fields: {
      bottleneck_stage: funnel.weakest_stage,
      gap_pts: (funnel.weakest_gap*100).toFixed(1),
      primary_agent: funnel.primary.agent,
      client_count: funnel.client,
    },
    source: 'drumbeat.js',
  });

  emit({
    agent: 'DRUMBEAT',
    severity: 'P1',
    action: `Week ${week} bottleneck: ${funnel.weakest_stage} (${funnel.primary.agent})`,
    detail: `${funnel.primary.why} · gap ${(funnel.weakest_gap*100).toFixed(1)}pts vs benchmark`,
    next: 'GUARDIAN writes prompt upgrade for the bottleneck agent',
  });

  return { week, path: outPath, ...funnel };
}

// CLI
const argv1 = process.argv[1] || '';
if (argv1.endsWith('drumbeat.js') || argv1.endsWith('drumbeat.mjs')) {
  const weekIdx = process.argv.indexOf('--week');
  const week = weekIdx >= 0 ? process.argv[weekIdx + 1] : null;
  try {
    const result = await runDrumbeat({ week });
    console.log(`DRUMBEAT report written: ${result.path}`);
    console.log(`Bottleneck: ${result.weakest_stage} → ${result.primary.agent}`);
    console.log(`Client count: ${result.client} (target 3 by 2026-06-30)`);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
}
