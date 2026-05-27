// tools/kingdom-reach/archive.js
// ARCHIVE (Agent 53) — Single Source of Truth memory keeper.
// Append-only event log at Agency/ops/kingdom/archive.jsonl.
// Every CRM-touching agent action writes here. Every read references the latest.
//
// Constitutional Law 14: every fact about a shared entity has ONE canonical writer
// and is read by all others via ARCHIVE. Fixes Cognition's #1 multi-agent failure mode
// (context fragmentation).

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_PATH = resolve(__dirname, '..', '..', 'Agency', 'ops', 'kingdom', 'archive.jsonl');

function ensureDir() {
  const dir = dirname(ARCHIVE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Append an event to the canonical log.
 * @param {object} event - {
 *   agent: 'WORDSMITH' | 'FALCON' | ...,    // which agent wrote it
 *   entity_type: 'church' | 'client' | 'campaign' | 'reply' | 'send' | ...,
 *   entity_id: <id>,                        // canonical id (CRM id, send_id, etc)
 *   action: 'create' | 'update' | 'classify' | 'archive' | ...,
 *   fields: { ... },                        // what changed
 *   source: 'optional context/citation',
 * }
 */
export function appendEvent(event) {
  ensureDir();
  const enriched = {
    ts: new Date().toISOString(),
    ...event,
  };
  appendFileSync(ARCHIVE_PATH, JSON.stringify(enriched) + '\n', 'utf8');
  return enriched;
}

/**
 * Read all events about a single entity. Latest-wins per field for state reconstruction.
 */
export function readEntityState(entity_type, entity_id) {
  if (!existsSync(ARCHIVE_PATH)) return null;
  const lines = readFileSync(ARCHIVE_PATH, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.entity_type === entity_type && String(e.entity_id) === String(entity_id)) {
        events.push(e);
      }
    } catch { /* skip malformed */ }
  }
  if (!events.length) return null;
  // Latest-wins reconstruction
  const state = { entity_type, entity_id, history: events };
  for (const e of events) {
    if (e.fields) Object.assign(state, e.fields);
  }
  state.last_writer = events[events.length - 1].agent;
  state.last_updated = events[events.length - 1].ts;
  return state;
}

/**
 * Read recent events (default 100) for HERALD or debugging.
 */
export function readRecent(limit = 100) {
  if (!existsSync(ARCHIVE_PATH)) return [];
  const lines = readFileSync(ARCHIVE_PATH, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/**
 * Quick stats — how many events, by agent, by entity_type.
 */
export function stats() {
  if (!existsSync(ARCHIVE_PATH)) return { total: 0, by_agent: {}, by_entity_type: {} };
  const lines = readFileSync(ARCHIVE_PATH, 'utf8').split('\n').filter(Boolean);
  const out = { total: lines.length, by_agent: {}, by_entity_type: {} };
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      out.by_agent[e.agent] = (out.by_agent[e.agent] || 0) + 1;
      out.by_entity_type[e.entity_type] = (out.by_entity_type[e.entity_type] || 0) + 1;
    } catch {}
  }
  return out;
}
