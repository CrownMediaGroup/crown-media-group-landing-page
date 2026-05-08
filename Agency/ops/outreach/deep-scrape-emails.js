#!/usr/bin/env node
// deep-scrape-emails.js — enhanced email finder for orgs that resisted first pass
// Tries 16 page patterns per org, deduplicates, filters generics, posts back to CRM
// Run: node Agency/ops/outreach/deep-scrape-emails.js

const BASE_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN = 'KingdomSeed2026';
const TIMEOUT_MS = 8000;
const DELAY_MS = 350;

const EXTRA_PATHS = [
  '/contact', '/contact-us', '/contacts',
  '/about', '/about-us',
  '/staff', '/our-staff', '/meet-the-staff',
  '/team', '/our-team', '/meet-the-team', '/meet-our-team',
  '/leadership', '/our-leadership', '/church-leadership',
  '/pastor', '/our-pastor', '/pastors', '/ministers',
  '/people', '/directory',
  '/',
];

const GENERIC_PATTERNS = [
  /noreply@/i, /donotreply@/i, /no-reply@/i,
  /@gmail\.com$/i, /@yahoo\.com$/i, /@hotmail\.com$/i, /@outlook\.com$/i,
  /example\./i, /domain\./i, /test@/i, /admin@gmail/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.webp$/i,
  /wixpress\.com$/i, /sentry-next\./i, /mysite\.com$/i,
  /churchemailaddress\.com$/i, /sansoxygen\.com$/i,
  /^\d{5}-\d{4}/, /\.min\.js$/i, /unsubscribe@/i, /sentry\.io$/i, /sentry-/i,
  /privacy@/i, /legal@/i, /press@/i, /media@/i, /billing@/i,
];

function isGenericEmail(email) {
  return GENERIC_PATTERNS.some((re) => re.test(email));
}

function extractEmails(html) {
  const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)];
  const mailtoEmails = mailtoMatches.map((m) => m[1].toLowerCase().split('?')[0].trim());
  const bareMatches = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)];
  const bareEmails = bareMatches.map((m) => m[0].toLowerCase().trim());
  const all = [...new Set([...mailtoEmails, ...bareEmails])];
  return all.filter((e) => !isGenericEmail(e) && e.includes('.') && e.length < 80);
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
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return (await res.text()).slice(0, 400000);
  } catch {
    clearTimeout(timer);
    return '';
  }
}

async function deepScrapeEmail(website) {
  const base = normalizeUrl(website);
  if (!base) return null;

  for (const path of EXTRA_PATHS) {
    const url = `${base}${path === '/' ? '' : path}`;
    const html = await fetchWithTimeout(url === base ? base + '/' : url);
    if (!html) continue;
    const emails = extractEmails(html);
    if (emails.length > 0) {
      // Prefer non-info/non-admin emails (more personal)
      const personal = emails.find(e => !e.startsWith('info@') && !e.startsWith('admin@') && !e.startsWith('office@'));
      return { email: personal || emails[0], foundAt: url };
    }
  }
  return null;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('ORACLE DEEP — Enhanced Email Scraper');
  console.log('=====================================');

  // Fetch all records with website but no email
  const res = await fetch(`${BASE_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=500`);
  const data = await res.json();
  const churches = data.churches || data;

  const targets = churches.filter(c =>
    c.website && c.website.trim() !== '' &&
    (!c.email || c.email.trim() === '') &&
    !c.email_sent  // prioritize unsent — but also check sent-but-no-email
  );

  // Also grab churches that have been sent but got a bounce / no email logged
  const sentNoEmail = churches.filter(c =>
    c.website && c.website.trim() !== '' &&
    (!c.email || c.email.trim() === '') &&
    c.email_sent
  );

  console.log(`Unsent + no email: ${targets.length}`);
  console.log(`Sent + no email:   ${sentNoEmail.length}`);
  console.log(`Total to scrape:   ${targets.length + sentNoEmail.length}\n`);

  const allTargets = [...targets, ...sentNoEmail];
  const enriched = [];
  let checked = 0;

  for (const church of allTargets) {
    checked++;
    const label = `[${checked}/${allTargets.length}]`;
    process.stdout.write(`${label} ${church.name.slice(0, 45).padEnd(45)}`);

    const result = await deepScrapeEmail(church.website);
    if (result) {
      process.stdout.write(` FOUND: ${result.email}  (${result.foundAt.replace(normalizeUrl(church.website), '')})\n`);
      enriched.push({ name: church.name, email: result.email });
    } else {
      process.stdout.write(' —\n');
    }
    await delay(DELAY_MS);
  }

  console.log(`\nDone. ${enriched.length} emails found out of ${checked} checked.\n`);

  if (enriched.length === 0) {
    console.log('No new emails. Done.');
    return;
  }

  // Post back to CRM
  console.log(`Posting ${enriched.length} emails to CRM...`);
  const postRes = await fetch(`${BASE_URL}/api/kingdom-reach/churches/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, churches: enriched }),
  });
  const postData = await postRes.json();
  if (postRes.ok) {
    console.log(`Updated ${postData.updated ?? postData.imported ?? enriched.length} records`);
  } else {
    console.error('Failed:', postData);
  }

  // Send ministry_org campaign to newly enriched unsent records
  console.log('\nFetching newly enriched unsent records...');
  const listRes = await fetch(`${BASE_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=500`);
  const listData = await listRes.json();
  const allChurches = listData.churches || listData;

  const newlyEnrichedNames = new Set(enriched.map(e => e.name.toLowerCase()));
  const toSend = allChurches.filter(c =>
    newlyEnrichedNames.has(c.name?.toLowerCase()) &&
    c.email &&
    !c.email_sent
  );

  if (toSend.length === 0) {
    console.log('No unsent records to campaign (all were previously sent or no new emails for unsent).');
  } else {
    console.log(`Sending ministry_org to ${toSend.length} newly enriched records...`);
    const ids = toSend.map(c => c.id);
    const sendRes = await fetch(`${BASE_URL}/api/kingdom-reach/campaign/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, template: 'ministry_org', church_ids: ids }),
    });
    const sendData = await sendRes.json();
    if (sendRes.ok) {
      console.log(`Sent: ${sendData.sent} | Failed: ${sendData.failed}`);
    } else {
      console.error('Campaign failed:', sendData);
    }
  }

  console.log('\n=== SUMMARY ===');
  for (const e of enriched) {
    console.log(`  ${e.name.padEnd(50)} ${e.email}`);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
