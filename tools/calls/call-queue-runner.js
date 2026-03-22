/**
 * call-queue-runner.js — Pulls leads from Supabase, fires calls automatically
 * Crown Media Group | Nightly outbound call engine
 *
 * Usage:  node tools/calls/call-queue-runner.js
 * Or via n8n webhook / Task Scheduler
 *
 * Rate limit: 10 calls/hour, never calls same number twice in 24hrs
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');
const { makeCall }     = require('./call-agent');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CALLS_PER_HOUR  = 10;
const CALL_DELAY_MS   = Math.floor((60 * 60 * 1000) / CALLS_PER_HOUR); // 6 min between calls
const RETRY_AFTER_HRS = 24;
const RETRY_STATUSES  = ['NO_ANSWER', 'NO_RESPONSE', 'BUSY'];
const MAX_RETRIES     = 2;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function hoursAgo(hrs) {
  return new Date(Date.now() - hrs * 60 * 60 * 1000).toISOString();
}

async function getLeadQueue() {
  // New leads never called
  const { data: newLeads, error: e1 } = await supabase
    .from('leads')
    .select('id, phone, business_name, call_status, last_called_at, call_attempts')
    .is('call_status', null)
    .limit(50);

  if (e1) { console.error('Supabase error (new leads):', e1.message); return []; }

  // Retry-eligible leads (answered but no commitment, not called in 24hrs, under retry cap)
  const { data: retryLeads, error: e2 } = await supabase
    .from('leads')
    .select('id, phone, business_name, call_status, last_called_at, call_attempts')
    .in('call_status', RETRY_STATUSES)
    .lt('last_called_at', hoursAgo(RETRY_AFTER_HRS))
    .lt('call_attempts', MAX_RETRIES)
    .limit(20);

  if (e2) { console.error('Supabase error (retry leads):', e2.message); return newLeads || []; }

  return [...(newLeads || []), ...(retryLeads || [])];
}

async function incrementAttempt(leadId, currentAttempts) {
  await supabase
    .from('leads')
    .update({
      call_attempts: (currentAttempts || 0) + 1,
      last_called_at: new Date().toISOString()
    })
    .eq('id', leadId);
}

async function run() {
  console.log(`[QUEUE RUNNER] Starting — ${new Date().toLocaleString()}`);
  console.log(`[QUEUE RUNNER] Rate: ${CALLS_PER_HOUR} calls/hr | Delay: ${CALL_DELAY_MS / 1000}s between calls`);

  const leads = await getLeadQueue();

  if (leads.length === 0) {
    console.log('[QUEUE RUNNER] No leads to call. Done.');
    process.exit(0);
  }

  console.log(`[QUEUE RUNNER] ${leads.length} leads queued.`);

  let called = 0;

  for (const lead of leads) {
    const phone = lead.phone;
    if (!phone) {
      console.log(`[SKIP] Lead ${lead.id} — no phone number`);
      continue;
    }

    // Normalize phone to E.164
    const normalized = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`;
    if (normalized.length < 12) {
      console.log(`[SKIP] Lead ${lead.id} — invalid phone: ${phone}`);
      continue;
    }

    console.log(`[CALLING] ${lead.business_name || 'Unknown'} — ${normalized}`);

    try {
      await makeCall(normalized);
      await incrementAttempt(lead.id, lead.call_attempts);
      called++;
      console.log(`[CALLED] ${called}/${leads.length} — waiting ${CALL_DELAY_MS / 1000}s...`);
      await sleep(CALL_DELAY_MS);
    } catch (e) {
      console.error(`[ERROR] Failed to call ${normalized}: ${e.message}`);
    }
  }

  console.log(`[QUEUE RUNNER] Done. ${called} calls placed.`);
  process.exit(0);
}

run();
