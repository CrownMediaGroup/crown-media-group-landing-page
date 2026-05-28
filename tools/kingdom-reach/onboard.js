// tools/kingdom-reach/onboard.js
// PILLAR (Agent 47) — fires when CRM record status flips to "Client" (Stripe charge confirmed).
// Generates personalized intake folder under Agency/clients/active/[name]/.
//
// Usage:
//   node tools/kingdom-reach/onboard.js [churchId]              # one-shot onboarding
//   node tools/kingdom-reach/onboard.js watch                   # poll CRM every 5 min
//   node tools/kingdom-reach/onboard.js handle-intake [orderId] # post-form-submit handler

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const TEMPLATE_DIR = join(REPO_ROOT, 'Agency', 'clients', '_onboarding-template');
const CLIENTS_DIR  = join(REPO_ROOT, 'Agency', 'clients', 'active');
const CRM_URL = 'https://crm.crownmediagroup.co';

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function fillVars(text, vars) {
  let out = String(text);
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  }
  return out;
}

async function fetchChurch(id, token) {
  const res = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${token}&limit=2000`);
  const data = await res.json();
  const c = (data.churches || []).find(x => String(x.id) === String(id));
  if (!c) throw new Error(`No CRM record id=${id}`);
  return c;
}

/**
 * Create a client folder with personalized onboarding docs.
 */
export async function onboardClient(church, opts = {}) {
  const tier = opts.tier || church.recommended_tier || 'starter';
  const orgType = (church.org_type || 'church').toLowerCase();
  const first = (church.pastor || '').split(' ')[0] || 'Friend';
  const slug = slugify(church.name);
  const clientDir = join(CLIENTS_DIR, slug);

  // 1. Create folder structure
  for (const sub of ['', 'assets', 'deliverables', 'communications', 'reviews']) {
    const full = join(clientDir, sub);
    if (!existsSync(full)) mkdirSync(full, { recursive: true });
  }

  // 2. Variables for template fill
  const vars = {
    first_name: first,
    name: church.name,
    org_type: orgType,
    tier,
    city: church.city || 'Columbia',
    email: church.email || '',
    onboarded_at: new Date().toISOString(),
    crm_id: church.id,
  };

  // 3. Copy + interpolate templates
  if (existsSync(TEMPLATE_DIR)) {
    for (const file of readdirSync(TEMPLATE_DIR)) {
      const src = join(TEMPLATE_DIR, file);
      const dst = join(clientDir, file);
      if (file.endsWith('.md')) {
        const content = fillVars(readFileSync(src, 'utf8'), vars);
        writeFileSync(dst, content);
      } else {
        copyFileSync(src, dst);
      }
    }
  }

  // 4. Initialize milestone-state.json
  const milestoneState = {
    crm_id: church.id,
    name: church.name,
    tier,
    onboarded_at: vars.onboarded_at,
    week: 1,
    completion_pct: 0,
    milestones: {
      week_1: { foundation_complete: false, first_deliverable_shipped: false },
      week_2: { rhythm_established: false, analytics_baseline: false },
      week_3: { mid_month_review: false, nps_pulse_sent: false },
      week_4: { performance_report: false, renewal_conversation_scheduled: false },
    },
    nps_log: [],
    next_check_in: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  };
  writeFileSync(join(clientDir, 'milestone-state.json'), JSON.stringify(milestoneState, null, 2));

  // 5. ARCHIVE event
  appendEvent({
    agent: 'PILLAR',
    entity_type: 'client',
    entity_id: church.id,
    action: 'onboard',
    fields: { name: church.name, tier, org_type: orgType, folder: clientDir },
    source: 'onboard.js',
  });

  // 6. HERALD P1
  emit({
    agent: 'PILLAR',
    severity: 'P1',
    action: `🎉 NEW CLIENT ONBOARDED — ${church.name}`,
    detail: `Tier: ${tier}. Folder: ${clientDir.replace(REPO_ROOT, '')}. Welcome email + intake form queued.`,
    next: 'WORDSMITH sends welcome email · WELCOME schedules Day-7 deliverable production',
  });

  return { ok: true, slug, folder: clientDir, milestoneState };
}

/**
 * Watch mode: poll CRM every 5 min for new clients.
 */
async function watchMode(token) {
  console.log('[PILLAR] Watch mode active. Polling CRM every 5 min for status=Client transitions.');
  const seen = new Set();
  while (true) {
    try {
      const res = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${token}`);
      const data = await res.json();
      const clients = (data.churches || []).filter(c => (c.status || '').toLowerCase().includes('client'));
      for (const c of clients) {
        const key = `${c.id}-${c.status}`;
        if (seen.has(key)) continue;
        // New client OR status change to Client
        const slug = slugify(c.name);
        const folder = join(CLIENTS_DIR, slug);
        if (existsSync(folder)) { seen.add(key); continue; }  // already onboarded
        console.log(`[PILLAR] New client detected: ${c.name} (id=${c.id})`);
        await onboardClient(c);
        seen.add(key);
      }
    } catch (e) {
      console.error('[PILLAR] poll error:', e.message);
    }
    await new Promise(r => setTimeout(r, 5 * 60 * 1000));
  }
}

// CLI usage — Windows-safe guard
const argv1 = process.argv[1] || '';
const isMain = argv1.endsWith('onboard.js') || argv1.endsWith('onboard.mjs');
if (isMain) {
  const TOKEN = process.env.SEED_TOKEN;
  if (!TOKEN) { console.error('SEED_TOKEN required'); process.exit(1); }
  const arg = process.argv[2];
  try {
    if (arg === 'watch') {
      await watchMode(TOKEN);
    } else if (arg === 'handle-intake') {
      // TODO: implement post-form-submit handler (triggers BLUEPRINT + WORDSMITH)
      console.log('[PILLAR] handle-intake mode — not yet implemented');
      process.exit(0);
    } else if (arg) {
      const church = await fetchChurch(arg, TOKEN);
      const result = await onboardClient(church);
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('Usage: node tools/kingdom-reach/onboard.js [churchId|watch|handle-intake]');
      process.exit(1);
    }
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
}
