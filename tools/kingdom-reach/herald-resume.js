// tools/kingdom-reach/herald-resume.js
// DD — HERALD session-resume bootstrap.
// Closes Constitutional Law 11 at session boundary.
//
// Generates markdown auto-debrief for next session start.
// Writes to Agency/ops/notes/SESSION-OPEN.md.
//
// Usage: SEED_TOKEN=... node tools/kingdom-reach/herald-resume.js

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { recent as heraldRecent, activeAlerts } from './herald.js';
import { stats as archiveStats } from './archive.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const OUT_PATH = join(REPO_ROOT, 'Agency', 'ops', 'notes', 'SESSION-OPEN.md');
const SPRINT_LAWS_DIR = join(REPO_ROOT, 'Agency', 'ops', 'sprint-laws');
const CRM_URL = 'https://crm.crownmediagroup.co';

function recentCommits(n = 8) {
  try {
    const log = execSync(`git log --oneline -${n}`, { cwd: REPO_ROOT }).toString().trim();
    return log.split('\n');
  } catch { return []; }
}

function latestSprintLaw() {
  if (!existsSync(SPRINT_LAWS_DIR)) return null;
  const files = readdirSync(SPRINT_LAWS_DIR).filter(f => f.endsWith('.md'));
  if (!files.length) return null;
  // Sort by mtime
  files.sort((a, b) => statSync(join(SPRINT_LAWS_DIR, b)).mtimeMs - statSync(join(SPRINT_LAWS_DIR, a)).mtimeMs);
  return files[0];
}

async function pullCRMSummary() {
  const token = process.env.SEED_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${token}`);
    if (!res.ok) return null;
    const data = await res.json();
    const c = data.churches || [];
    return {
      total: data.totals?.total || c.length,
      emailed: c.filter(x => x.email_sent).length,
      opened: c.filter(x => x.email_opened).length,
      replied: c.filter(x => x.replied).length,
      tierA: c.filter(x => (x.lead_score || 0) >= 80).length,
      tierA_with_email: c.filter(x => (x.lead_score || 0) >= 80 && x.email && x.email.trim()).length,
      tierA_unsent_with_email: c.filter(x => (x.lead_score || 0) >= 80 && x.email && x.email.trim() && !x.email_sent).length,
      breakup_sent: c.filter(x => x.breakup_sent).length,
    };
  } catch { return null; }
}

function pendingTouch2Date() {
  // Touch-2 unlocks 7 days after Touch-1 send. May 22 batch → 2026-05-29.
  const now = new Date();
  const target = new Date('2026-05-29T00:00:00Z');
  if (now < target) {
    const hrs = Math.ceil((target - now) / 3600000);
    return `2026-05-29 (in ${hrs}h)`;
  }
  return '2026-05-29 (UNLOCKED — fire script ready)';
}

async function main() {
  const heraldEvents = heraldRecent(50);
  const alerts = activeAlerts();
  const arch = archiveStats();
  const commits = recentCommits(8);
  const sprintLaw = latestSprintLaw();
  const crm = await pullCRMSummary();

  const lastEvent = heraldEvents[heraldEvents.length - 1];
  const eventBuckets = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const e of heraldEvents) eventBuckets[e.severity] = (eventBuckets[e.severity] || 0) + 1;

  const now = new Date();
  let md = `# SESSION-OPEN — auto-debrief\n`;
  md += `## Generated ${now.toISOString()} by HERALD (Agent 46)\n\n`;
  md += `> Read this first on session start. Per Constitutional Law 11 (Narrative Continuity).\n\n`;

  md += `---\n\n## TL;DR — where we left off\n\n`;
  if (lastEvent) {
    md += `**Last action:** ${lastEvent.ts.slice(11, 19)} · ${lastEvent.agent} → ${lastEvent.action}\n`;
    if (lastEvent.next) md += `**Was waiting on:** ${lastEvent.next}\n`;
    md += '\n';
  }
  if (alerts.length > 0) {
    md += `**🔔 P0 alerts open:** ${alerts.length}\n\n`;
    for (const a of alerts.slice(-3)) md += `- ${a.ts.slice(11, 19)} ${a.agent}: ${a.action}\n`;
    md += '\n';
  } else {
    md += `**P0 alerts:** none active\n\n`;
  }

  md += `---\n\n## CRM state\n\n`;
  if (crm) {
    md += `| Metric | Count |\n|---|---|\n`;
    md += `| Total records | ${crm.total} |\n`;
    md += `| Touch-1 sent | ${crm.emailed} |\n`;
    md += `| Opened | ${crm.opened} (${crm.emailed ? ((crm.opened/crm.emailed)*100).toFixed(1) : 0}%) |\n`;
    md += `| Replied | ${crm.replied} |\n`;
    md += `| Breakup sent | ${crm.breakup_sent} |\n`;
    md += `| Tier A | ${crm.tierA} (${crm.tierA_with_email} reachable, ${crm.tierA_unsent_with_email} unsent) |\n\n`;
  } else {
    md += `_CRM summary unavailable (no SEED_TOKEN)._\n\n`;
  }

  md += `---\n\n## Recent activity\n\n`;
  md += `**HERALD buffer (last 50 events):** P0=${eventBuckets.P0} P1=${eventBuckets.P1} P2=${eventBuckets.P2} P3=${eventBuckets.P3}\n\n`;
  md += `**ARCHIVE total events:** ${arch.total} canonical facts logged\n\n`;
  if (Object.keys(arch.by_agent || {}).length) {
    md += `**Active agents (by event count):** ${Object.entries(arch.by_agent).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([a,n])=>`${a}(${n})`).join(', ')}\n\n`;
  }

  md += `---\n\n## Recent commits\n\n\`\`\`\n${commits.join('\n')}\n\`\`\`\n\n`;

  if (sprintLaw) {
    md += `---\n\n## Latest Sprint Law / Bottleneck\n\n`;
    md += `File: \`Agency/ops/sprint-laws/${sprintLaw}\`\n\n`;
    md += `(Open the file to read the binding rules + this week's bottleneck.)\n\n`;
  }

  md += `---\n\n## Next natural triggers\n\n`;
  md += `- **${pendingTouch2Date()}** — Touch-2 fire window. Run: \`source .env.kingdom-secrets && bash Agency/ops/outreach/fire-touch-2-2026-05-29.sh\`\n`;
  md += `- **Continuous** — RADAR sweeps Gmail every few hours: \`node tools/kingdom-reach/check-replies.mjs --since=YYYY-MM-DD\`\n`;
  md += `- **Sunday 11 PM** — DRUMBEAT weekly bottleneck (manual until Inngest): \`node tools/kingdom-reach/drumbeat.js\`\n`;
  md += `- **First paying client** — PILLAR onboarding fires automatically (watch mode pending): \`node tools/kingdom-reach/onboard.js watch\`\n\n`;

  md += `---\n\n## Pending King actions (parallel, not blocking)\n\n`;
  md += `- Friday Touch-2 fire (1 command)\n`;
  md += `- Sign up Cal.com / Inngest / Beehiiv (each ~3 min)\n`;
  md += `- Cloudflare DNS for reach.crownmediagroup.co (~15 min) — DNS verify script will auto-detect green\n`;
  md += `- Manual research 12 Tier-A no-email churches (~2-3 hrs)\n\n`;

  md += `---\n\n_Generated by tools/kingdom-reach/herald-resume.js · run \`node tools/kingdom-reach/herald-resume.js\` to refresh._\n`;

  // Write
  if (!existsSync(dirname(OUT_PATH))) mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, md);
  console.log(`Session-open written: ${OUT_PATH}`);
  return md;
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('herald-resume.js') || argv1.endsWith('herald-resume.mjs')) {
  await main();
}

export { main };
