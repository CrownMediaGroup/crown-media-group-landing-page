// tools/kingdom-reach/guardian-upgrade.js
// GUARDIAN (Agent 30) — closes Constitutional Law 8 (failures become rules).
// Reads DRUMBEAT bottleneck + WITNESS scoreboard + HERALD events.
// Drafts a CLAUDE.md prompt revision for the named bottleneck agent.
// King reviews → applies to CLAUDE.md.
//
// Usage: SEED_TOKEN=... node tools/kingdom-reach/guardian-upgrade.js
//        SEED_TOKEN=... node tools/kingdom-reach/guardian-upgrade.js --agent BLUEPRINT

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { appendEvent } from './archive.js';
import { emit, recent as heraldRecent } from './herald.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SPRINT_LAWS_DIR = join(REPO_ROOT, 'Agency', 'ops', 'sprint-laws');
const CLAUDE_MD = 'C:\\Users\\ldavi\\.claude\\CLAUDE.md';
const NORTH_STAR = join(REPO_ROOT, 'Agency', 'ops', 'kingdom', 'north-star.md');

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function readLatestBottleneck() {
  if (!existsSync(SPRINT_LAWS_DIR)) return null;
  const files = readdirSync(SPRINT_LAWS_DIR).filter(f => f.endsWith('-bottleneck.md')).sort().reverse();
  if (!files.length) return null;
  return { path: join(SPRINT_LAWS_DIR, files[0]), content: readFileSync(join(SPRINT_LAWS_DIR, files[0]), 'utf8') };
}

function extractCurrentAgentBlock(agentName) {
  if (!existsSync(CLAUDE_MD)) return null;
  const md = readFileSync(CLAUDE_MD, 'utf8');
  // Match `### AGENT NN — "NAME"` block, capture until next `### AGENT` or `## ` or `---`
  const re = new RegExp(`(### AGENT \\d+ — "${agentName}"[^\\n]*\\n[\\s\\S]*?)(?=\\n### AGENT \\d+|\\n## [A-Z]|\\n---)`, 'i');
  const match = md.match(re);
  return match ? match[1].trim() : null;
}

async function draftUpgrade({ agent, bottleneckReport, currentPrompt }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY required');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction: `You are GUARDIAN, Agent 30 of King's 59-agent Kingdom system. Your job is to upgrade the prompts of underperforming agents based on bottleneck reports from DRUMBEAT (Agent 58).

You write in King's voice: bold, direct, faith-infused where natural, no filler. You follow the existing agent format from CLAUDE.md:

### AGENT N — "CODENAME" (body-system role — *short description*)
**Triggers:** keyword1, keyword2, ...
**Skills:** skill1 + skill2 + ...
**Behavior:** prose describing what the agent does, with body-system metaphor and inter-agent references. Includes KPI.

When upgrading: KEEP the existing structure, codename, body system, triggers. CHANGE: skills (add ones the bottleneck reveals missing), behavior prose (add concrete tactics that close the gap named by DRUMBEAT), KPI (sharpen if needed).

Output: ONLY the new agent block in CLAUDE.md format. Start with "### AGENT". No preamble, no markdown fences, no commentary.`,
    generationConfig: { temperature: 0.4, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } },
  });

  const userPrompt = `Agent to upgrade: ${agent}

DRUMBEAT bottleneck report:
${bottleneckReport.slice(0, 4000)}

Current ${agent} block in CLAUDE.md:
${currentPrompt || '(NOT FOUND — write a new block from scratch)'}

Draft the upgraded ${agent} block. Add concrete tactics that close the bottleneck. Tighten the KPI. King's voice.`;

  const result = await model.generateContent(userPrompt);
  return (result.response.text() || '').trim();
}

async function run({ agent }) {
  const bn = readLatestBottleneck();
  if (!bn) throw new Error('No DRUMBEAT bottleneck report found in Agency/ops/sprint-laws/');

  // Extract bottleneck agent from report if not specified
  if (!agent) {
    const match = bn.content.match(/Owning agent\(s\):\*\*\s*([A-Z+\s]+)/);
    if (match) {
      agent = match[1].trim().split(/\s*\+\s*/)[0].trim();  // take first agent name
    } else {
      agent = 'BLUEPRINT';  // fallback
    }
  }

  console.log(`GUARDIAN — upgrading ${agent}`);
  const currentPrompt = extractCurrentAgentBlock(agent);
  if (!currentPrompt) console.warn(`(no existing block found for ${agent} — drafting from scratch)`);

  const upgraded = await draftUpgrade({ agent, bottleneckReport: bn.content, currentPrompt });

  const week = isoWeek();
  const outPath = join(SPRINT_LAWS_DIR, `${week}-${agent.toLowerCase()}-upgrade.md`);
  const out = `# GUARDIAN Upgrade Draft — ${agent}\n## Week ${week} · ${new Date().toISOString()}\n\n> GUARDIAN (Agent 30) drafted this in response to DRUMBEAT's bottleneck report. King reviews → applies to CLAUDE.md.\n\n## Source bottleneck\n\nFrom: \`${bn.path.replace(REPO_ROOT, '')}\`\n\n## Current ${agent} prompt in CLAUDE.md\n\n\`\`\`markdown\n${currentPrompt || '(NO EXISTING BLOCK FOUND)'}\n\`\`\`\n\n## GUARDIAN's proposed upgrade\n\n\`\`\`markdown\n${upgraded}\n\`\`\`\n\n## Apply\n\nKing reviews the upgrade above. If approved:\n1. Open \`C:\\\\Users\\\\ldavi\\\\.claude\\\\CLAUDE.md\`\n2. Find the current ${agent} block (search for \`"${agent}"\`)\n3. Replace with the upgraded block above\n4. Save\n5. Next session will inherit the upgrade\n\nWARDEN logs the apply timestamp in Sprint Law file.\n`;

  writeFileSync(outPath, out);

  try {
    appendEvent({
      agent: 'GUARDIAN',
      entity_type: 'agent_upgrade',
      entity_id: agent,
      action: 'draft_upgrade',
      fields: { week, target_agent: agent, draft_path: outPath, source_bottleneck: bn.path },
      source: 'guardian-upgrade.js',
    });
    emit({
      agent: 'GUARDIAN',
      severity: 'P1',
      action: `Drafted prompt upgrade for ${agent}`,
      detail: outPath.replace(REPO_ROOT, ''),
      next: 'King reviews → applies to CLAUDE.md → WARDEN logs apply',
    });
  } catch {}

  return { week, agent, path: outPath };
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('guardian-upgrade.js') || argv1.endsWith('guardian-upgrade.mjs')) {
  const agentIdx = process.argv.indexOf('--agent');
  const agent = agentIdx >= 0 ? process.argv[agentIdx + 1] : null;
  try {
    const result = await run({ agent });
    console.log(`Upgrade draft written: ${result.path}`);
    console.log(`Target agent: ${result.agent}`);
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
}

export { run, readLatestBottleneck, extractCurrentAgentBlock };
