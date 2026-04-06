/**
 * nightly-lead-gen.js — Crown Media Group Nightly Lead Intelligence
 * Runs at midnight via standalone-runner.js
 * Searches Columbia SC businesses, scores them, pushes to Supabase + CRM
 *
 * Usage:
 *   node tools/nightly-lead-gen.js          ← full run
 *   node tools/nightly-lead-gen.js --test   ← 3 results, no DB write
 */

const path    = require('path');
const fs      = require('fs');

// Load env
for (const p of [path.join(__dirname, '../.env'), path.join(__dirname, '.env')]) {
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=');
      if (k && v.length && !process.env[k.trim()]) {
        process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
      }
    });
  }
}

const IS_TEST  = process.argv.includes('--test');
const ROOT     = path.join(__dirname, '..');
const LOG_FILE = path.join(ROOT, 'Agency/ops/notes/LEAD-REPORT.md');
const LAST_RUN = path.join(ROOT, 'Agency/ops/notes/.lead-gen-last-run');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const EXA_KEY       = process.env.EXA_API_KEY;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_KEY;

// ── Logging ───────────────────────────────────────────────────────────────────

const logLines = [];
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  logLines.push(line);
}

// ── Search Columbia SC businesses via EXA ─────────────────────────────────────

async function searchBusinesses() {
  const queries = [
    'Columbia SC restaurant food business local',
    'Columbia SC hair salon beauty spa studio',
    'Columbia SC cleaning service home contractor',
    'Columbia SC event planner catering business',
    'Columbia SC boutique retail clothing shop',
    'Columbia SC fitness trainer coach wellness',
  ];

  const results = [];

  for (const query of queries) {
    try {
      log(`Searching: ${query}`);
      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': EXA_KEY },
        body: JSON.stringify({
          query,
          numResults: IS_TEST ? 2 : 8,
          type: 'neural',
          useAutoprompt: true,
          contents: { text: { maxCharacters: 500 } },
        }),
      });
      const data = await res.json();
      if (data.results) {
        for (const r of data.results) {
          results.push({
            business_name: r.title || r.url,
            website: r.url,
            snippet: r.text || '',
            source: 'exa-search',
          });
        }
      }
    } catch (e) {
      log(`Search error (${query.substring(0, 30)}...): ${e.message}`);
    }
    if (IS_TEST && results.length >= 3) break;
  }

  return results;
}

// ── Score each lead with Claude AI ────────────────────────────────────────────

async function scoreLeads(businesses) {
  if (!ANTHROPIC_KEY || !businesses.length) return businesses.map(b => ({ ...b, lead_score: 50, category: 'Unknown', notes: '' }));

  try {
    const prompt = `You are a lead scoring agent for Crown Media Group, a Columbia SC AI marketing agency.
Score each business for marketing retainer fit (0–100).

Scoring guide:
- No website or weak website: +30
- Service business (beauty, food, contractor, health, events): +20
- Active social media (suggests budget): +15
- Columbia SC local: +15
- Faith-aligned or community-focused: +10
- E-commerce or online sales: +10
- Already has strong digital presence: -20

Return JSON array only. Each item: { "business_name": string, "lead_score": number, "category": string, "notes": string (1 sentence pitch angle) }

Businesses:
${businesses.slice(0, IS_TEST ? 3 : 20).map((b, i) => `${i + 1}. ${b.business_name} | ${b.website} | ${b.snippet.substring(0, 150)}`).join('\n')}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const scored = JSON.parse(match[0]);
      return businesses.map((b, i) => {
        const s = scored[i] || {};
        return { ...b, lead_score: s.lead_score || 50, category: s.category || 'Unknown', notes: s.notes || '' };
      });
    }
  } catch (e) {
    log(`Score error: ${e.message}`);
  }

  return businesses.map(b => ({ ...b, lead_score: 50, category: 'Unknown', notes: '' }));
}

// ── Push to Supabase leads table ──────────────────────────────────────────────

async function pushToSupabase(leads) {
  if (!SUPABASE_URL || !SUPABASE_KEY || IS_TEST) {
    log(`[TEST MODE] Would push ${leads.length} leads to Supabase`);
    return;
  }

  let pushed = 0;
  for (const lead of leads) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({
          business_name: lead.business_name || 'Unknown',
          website: lead.website || '',
          category: lead.category || 'Unknown',
          notes: lead.notes || '',
          lead_score: lead.lead_score || 50,
          source: 'nightly-lead-gen',
          status: 'new',
        }),
      });
      if (res.ok || res.status === 409) pushed++;
    } catch (e) {
      log(`Supabase push error: ${e.message}`);
    }
  }
  log(`Pushed ${pushed}/${leads.length} leads to Supabase`);
}

// ── Write nightly report ──────────────────────────────────────────────────────

function writeReport(leads) {
  const date   = new Date().toISOString().split('T')[0];
  const top    = leads.filter(l => l.lead_score >= 70).sort((a, b) => b.lead_score - a.lead_score);
  const medium = leads.filter(l => l.lead_score >= 50 && l.lead_score < 70);

  const content = `# Lead Gen Report — ${date}

**Total found:** ${leads.length} | **Hot (70+):** ${top.length} | **Warm (50–69):** ${medium.length}

## Hot Leads (Score 70+) — Priority Outreach

${top.length ? top.map(l => `### ${l.business_name}
- **Score:** ${l.lead_score}/100
- **Category:** ${l.category}
- **Website:** ${l.website}
- **Pitch angle:** ${l.notes}
`).join('\n') : '_None this run_'}

## Warm Leads (Score 50–69)

${medium.length ? medium.map(l => `- **${l.business_name}** (${l.lead_score}) — ${l.category} | ${l.notes}`).join('\n') : '_None this run_'}

---
_Generated by nightly-lead-gen.js — ${new Date().toISOString()}_
`;

  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_FILE, content);
  log(`Report written: ${LOG_FILE}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  log(`=== Nightly Lead Gen ${IS_TEST ? '[TEST MODE]' : ''} ===`);

  if (!EXA_KEY && !IS_TEST) {
    log('ERROR: EXA_API_KEY not set. Add to .env');
    process.exit(1);
  }

  const businesses = await searchBusinesses();
  log(`Found ${businesses.length} businesses`);

  if (!businesses.length) {
    log('No businesses found this run');
    return;
  }

  const scored = await scoreLeads(businesses);
  const sorted = scored.sort((a, b) => b.lead_score - a.lead_score);

  log(`Scored ${sorted.length} leads. Top score: ${sorted[0]?.lead_score} (${sorted[0]?.business_name})`);

  scored.forEach(l => {
    const bar = '█'.repeat(Math.round(l.lead_score / 10)) + '░'.repeat(10 - Math.round(l.lead_score / 10));
    log(`  ${bar} ${l.lead_score} | ${l.business_name}`);
  });

  await pushToSupabase(sorted);
  writeReport(sorted);

  if (!IS_TEST) {
    fs.writeFileSync(LAST_RUN, new Date().toISOString().split('T')[0]);
  }

  log('=== Lead gen complete ===');
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
