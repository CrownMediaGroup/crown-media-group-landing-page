// tools/kingdom-reach/herald.js
// HERALD (Agent 46) — Master Debriefer.
// Writes severity-tagged events to a rolling buffer + P0 alerts file.
// King's `cat agency/ops/kingdom/herald-buffer.jsonl` shows the live narrative.

import { appendFileSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUFFER_PATH = resolve(__dirname, '..', '..', 'Agency', 'ops', 'kingdom', 'herald-buffer.jsonl');
const ALERTS_PATH = resolve(__dirname, '..', '..', 'Agency', 'ops', 'kingdom', 'herald-alerts.jsonl');

function ensureDir() {
  const dir = dirname(BUFFER_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Emit an update from any agent.
 * @param {object} input - {
 *   agent: string,             // WORDSMITH, FALCON, etc — required
 *   severity: 'P0' | 'P1' | 'P2' | 'P3',  // required
 *   action: string,            // 1-line description of what just happened
 *   detail?: string,           // optional longer context
 *   data?: object,             // optional structured payload
 *   next?: string,             // optional: what fires next as a result
 * }
 */
export function emit({ agent, severity = 'P3', action, detail, data, next }) {
  ensureDir();
  const event = {
    ts: new Date().toISOString(),
    agent,
    severity,
    action,
    detail,
    data,
    next,
  };
  appendFileSync(BUFFER_PATH, JSON.stringify(event) + '\n', 'utf8');

  // P0 also writes to alerts file (King checks this for interrupts)
  if (severity === 'P0') {
    appendFileSync(ALERTS_PATH, JSON.stringify(event) + '\n', 'utf8');
  }

  // P0/P1 also stdout in MEDIUM format for live sessions
  if (severity === 'P0' || severity === 'P1') {
    const prefix = severity === 'P0' ? '🔔 ' : '';
    const line = `${prefix}[${event.ts.slice(11, 19)}] [${severity}] ${agent} → ${action}`;
    process.stdout.write(line + '\n');
    if (next) process.stdout.write(`         next: ${next}\n`);
  }

  return event;
}

/**
 * Read the latest N events for a MACRO debrief.
 */
export function recent(limit = 20) {
  if (!existsSync(BUFFER_PATH)) return [];
  const lines = readFileSync(BUFFER_PATH, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * Read all open P0 alerts (not yet acknowledged by King).
 */
export function activeAlerts() {
  if (!existsSync(ALERTS_PATH)) return [];
  return readFileSync(ALERTS_PATH, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * MACRO debrief — synthesize the last N events into a King-readable summary.
 */
export function macroDebrief(limit = 50) {
  const events = recent(limit);
  if (!events.length) return 'No events in buffer.';

  const by_agent = {};
  const by_severity = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const e of events) {
    by_agent[e.agent] = (by_agent[e.agent] || 0) + 1;
    by_severity[e.severity] = (by_severity[e.severity] || 0) + 1;
  }

  const p0 = events.filter(e => e.severity === 'P0');
  const p1 = events.filter(e => e.severity === 'P1');

  let out = `=== HERALD MACRO (last ${events.length}) ===\n`;
  out += `Severity: P0=${by_severity.P0} P1=${by_severity.P1} P2=${by_severity.P2} P3=${by_severity.P3}\n`;
  out += `Active agents: ${Object.entries(by_agent).map(([a, n]) => `${a}(${n})`).join(', ')}\n`;
  if (p0.length) {
    out += `\n🔔 P0 EVENTS:\n`;
    for (const e of p0) out += `  ${e.ts.slice(11, 19)} ${e.agent} → ${e.action}\n`;
  }
  if (p1.length) {
    out += `\nP1 EVENTS:\n`;
    for (const e of p1) out += `  ${e.ts.slice(11, 19)} ${e.agent} → ${e.action}\n`;
  }
  return out;
}
