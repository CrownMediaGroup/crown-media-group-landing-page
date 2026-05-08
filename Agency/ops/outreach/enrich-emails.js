// enrich-emails.js
// ORACLE — Email Enricher for Kingdom Reach
// Fetches church records from the live CRM, scrapes their websites for email addresses,
// and posts found emails back via the token-authenticated bulk import endpoint.
//
// Usage: node Agency/ops/outreach/enrich-emails.js

const BASE_URL = 'https://crm.crownmediagroup.co';
const TOKEN = 'KingdomSeed2026';
const TIMEOUT_MS = 6000;
const DELAY_MS = 300;
const MAX_CHURCHES = 150;

const GENERIC_PATTERNS = [
  /noreply@/i,
  /donotreply@/i,
  /no-reply@/i,
  /@gmail\.com$/i,
  /@yahoo\.com$/i,
  /@hotmail\.com$/i,
  /@outlook\.com$/i,
  /example\./i,
  /domain\./i,
  /test@/i,
  /admin@gmail/i,
  // Image filenames mistakenly matched as emails
  /\.png$/i,
  /\.jpg$/i,
  /\.gif$/i,
  /\.svg$/i,
  /\.webp$/i,
  // Wix/CMS internal addresses
  /wixpress\.com$/i,
  /sentry-next\./i,
  // Placeholder/template emails
  /mysite\.com$/i,
  /churchemailaddress\.com$/i,
  /sansoxygen\.com$/i,
  // Numeric-prefixed donation/account IDs (e.g. 28289-0004donorservices@)
  /^\d{5}-\d{4}/,
];

function isGenericEmail(email) {
  return GENERIC_PATTERNS.some((re) => re.test(email));
}

function extractEmails(html) {
  // Match mailto: links first (most reliable)
  const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi)];
  const mailtoEmails = mailtoMatches.map((m) => m[1].toLowerCase().split('?')[0].trim());

  // Also match bare email patterns in text
  const bareMatches = [...html.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)];
  const bareEmails = bareMatches.map((m) => m[0].toLowerCase().trim());

  // Combine, deduplicate, filter generics
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
        'User-Agent': 'Mozilla/5.0 (compatible; CrownMediaBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    const text = await res.text();
    return text.slice(0, 300000); // cap at 300KB to avoid memory issues
  } catch {
    clearTimeout(timer);
    return '';
  }
}

async function scrapeEmailFromSite(website) {
  const base = normalizeUrl(website);
  if (!base) return null;

  const urlsToTry = [
    `${base}/contact`,
    `${base}/contact-us`,
    `${base}/about`,
    `${base}/staff`,
    base,
  ];

  for (const url of urlsToTry) {
    const html = await fetchWithTimeout(url);
    if (!html) continue;
    const emails = extractEmails(html);
    if (emails.length > 0) {
      return { email: emails[0], foundAt: url };
    }
  }

  return null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('ORACLE — Kingdom Reach Email Enricher');
  console.log('======================================');
  console.log(`Target: ${BASE_URL}`);
  console.log('');

  // Step 1: Fetch all churches
  console.log('Fetching church records from CRM...');
  let churches;
  try {
    const res = await fetch(`${BASE_URL}/api/kingdom-reach/churches?token=${TOKEN}`);
    if (!res.ok) {
      console.error(`Failed to fetch churches: HTTP ${res.status}`);
      process.exit(1);
    }
    const data = await res.json();
    // API may return { churches: [...] } or a plain array
    churches = Array.isArray(data) ? data : (data.churches || data.data || []);
  } catch (err) {
    console.error('Error fetching churches:', err.message);
    process.exit(1);
  }

  console.log(`Total records: ${churches.length}`);

  // Step 2: Filter — has website, no email
  const targets = churches.filter(
    (c) =>
      c.website && c.website.trim() !== '' &&
      (!c.email || c.email.trim() === '')
  );

  console.log(`Filtered to ${targets.length} with website but no email.`);

  const batch = targets.slice(0, MAX_CHURCHES);
  console.log(`Processing up to ${MAX_CHURCHES}. Running ${batch.length} checks.\n`);

  const results = []; // { name, email }
  let checked = 0;
  let found = 0;

  // Step 3: Scrape each church
  for (const church of batch) {
    checked++;
    const label = `[${checked}/${batch.length}]`;
    process.stdout.write(`${label} Checking ${church.name}...`);

    const result = await scrapeEmailFromSite(church.website);

    if (result) {
      found++;
      process.stdout.write(` FOUND: ${result.email} (from ${result.foundAt})\n`);
      results.push({ name: church.name, email: result.email });
    } else {
      process.stdout.write(' no email found\n');
    }

    await delay(DELAY_MS);
  }

  console.log('');
  console.log(`Scraping complete. ${found} emails found out of ${checked} checked.`);

  if (results.length === 0) {
    console.log('No emails to update. Done.');
    return;
  }

  // Step 4: POST to bulk import endpoint to write emails back
  console.log(`\nPosting ${results.length} email updates to CRM...`);

  try {
    const res = await fetch(
      `${BASE_URL}/api/kingdom-reach/churches/import`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, churches: results }),
      }
    );

    const responseText = await res.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (res.ok) {
      const updated = responseData.updated ?? responseData.inserted ?? results.length;
      console.log(`CRM updated successfully. ${updated} records updated.`);
    } else {
      console.error(`CRM import returned HTTP ${res.status}:`, responseData);
    }
  } catch (err) {
    console.error('Error posting to CRM:', err.message);
  }

  // Step 5: Final summary
  console.log('');
  console.log('=== FINAL SUMMARY ===');
  console.log(`Churches checked : ${checked}`);
  console.log(`Emails found     : ${found}`);
  console.log(`Records updated  : ${results.length}`);
  console.log('');
  if (results.length > 0) {
    console.log('Emails collected:');
    for (const r of results) {
      console.log(`  ${r.name.padEnd(45)} ${r.email}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
