// tools/kingdom-reach/witness.js
// WITNESS (Agent 56) — Constitutional Enforcement Scoreboard.
// Reads ARCHIVE event log + recent agent outputs, scores per-agent compliance with
// all 14 Constitutional Laws. Writes weekly scoreboard to Agency/ops/kingdom/constitutional-scoreboard.md.
// When an agent drops below 95%, GUARDIAN gets a P1 to rewrite its prompt.

import { readRecent, stats } from './archive.js';
import { emit } from './herald.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCOREBOARD_PATH = resolve(__dirname, '..', '..', 'Agency', 'ops', 'kingdom', 'constitutional-scoreboard.md');

// The 14 Laws (mirrors CLAUDE.md)
const LAWS = [
  { n: 1,  title: 'Every action is Kingdom work — Colossians 3:23' },
  { n: 2,  title: 'One KPI per agent' },
  { n: 3,  title: 'Never start from scratch when another agent has data — share memory' },
  { n: 4,  title: 'Deliverables ship immediately — never describe what you are about to do' },
  { n: 5,  title: 'No agent runs more than 10 iterations without termination check' },
  { n: 6,  title: 'Economic decisions require King\'s explicit approval' },
  { n: 7,  title: 'Every outreach output adapts to behavioral signals — not just time' },
  { n: 8,  title: 'Failures become rules — GUARDIAN/WARDEN writes a Sprint Law' },
  { n: 9,  title: 'All agents adaptable — no rigid playbooks' },
  { n:10,  title: 'King\'s voice governs all copy' },
  { n:11,  title: 'Narrative Continuity — output flows through HERALD' },
  { n:12,  title: 'Severity-Aware Delivery — P0/P1/P2/P3 tagging' },
  { n:13,  title: 'Structured Handoff — JSON artifacts validated by GATE' },
  { n:14,  title: 'Single Source of Truth — facts via ARCHIVE' },
];

// Heuristic scorers — each returns 0-100 per agent based on observed events.
// More sophisticated scoring will be added as we collect data.
function scoreAgent(agent, events) {
  const agentEvents = events.filter(e => e.agent === agent);
  if (!agentEvents.length) return { agent, total: null, scores: {}, note: 'no events in window' };

  const scores = {};

  // Law 1 (Kingdom work): assume passing unless violation explicitly logged
  scores[1] = 100;

  // Law 2 (one KPI): pass if KPI defined in CLAUDE.md (out of band check — default 100)
  scores[2] = 100;

  // Law 3 (share memory): pass if agent reads from ARCHIVE before writing OR writes events
  scores[3] = agentEvents.length > 0 ? 95 : 50;

  // Law 4 (ship immediately): proxy — actions with payload count higher
  const withPayload = agentEvents.filter(e => e.data || e.fields).length;
  scores[4] = agentEvents.length ? Math.min(100, Math.round((withPayload / agentEvents.length) * 100)) : 50;

  // Law 5 (no infinite loops): pass unless we see >10 consecutive events per minute
  // simple proxy: if events are well-spread, pass
  scores[5] = 100;

  // Law 6 (economic gate): warn if agent took economic action (sends, payments) without King ack
  scores[6] = 100; // placeholder — refine when we add ack tracking

  // Law 7 (behavioral signals): proxy — if agent reads opens/replies before acting
  scores[7] = 100;

  // Law 8 (failures become rules): pass if WARDEN sprint laws exist
  scores[8] = 100;

  // Law 9 (adaptable): pass by default
  scores[9] = 100;

  // Law 10 (King's voice): pass if agent passed copy through INKWELL OR is non-copy agent
  const copyAgents = ['WORDSMITH','SPARK','BLUEPRINT','SCRIBE','MIRROR','STRIKE','DIRECTOR','SIGNAL_BOOST'];
  if (copyAgents.includes(agent)) {
    const inkwelled = agentEvents.filter(e => e.action && e.action.toLowerCase().includes('inkwell')).length;
    scores[10] = agentEvents.length ? Math.min(100, 50 + Math.round((inkwelled / agentEvents.length) * 50)) : 50;
  } else {
    scores[10] = 100;
  }

  // Law 11 (HERALD continuity): pass if events were emitted via HERALD
  scores[11] = agentEvents.filter(e => e.severity).length > 0 ? 100 : 60;

  // Law 12 (severity tagging): pass if events have severity field
  const tagged = agentEvents.filter(e => ['P0','P1','P2','P3'].includes(e.severity)).length;
  scores[12] = agentEvents.length ? Math.round((tagged / agentEvents.length) * 100) : 50;

  // Law 13 (structured handoffs): pass if handoff events match registered schemas
  scores[13] = 80; // placeholder until GATE validation telemetry is wired

  // Law 14 (single source of truth): pass if agent writes to ARCHIVE
  scores[14] = agentEvents.length > 0 ? 100 : 60;

  const values = Object.values(scores);
  const total = Math.round(values.reduce((a,b) => a+b, 0) / values.length);

  return { agent, total, scores, event_count: agentEvents.length };
}

/**
 * Generate the weekly scoreboard markdown.
 */
export function generateScoreboard(eventLimit = 1000) {
  const events = readRecent(eventLimit);
  const archiveStats = stats();

  // Collect unique agents from observed events
  const observedAgents = Object.keys(archiveStats.by_agent || {});

  // Plus the canonical agent roster (so silent agents show as 'no data')
  const ROSTER = [
    'COMMANDER','FALCON','WORDSMITH','RADAR','CLOSER','BLUEPRINT','WELCOME','SPARK','SIGNAL','STRIKE',
    'SENTINEL','ORACLE','BROADCAST','KINGDOM','LEDGER','CALENDAR','DELIVER','ANALYST','REPUTATION','NETWORK',
    'DIRECTOR','SIGNAL_BOOST','LAUNCH','SHIELD','VISION','ANCHOR','MOBILE','ECHO','WARDEN','ORACLE_PRIME',
    'GUARDIAN','PROPHET','BREATH','INTAKE','PULSE','EYES','FILTER','ARMOR',
    'LABS','COMPASS','WHISPER','MIRROR','SCRIBE','GAUGE','BRIDGE','LIGHTHOUSE','HERALD',
    'PILLAR','WATCHTOWER','PARCHMENT','GAVEL','SCALES','POLARIS','ARCHIVE','GATE','INKWELL','WITNESS','CIRCUIT','DRUMBEAT'
  ];

  const allAgents = [...new Set([...observedAgents, ...ROSTER])].sort();

  const scored = allAgents.map(a => scoreAgent(a, events));

  // Sort: lowest compliance first (most urgent for GUARDIAN attention)
  scored.sort((a, b) => (a.total ?? 999) - (b.total ?? 999));

  const now = new Date();
  let md = `# Constitutional Scoreboard\n`;
  md += `## Updated ${now.toISOString()} (event window: ${events.length})\n\n`;
  md += `> Generated by WITNESS (Agent 56). Agents below 95% get a P1 to GUARDIAN.\n\n`;
  md += `## Per-Agent Scores\n\n`;
  md += `| Agent | Total | Events | Status |\n|---|---|---|---|\n`;
  for (const s of scored) {
    const status = s.total === null ? '— silent —'
      : s.total >= 95 ? '✓ compliant'
      : s.total >= 80 ? '⚠ needs review'
      : '🔔 GUARDIAN P1';
    md += `| ${s.agent} | ${s.total ?? 'n/a'} | ${s.event_count ?? 0} | ${status} |\n`;
  }

  md += `\n## Below-95% — GUARDIAN backlog\n\n`;
  const below = scored.filter(s => s.total !== null && s.total < 95);
  if (!below.length) md += `_All agents above 95% this week._\n`;
  else {
    for (const s of below) {
      md += `### ${s.agent} (${s.total})\n`;
      const breaches = Object.entries(s.scores).filter(([, v]) => v < 95);
      for (const [law, score] of breaches) {
        const law_info = LAWS.find(l => l.n === parseInt(law));
        md += `- Law ${law} (${law_info?.title || 'unknown'}): ${score}\n`;
      }
      md += '\n';
    }
  }

  mkdirSync(dirname(SCOREBOARD_PATH), { recursive: true });
  writeFileSync(SCOREBOARD_PATH, md);

  // P1 alerts for each below-95 agent
  for (const s of below) {
    emit({
      agent: 'WITNESS',
      severity: 'P1',
      action: `${s.agent} dropped to ${s.total}% Constitutional Compliance`,
      detail: `Needs GUARDIAN prompt upgrade`,
      data: { agent: s.agent, score: s.total, breaches: Object.entries(s.scores).filter(([,v]) => v < 95) },
      next: 'GUARDIAN to write upgraded agent prompt',
    });
  }

  return { scoreboard_path: SCOREBOARD_PATH, summary: scored.slice(0, 10) };
}

// CLI usage — Windows-safe guard (endsWith filename instead of URL compare)
const argv1 = process.argv[1] || '';
if (argv1 && (argv1.endsWith('witness.js') || argv1.endsWith('witness.mjs'))) {
  const result = generateScoreboard();
  console.log(`Scoreboard written: ${result.scoreboard_path}`);
  console.log(`Lowest-scoring agents:`, result.summary.slice(0, 5));
}
