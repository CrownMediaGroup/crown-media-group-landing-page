// tools/kingdom-reach/archive-backfill.js
// EE — Retroactively populate ARCHIVE event log from existing CRM state.
// Gives WITNESS scoreboard + DRUMBEAT bottleneck identifier real historical data.
//
// Idempotent — uses synthetic entity_ids based on church_id + state column.
//
// Usage: SEED_TOKEN=... node tools/kingdom-reach/archive-backfill.js
//        SEED_TOKEN=... node tools/kingdom-reach/archive-backfill.js --dry-run

import { appendEvent, readRecent } from './archive.js';
import { emit } from './herald.js';

const CRM_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN = process.env.SEED_TOKEN;
const DRY_RUN = process.argv.includes('--dry-run');

function safeTs(input, fallbackOffsetDays = 0) {
  if (!input) return new Date(Date.now() - fallbackOffsetDays * 86400000).toISOString();
  try {
    const d = new Date(input);
    if (isNaN(d.getTime())) throw new Error('bad date');
    return d.toISOString();
  } catch {
    return new Date(Date.now() - fallbackOffsetDays * 86400000).toISOString();
  }
}

async function main() {
  if (!TOKEN) { console.error('SEED_TOKEN required'); process.exit(1); }

  console.log('ARCHIVE retroactive backfill');
  console.log('============================');
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  console.log('');

  // Build set of already-archived (agent + entity_type + entity_id + action) for idempotency
  const existing = new Set();
  const recent = readRecent(50000);  // big buffer
  for (const e of recent) {
    existing.add(`${e.agent}|${e.entity_type}|${e.entity_id}|${e.action}`);
  }
  console.log(`Already in ARCHIVE: ${recent.length} events`);
  console.log('');

  const res = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${TOKEN}`);
  const data = await res.json();
  const churches = data.churches || [];
  console.log(`CRM records to walk: ${churches.length}`);
  console.log('');

  const written = { INTAKE: 0, WORDSMITH: 0, RADAR: 0, FILTER: 0, GAUGE: 0, ARMOR: 0, total: 0 };

  for (const c of churches) {
    // 1. INTAKE event — record created
    const intakeKey = `INTAKE|church|${c.id}|create`;
    if (!existing.has(intakeKey)) {
      if (!DRY_RUN) appendEvent({
        agent: 'INTAKE', entity_type: 'church', entity_id: c.id, action: 'create',
        fields: { name: c.name, org_type: c.org_type || 'church', city: c.city || '', has_website: !!c.has_website, email: c.email || null },
        source: 'archive-backfill.js',
      });
      written.INTAKE++; written.total++;
      existing.add(intakeKey);
    }

    // 2. WORDSMITH email_sent
    if (c.email_sent) {
      const sentKey = `WORDSMITH|church|${c.id}|email_sent`;
      if (!existing.has(sentKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'WORDSMITH', entity_type: 'church', entity_id: c.id, action: 'email_sent',
          fields: { template: 'pitch_pdf', sent_at: safeTs(c.email_sent_at) },
          source: 'archive-backfill.js',
        });
        written.WORDSMITH++; written.total++;
        existing.add(sentKey);
      }
    }

    // 3. WORDSMITH email_opened (tracking pixel)
    if (c.email_opened) {
      const openKey = `WORDSMITH|church|${c.id}|email_opened`;
      if (!existing.has(openKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'WORDSMITH', entity_type: 'church', entity_id: c.id, action: 'email_opened',
          fields: { opened_at: safeTs(c.email_opened_at) },
          source: 'archive-backfill.js',
        });
        written.WORDSMITH++; written.total++;
        existing.add(openKey);
      }
    }

    // 4. RADAR reply detected
    if (c.replied) {
      const replyKey = `RADAR|church|${c.id}|replied`;
      if (!existing.has(replyKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'RADAR', entity_type: 'church', entity_id: c.id, action: 'replied',
          fields: { status: c.status || null, replied_at: safeTs(c.replied_at), notes: (c.notes || '').slice(0, 200) },
          source: 'archive-backfill.js',
        });
        written.RADAR++; written.total++;
        existing.add(replyKey);
      }
    }

    // 5. FILTER bounce / unsubscribe
    if (c.email_bounced) {
      const bounceKey = `FILTER|church|${c.id}|email_bounced`;
      if (!existing.has(bounceKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'FILTER', entity_type: 'church', entity_id: c.id, action: 'email_bounced',
          fields: { bounced_at: safeTs(c.email_bounced_at) },
          source: 'archive-backfill.js',
        });
        written.FILTER++; written.total++;
        existing.add(bounceKey);
      }
    }
    if (c.unsubscribed) {
      const unsubKey = `FILTER|church|${c.id}|unsubscribed`;
      if (!existing.has(unsubKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'FILTER', entity_type: 'church', entity_id: c.id, action: 'unsubscribed',
          fields: { unsubscribed_at: safeTs(c.unsubscribed_at) },
          source: 'archive-backfill.js',
        });
        written.FILTER++; written.total++;
        existing.add(unsubKey);
      }
    }

    // 6. GAUGE scoring
    if (c.lead_score && c.lead_score > 0) {
      const scoreKey = `GAUGE|church|${c.id}|score`;
      if (!existing.has(scoreKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'GAUGE', entity_type: 'church', entity_id: c.id, action: 'score',
          fields: { lead_score: c.lead_score, tier: c.lead_score >= 80 ? 'A' : c.lead_score >= 55 ? 'B' : 'C', scored_at: safeTs(c.lead_score_at) },
          source: 'archive-backfill.js',
        });
        written.GAUGE++; written.total++;
        existing.add(scoreKey);
      }
    }

    // 7. Touch-2 follow_up_sent
    if (c.follow_up_sent) {
      const fuKey = `WORDSMITH|church|${c.id}|follow_up_sent`;
      if (!existing.has(fuKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'WORDSMITH', entity_type: 'church', entity_id: c.id, action: 'follow_up_sent',
          fields: { template: c.email_opened ? 'follow_up_opener' : 'follow_up_cold', sent_at: safeTs(c.follow_up_sent_at) },
          source: 'archive-backfill.js',
        });
        written.WORDSMITH++; written.total++;
        existing.add(fuKey);
      }
    }

    // 8. Touch-3 breakup_sent
    if (c.breakup_sent) {
      const bkKey = `WORDSMITH|church|${c.id}|breakup_sent`;
      if (!existing.has(bkKey)) {
        if (!DRY_RUN) appendEvent({
          agent: 'WORDSMITH', entity_type: 'church', entity_id: c.id, action: 'breakup_sent',
          fields: { template: 'breakup_warm', sent_at: safeTs(c.breakup_sent_at) },
          source: 'archive-backfill.js',
        });
        written.WORDSMITH++; written.total++;
        existing.add(bkKey);
      }
    }
  }

  console.log('Backfill summary:');
  console.log(`  INTAKE (record created):       ${written.INTAKE}`);
  console.log(`  WORDSMITH (sends + opens):     ${written.WORDSMITH}`);
  console.log(`  RADAR (replies):               ${written.RADAR}`);
  console.log(`  FILTER (bounces + unsubs):     ${written.FILTER}`);
  console.log(`  GAUGE (lead scores):           ${written.GAUGE}`);
  console.log(`  TOTAL events written:          ${written.total}`);
  console.log('');

  try {
    emit({
      agent: 'ARCHIVE',
      severity: 'P1',
      action: `Backfilled ${written.total} retroactive events`,
      detail: `INTAKE:${written.INTAKE} WORDSMITH:${written.WORDSMITH} RADAR:${written.RADAR} FILTER:${written.FILTER} GAUGE:${written.GAUGE}`,
      next: DRY_RUN ? '(DRY-RUN — re-run without --dry-run to write)' : 'WITNESS + DRUMBEAT now have real historical baseline',
    });
  } catch {}

  return { written };
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('archive-backfill.js') || argv1.endsWith('archive-backfill.mjs')) {
  try { await main(); } catch (e) { console.error('FAILED:', e.message); process.exit(1); }
}
