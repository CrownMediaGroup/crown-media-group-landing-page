// tools/kingdom-reach/enrich-tier-a.js
// Tier-A focused deep enrichment.
// GAUGE scored 88 Tier-A records (lead_score >= 80). Many lack emails.
// These are HIGH-FIT prospects worth deeper research time per record.
//
// Strategy:
//   1. Pull Tier A records with no email
//   2. For each with a website: deep-scrape /contact, /staff, /pastor, /about, /leadership
//   3. For each WITHOUT a website: try Facebook page email lookup (manual queue)
//   4. PATCH any found email back to CRM
//
// Usage: SEED_TOKEN=... node tools/kingdom-reach/enrich-tier-a.js
//        SEED_TOKEN=... node tools/kingdom-reach/enrich-tier-a.js --limit 10

import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const CRM_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN = process.env.SEED_TOKEN;
const TIMEOUT_MS = 10000;
const DELAY_MS = 400;

// Extended scrape paths — Tier A gets more attention
const PATHS = [
  '/contact', '/contact-us', '/contacts', '/get-in-touch',
  '/about', '/about-us', '/who-we-are', '/our-story',
  '/staff', '/our-staff', '/meet-the-staff', '/staff-directory',
  '/team', '/our-team', '/leadership', '/our-leadership',
  '/pastor', '/our-pastor', '/pastors', '/pastoral-staff', '/ministers',
  '/elders', '/deacons', '/directory', '/people',
  '/communications', '/connect',
  '/',
];

const GENERIC_PATTERNS = [
  /noreply@/i, /donotreply@/i, /no-reply@/i,
  /@gmail\.com$/i, /@yahoo\.com$/i, /@hotmail\.com$/i, /@outlook\.com$/i,
  /example\./i, /domain\./i, /test@/i, /@churchspring\./i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.webp$/i,
  /wixpress\.com$/i, /sentry-next\./i, /mysite\.com$/i,
  /churchemailaddress\.com$/i, /sansoxygen\.com$/i,
  /^\d{5}-\d{4}/, /\.min\.js$/i, /unsubscribe@/i, /sentry\.io$/i,
  /privacy@/i, /legal@/i, /press@/i, /media@/i, /billing@/i,
];

function isGenericEmail(email) {
  return GENERIC_PATTERNS.some(re => re.test(email));
}

function extractEmails(html) {
  const mailto = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)].map(m => m[1].toLowerCase().split('?')[0].trim());
  const bare   = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)].map(m => m[0].toLowerCase().trim());
  const all = [...new Set([...mailto, ...bare])];
  return all.filter(e => !isGenericEmail(e) && e.includes('.') && e.length < 80);
}

function normalizeUrl(website) {
  if (!website || !website.trim()) return null;
  const w = website.trim().startsWith('http') ? website.trim() : `https://${website.trim()}`;
  return w.replace(/\/$/, '');
}

async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return (await res.text()).slice(0, 500000);
  } catch {
    clearTimeout(timer);
    return '';
  }
}

async function deepScrape(website) {
  const base = normalizeUrl(website);
  if (!base) return null;
  for (const path of PATHS) {
    const url = `${base}${path === '/' ? '' : path}`;
    const html = await fetchWithTimeout(url === base ? base + '/' : url);
    if (!html) continue;
    const emails = extractEmails(html);
    if (emails.length > 0) {
      // Prefer non-info/non-admin (more personal) but allow them as fallback
      const personal = emails.find(e => !e.startsWith('info@') && !e.startsWith('admin@') && !e.startsWith('office@'));
      return { email: personal || emails[0], foundAt: url, all: emails };
    }
  }
  return null;
}

async function main() {
  if (!TOKEN) { console.error('SEED_TOKEN required'); process.exit(1); }

  const limitIdx = process.argv.indexOf('--limit');
  const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1]) : Infinity;

  console.log('Tier-A deep enrichment');
  console.log('======================');

  const res = await fetch(`${CRM_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=2000`);
  const data = await res.json();
  const churches = data.churches || [];

  // Tier A: lead_score >= 80 AND no email
  const tierA = churches.filter(c => (c.lead_score || 0) >= 80);
  const noEmail = tierA.filter(c => !c.email || !c.email.trim());
  const withWebsite = noEmail.filter(c => c.website && c.website.trim());
  const noWebsite   = noEmail.filter(c => !c.website || !c.website.trim());

  console.log(`Tier A total:           ${tierA.length}`);
  console.log(`  with email already:   ${tierA.length - noEmail.length}`);
  console.log(`  no email + website:   ${withWebsite.length}  ← scrape candidates`);
  console.log(`  no email + no website: ${noWebsite.length} ← need manual research`);
  console.log('');

  const targets = withWebsite.slice(0, LIMIT === Infinity ? withWebsite.length : LIMIT);
  let found = 0, failed = 0;
  const enrichedEmails = [];

  for (let i = 0; i < targets.length; i++) {
    const c = targets[i];
    process.stdout.write(`[${i+1}/${targets.length}] ${c.name.slice(0, 50).padEnd(50)} `);
    let result;
    try {
      result = await deepScrape(c.website);
    } catch (e) { result = null; }

    if (result) {
      process.stdout.write(`FOUND: ${result.email}\n`);
      // PATCH back to CRM
      try {
        const patchRes = await fetch(`${CRM_URL}/api/kingdom-reach/churches/${c.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: TOKEN, email: result.email, notes: (c.notes || '') + `\n[${new Date().toISOString().slice(0,10)}] Tier-A enrichment found email via ${result.foundAt}` }),
        });
        if (patchRes.ok) {
          found++;
          enrichedEmails.push({ id: c.id, name: c.name, email: result.email });
        } else console.log(`       PATCH failed: ${patchRes.status}`);
      } catch (e) { console.log(`       PATCH err: ${e.message}`); }
    } else {
      process.stdout.write(`—\n`);
      failed++;
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log('');
  console.log(`Done. Enriched: ${found} / ${targets.length} (failed: ${failed})`);

  // ARCHIVE + HERALD
  try {
    appendEvent({
      agent: 'ORACLE',
      entity_type: 'enrichment_run',
      entity_id: `tier-a-${new Date().toISOString().slice(0,10)}`,
      action: 'tier_a_deep_enrich',
      fields: { targets: targets.length, found, failed, emails_added: enrichedEmails.map(e => e.email) },
      source: 'enrich-tier-a.js',
    });
    emit({
      agent: 'ORACLE',
      severity: found > 0 ? 'P1' : 'P2',
      action: `Tier-A enrichment: ${found}/${targets.length} new emails`,
      detail: enrichedEmails.length ? enrichedEmails.slice(0,5).map(e => `${e.name}→${e.email}`).join('; ') : 'No new emails found',
      next: 'New Tier-A reachable records ready for next pitch batch',
    });
  } catch {}

  return { found, failed, total: targets.length, enrichedEmails };
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('enrich-tier-a.js') || argv1.endsWith('enrich-tier-a.mjs')) {
  try {
    await main();
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exit(1);
  }
}
