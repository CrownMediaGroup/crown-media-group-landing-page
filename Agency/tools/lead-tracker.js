/**
 * lead-tracker.js — CLI lead pipeline manager
 * Crown Media Group | Supabase + local cache fallback
 *
 * Usage:
 *   node Agency/tools/lead-tracker.js add "Business Name" --contact @handle --method dm
 *   node Agency/tools/lead-tracker.js list [--status new|contacted|call_booked|closed_won|closed_lost]
 *   node Agency/tools/lead-tracker.js update <id> --status contacted --notes "Left voicemail"
 *   node Agency/tools/lead-tracker.js followup     ← leads needing action today
 *   node Agency/tools/lead-tracker.js stats        ← pipeline summary
 *   node Agency/tools/lead-tracker.js view <id>    ← full lead details
 *
 * Statuses: new → contacted → call_booked → proposal_sent → closed_won | closed_lost
 *
 * Requires .env: SUPABASE_URL, SUPABASE_KEY
 * Fallback: Agency/ops/leads-cache.json (offline mode)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path = require('path');
const fs   = require('fs');

const CACHE_FILE = path.join(__dirname, '../ops/leads-cache.json');

// ── Supabase ─────────────────────────────────────────────────────────────────
let createClient;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch {
  ({ createClient } = require(
    path.join(__dirname, '../../tools/calls/node_modules/@supabase/supabase-js')
  ));
}

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
  : null;

// ── Cache (offline fallback) ──────────────────────────────────────────────────
function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
  }
  return [];
}

function saveCache(leads) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(leads, null, 2));
}

function nextId(leads) {
  if (!leads.length) return 1;
  return Math.max(...leads.map(l => l.id || 0)) + 1;
}

// ── Formatting ────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  new:           '\x1b[36m',  // cyan
  contacted:     '\x1b[33m',  // yellow
  call_booked:   '\x1b[35m',  // magenta
  proposal_sent: '\x1b[34m',  // blue
  closed_won:    '\x1b[32m',  // green
  closed_lost:   '\x1b[31m',  // red
};
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

function colorStatus(status) {
  return (STATUS_COLOR[status] || '') + status + RESET;
}

function pad(str, len) {
  const s = String(str || '');
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function printTable(leads) {
  if (!leads.length) { console.log('No leads found.'); return; }
  console.log('\n' + BOLD + pad('ID', 5) + pad('BUSINESS', 28) + pad('STATUS', 20) + pad('CONTACT', 22) + pad('METHOD', 12) + 'FOLLOW-UP' + RESET);
  console.log('─'.repeat(100));
  for (const l of leads) {
    const followup = l.follow_up_date ? l.follow_up_date.slice(0, 10) : '—';
    console.log(
      pad(l.id, 5) +
      pad(l.business_name || l.name || '?', 28) +
      pad(colorStatus(l.status), 28) +
      pad(l.contact || '—', 22) +
      pad(l.method || '—', 12) +
      followup
    );
  }
  console.log('');
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function dbAdd(lead) {
  if (!supabase) {
    const leads = loadCache();
    lead.id = nextId(leads);
    leads.push(lead);
    saveCache(leads);
    return { data: lead, offline: true };
  }
  const { data, error } = await supabase.from('leads').insert(lead).select().single();
  if (error) throw new Error(error.message);
  // Sync to cache
  const leads = loadCache();
  leads.push(data);
  saveCache(leads);
  return { data };
}

async function dbList(filters = {}) {
  if (!supabase) {
    let leads = loadCache();
    if (filters.status) leads = leads.filter(l => l.status === filters.status);
    return leads;
  }
  let q = supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (filters.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) {
    console.warn('[Supabase] Falling back to cache:', error.message);
    return loadCache();
  }
  saveCache(data);
  return data;
}

async function dbUpdate(id, updates) {
  updates.updated_at = new Date().toISOString();
  if (!supabase) {
    const leads = loadCache();
    const idx = leads.findIndex(l => l.id == id);
    if (idx === -1) throw new Error(`Lead ${id} not found`);
    leads[idx] = { ...leads[idx], ...updates };
    saveCache(leads);
    return leads[idx];
  }
  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  const leads = loadCache();
  const idx = leads.findIndex(l => l.id == id);
  if (idx !== -1) { leads[idx] = data; saveCache(leads); }
  return data;
}

async function dbGet(id) {
  if (!supabase) {
    const leads = loadCache();
    return leads.find(l => l.id == id) || null;
  }
  const { data, error } = await supabase.from('leads').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function cmdAdd(args, flags) {
  const businessName = args[0];
  if (!businessName) {
    console.error('ERROR: Provide business name — e.g. node lead-tracker.js add "Anointed Cuts"');
    process.exit(1);
  }

  const lead = {
    business_name:  businessName,
    contact:        flags['contact'] || null,
    method:         flags['method'] || 'dm',
    status:         'new',
    notes:          flags['notes'] || null,
    follow_up_date: flags['followup'] || null,
    source:         'manual',
    platform:       flags['platform'] || null,
    created_at:     new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  };

  const { data, offline } = await dbAdd(lead);
  console.log(`\n${offline ? '[OFFLINE] ' : ''}Lead added — ID: ${data.id}`);
  console.log(`  Business: ${data.business_name}`);
  console.log(`  Contact:  ${data.contact || '—'}`);
  console.log(`  Method:   ${data.method}`);
  console.log(`  Status:   ${colorStatus(data.status)}\n`);
}

async function cmdList(flags) {
  const leads = await dbList({ status: flags['status'] });
  printTable(leads);
  console.log(`Total: ${leads.length} lead${leads.length !== 1 ? 's' : ''}`);
}

async function cmdUpdate(args, flags) {
  const id = args[0];
  if (!id) { console.error('ERROR: Provide lead ID'); process.exit(1); }

  const updates = {};
  if (flags['status'])  updates.status = flags['status'];
  if (flags['notes'])   updates.notes  = flags['notes'];
  if (flags['followup']) updates.follow_up_date = flags['followup'];
  if (flags['contact']) updates.contact = flags['contact'];

  if (!Object.keys(updates).length) {
    console.error('ERROR: Provide at least --status, --notes, --followup, or --contact');
    process.exit(1);
  }

  const data = await dbUpdate(id, updates);
  console.log(`\nLead ${id} updated:`);
  for (const [k, v] of Object.entries(updates)) {
    console.log(`  ${k}: ${k === 'status' ? colorStatus(v) : v}`);
  }
  console.log('');
}

async function cmdFollowup() {
  const today = new Date().toISOString().slice(0, 10);
  const all = await dbList();
  const due = all.filter(l =>
    l.follow_up_date && l.follow_up_date.slice(0, 10) <= today &&
    l.status !== 'closed_won' && l.status !== 'closed_lost'
  );

  if (!due.length) {
    console.log('\nNo follow-ups due today.\n');
    return;
  }

  console.log(`\n${BOLD}FOLLOW-UPS DUE (${due.length})${RESET}`);
  printTable(due);
}

async function cmdStats() {
  const leads = await dbList();
  const statuses = ['new', 'contacted', 'call_booked', 'proposal_sent', 'closed_won', 'closed_lost'];
  const counts = {};
  for (const s of statuses) counts[s] = leads.filter(l => l.status === s).length;

  const total = leads.length;
  const won   = counts.closed_won;
  const conv  = total ? ((won / total) * 100).toFixed(1) : 0;

  console.log(`\n${BOLD}PIPELINE STATS${RESET}`);
  console.log('─'.repeat(40));
  for (const s of statuses) {
    const bar = '█'.repeat(counts[s]);
    console.log(`  ${pad(colorStatus(s), 28)} ${pad(counts[s], 4)} ${bar}`);
  }
  console.log('─'.repeat(40));
  console.log(`  ${BOLD}Total leads:${RESET}       ${total}`);
  console.log(`  ${BOLD}Closed won:${RESET}        ${won}`);
  console.log(`  ${BOLD}Conversion rate:${RESET}   ${conv}%\n`);
}

async function cmdView(args) {
  const id = args[0];
  if (!id) { console.error('ERROR: Provide lead ID'); process.exit(1); }

  const lead = await dbGet(id);
  if (!lead) { console.error(`Lead ${id} not found`); process.exit(1); }

  console.log(`\n${BOLD}LEAD #${lead.id}${RESET}`);
  console.log('─'.repeat(40));
  const fields = ['business_name', 'contact', 'method', 'status', 'platform', 'notes', 'follow_up_date', 'source', 'created_at', 'updated_at'];
  for (const f of fields) {
    if (lead[f]) {
      const label = f.replace(/_/g, ' ').padEnd(16);
      const val   = f === 'status' ? colorStatus(lead[f]) : lead[f];
      console.log(`  ${label}  ${val}`);
    }
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const cmd  = argv[0];
  const args = [];
  const flags = {};

  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      args.push(argv[i]);
    }
  }

  if (!cmd) {
    console.log('Usage: node lead-tracker.js <add|list|update|followup|stats|view> [options]');
    console.log('\nCommands:');
    console.log('  add "Business"  --contact @handle --method dm|in_person|referral|call');
    console.log('  list            --status <status>');
    console.log('  update <id>     --status <status> --notes "text" --followup YYYY-MM-DD');
    console.log('  followup        Show leads due for follow-up today');
    console.log('  stats           Pipeline summary with conversion rate');
    console.log('  view <id>       Full lead details');
    console.log('\nStatuses: new → contacted → call_booked → proposal_sent → closed_won | closed_lost');
    process.exit(0);
  }

  switch (cmd) {
    case 'add':      await cmdAdd(args, flags); break;
    case 'list':     await cmdList(flags); break;
    case 'update':   await cmdUpdate(args, flags); break;
    case 'followup': await cmdFollowup(); break;
    case 'stats':    await cmdStats(); break;
    case 'view':     await cmdView(args); break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
