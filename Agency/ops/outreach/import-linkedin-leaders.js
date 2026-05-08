#!/usr/bin/env node
// import-linkedin-leaders.js
// Imports the 31 LinkedIn target orgs not yet in Kingdom Reach DB
// Then enriches for emails and sends the ministry_org template
// Run: node Agency/ops/outreach/import-linkedin-leaders.js

const BASE_URL = process.env.CRM_URL || 'https://crm.crownmediagroup.co';
const TOKEN = 'KingdomSeed2026';
const TIMEOUT_MS = 7000;
const DELAY_MS = 400;

// 31 orgs from LinkedIn research not yet in DB
const ORGS = [
  { name: 'GraceChurch of Columbia', website: 'https://gracechurchofcolumbia.com', org_type: 'church', pastor: 'Bill Crews', city: 'Columbia', state: 'SC' },
  { name: 'G3 Fellowship', website: 'https://g3fellowship.org', org_type: 'church', pastor: 'Christopher Ellison', city: 'Columbia', state: 'SC' },
  { name: 'Agape Worship Center International', website: 'https://agapewic.org', org_type: 'church', pastor: 'Vincent Collins', city: 'Columbia', state: 'SC', address: '424 Lee Rd' },
  { name: 'Westminster Presbyterian Church Columbia', website: 'https://westminsterpca.net', org_type: 'church', pastor: 'Chris Denny', city: 'Columbia', state: 'SC' },
  { name: 'Capital City Baptist Church', website: 'https://capitalcitybaptist.org', org_type: 'church', pastor: 'Bryan Hunt', city: 'Columbia', state: 'SC' },
  { name: 'McGregor Presbyterian Church', website: 'https://mcgregorpresbyterian.org', org_type: 'church', pastor: 'Julie Bird', city: 'Columbia', state: 'SC' },
  { name: 'ChristWay Baptist Church', website: 'https://christwaybaptist.com', org_type: 'church', pastor: 'Tony Jones', city: 'Cayce', state: 'SC' },
  { name: 'Holy Nation Church', website: 'https://holynationchurch.com', org_type: 'church', pastor: 'Russell Moore', city: 'Columbia', state: 'SC', address: '1922 Mitchell St' },
  { name: 'Lake Murray Presbyterian Church', website: 'https://lakemurraypres.org', org_type: 'church', pastor: 'Ben Sloan', city: 'Columbia', state: 'SC' },
  { name: 'Downtown Church Columbia', website: 'https://downtownchurchcolumbia.com', org_type: 'church', pastor: 'Dawn Martin Hyde', city: 'Columbia', state: 'SC' },
  // Nonprofits / Ministries
  { name: 'School Time Bible Ministries', website: 'https://schooltimebible.org', org_type: 'nonprofit', pastor: 'Grayson Hartgrove', city: 'Columbia', state: 'SC' },
  { name: 'Hannah House Columbia', website: 'https://hannahhousesc.org', org_type: 'nonprofit', pastor: 'Gerald Davis', city: 'Columbia', state: 'SC' },
  { name: 'Harmony Christian Community', website: 'https://harmonychristiancommunity.org', org_type: 'nonprofit', pastor: 'WC Hoecke', city: 'Columbia', state: 'SC' },
  { name: 'Ezekiel Ministries', website: 'https://ezekielministries.org', org_type: 'nonprofit', pastor: 'Christian Markle', city: 'Columbia', state: 'SC' },
  { name: 'Bill Crockett Ministries', website: 'https://billcrockett.com', org_type: 'missions', pastor: 'Bill Crockett', city: 'Columbia', state: 'SC' },
  { name: 'Cross Faith Ministries', website: 'https://crossfaithministries.org', org_type: 'youth', pastor: 'Shannon Contreras', city: 'West Columbia', state: 'SC' },
  { name: 'SC Christian Action Council', website: 'https://scchristianactioncouncil.org', org_type: 'network', pastor: 'Regina Moore', city: 'Columbia', state: 'SC' },
  { name: 'Faith Driven Ministries SC', website: 'https://faithdrivenministries.com', org_type: 'nonprofit', pastor: 'Suzy Shay', city: 'Lexington', state: 'SC' },
  { name: 'CUPS Mission', website: 'https://cupsmission.com', org_type: 'missions', pastor: 'Jack Eason', city: 'Columbia', state: 'SC' },
  { name: 'JUMPSTART SC', website: 'https://jumpstartsc.org', org_type: 'recovery', pastor: 'Tim Murray', city: 'Columbia', state: 'SC' },
  { name: 'Fellowship of Young Christian Professionals', website: 'https://fycp.org', org_type: 'network', pastor: 'Bill Crockett', city: 'Columbia', state: 'SC' },
  // Schools
  { name: 'Lakeside Christian Academy', website: 'https://lakesidechristianacademy.org', org_type: 'school', pastor: 'Brian Simmons', city: 'Columbia', state: 'SC' },
  { name: 'SC Association of Christian Schools', website: 'https://scacs.org', org_type: 'network', pastor: 'Huey Mills', city: 'Lancaster', state: 'SC' },
  { name: 'East Point Academy', website: 'https://eastpointacademy.org', org_type: 'school', pastor: 'Bruce Moseley', city: 'Columbia', state: 'SC' },
  // Missing email from DB — enrich these
  { name: 'Washington Street United Methodist Church', website: 'https://wstreet.org', org_type: 'church', pastor: 'Rebecca Shirley', city: 'Columbia', state: 'SC', _dbId: 178 },
  { name: 'Ben Lippen School', website: 'https://benlippen.com', org_type: 'school', pastor: 'Ben Porter', city: 'Columbia', state: 'SC', _dbId: 7185 },
  { name: 'Crossover Global', website: 'https://crossoverglobal.net', org_type: 'missions', pastor: 'Rachel Lively', city: 'Columbia', state: 'SC', _dbId: 7214 },
  { name: 'Home Works of America', website: 'https://homeworksofamerica.org', org_type: 'nonprofit', pastor: 'Joe Huggins', city: 'Columbia', state: 'SC', _dbId: 7179 },
  { name: 'Sandhills Community Church', website: 'https://sandhillscc.com', org_type: 'church', pastor: 'Erich Wiegner', city: 'Columbia', state: 'SC', _dbId: 19 },
];

const GENERIC_PATTERNS = [
  /noreply@/i, /donotreply@/i, /no-reply@/i,
  /@gmail\.com$/i, /@yahoo\.com$/i, /@hotmail\.com$/i, /@outlook\.com$/i,
  /example\./i, /domain\./i, /test@/i, /admin@gmail/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.svg$/i, /\.webp$/i,
  /wixpress\.com$/i, /sentry-next\./i, /mysite\.com$/i,
  /churchemailaddress\.com$/i, /sansoxygen\.com$/i,
  /^\d{5}-\d{4}/,
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
        'User-Agent': 'Mozilla/5.0 (compatible; CrownMediaBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timer);
    if (!res.ok) return '';
    return (await res.text()).slice(0, 300000);
  } catch {
    clearTimeout(timer);
    return '';
  }
}

async function scrapeEmail(website) {
  const base = normalizeUrl(website);
  if (!base) return null;
  for (const url of [`${base}/contact`, `${base}/contact-us`, `${base}/about`, `${base}/staff`, base]) {
    const html = await fetchWithTimeout(url);
    if (!html) continue;
    const emails = extractEmails(html);
    if (emails.length > 0) return { email: emails[0], foundAt: url };
  }
  return null;
}

// Also try alternate website patterns if first fails
async function scrapeEmailWithFallback(org) {
  // Try primary website
  let result = await scrapeEmail(org.website);
  if (result) return result;

  // Try common alt patterns
  const name = org.name.toLowerCase()
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '');
  const altDomains = [
    `https://${name}.com`,
    `https://${name}.org`,
    `https://${name}.net`,
    `https://www.${name}.com`,
    `https://www.${name}.org`,
  ];
  for (const domain of altDomains) {
    if (domain === org.website) continue;
    result = await scrapeEmail(domain);
    if (result) return result;
  }
  return null;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('ORACLE — LinkedIn Leaders Email Enricher');
  console.log('=========================================');
  console.log(`Processing ${ORGS.length} orgs\n`);

  const toImport = ORGS.filter((o) => !o._dbId);
  const toEnrich = ORGS.filter((o) => o._dbId);

  // Step 1: Import new orgs into DB
  if (toImport.length > 0) {
    console.log(`Step 1: Importing ${toImport.length} new orgs...`);
    const churches = toImport.map((o) => ({
      name: o.name,
      tier: 'B',
      org_type: o.org_type || 'nonprofit',
      address: o.address || '',
      city: o.city || 'Columbia',
      state: o.state || 'SC',
      website: o.website || '',
      pastor: o.pastor || '',
      has_website: 1,
      status: 'Not Contacted',
    }));
    const res = await fetch(`${BASE_URL}/api/kingdom-reach/churches/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, churches }),
    });
    const data = await res.json();
    if (res.ok) {
      console.log(`  Imported ${data.imported ?? '?'} new records\n`);
    } else {
      console.error('  Import failed:', data);
    }
  }

  // Step 2: Scrape emails for all orgs
  console.log('Step 2: Scraping emails...\n');
  const enriched = [];
  let i = 0;
  for (const org of ORGS) {
    i++;
    process.stdout.write(`[${i}/${ORGS.length}] ${org.name.slice(0, 45).padEnd(45)}`);
    if (org.email) {
      process.stdout.write(` ALREADY HAS: ${org.email}\n`);
      continue;
    }
    const result = await scrapeEmailWithFallback(org);
    if (result) {
      process.stdout.write(` FOUND: ${result.email}\n`);
      enriched.push({ name: org.name, email: result.email });
    } else {
      process.stdout.write(' no email\n');
    }
    await delay(DELAY_MS);
  }

  console.log(`\nScraping complete. ${enriched.length} emails found.\n`);

  if (enriched.length === 0) {
    console.log('No new emails to update. Done.');
    return;
  }

  // Step 3: Post emails back
  console.log(`Step 3: Writing ${enriched.length} emails to CRM...`);
  const res2 = await fetch(`${BASE_URL}/api/kingdom-reach/churches/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: TOKEN, churches: enriched }),
  });
  const data2 = await res2.json();
  if (res2.ok) {
    console.log(`  Updated ${data2.updated ?? data2.imported ?? enriched.length} records`);
  } else {
    console.error('  Update failed:', data2);
  }

  // Step 4: Get IDs for unsent records with emails, then send campaign
  console.log('\nStep 4: Fetching records to send campaign...');
  const listRes = await fetch(`${BASE_URL}/api/kingdom-reach/churches?token=${TOKEN}&limit=500`);
  const listData = await listRes.json();
  const allChurches = listData.churches || listData;

  const orgNames = new Set(ORGS.map((o) => o.name.toLowerCase()));
  const toSend = allChurches.filter((c) => {
    return orgNames.has(c.name?.toLowerCase()) && c.email && !c.email_sent;
  });

  console.log(`Found ${toSend.length} unsent records with emails to send`);
  if (toSend.length === 0) {
    console.log('Nothing new to send. Done.');
    return;
  }

  const ids = toSend.map((c) => c.id);
  console.log(`Sending ministry_org template to ${ids.length} leaders...`);

  const sendRes = await fetch(`${BASE_URL}/api/kingdom-reach/campaign/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: TOKEN,
      template: 'ministry_org',
      church_ids: ids,
    }),
  });
  const sendData = await sendRes.json();
  if (sendRes.ok) {
    console.log(`\nCampaign sent: ${sendData.sent} sent, ${sendData.failed} failed`);
  } else {
    console.error('Campaign send failed:', sendData);
  }

  console.log('\n=== DONE ===');
  console.log(`Enriched emails : ${enriched.length}`);
  console.log(`Emails sent     : ${sendData?.sent ?? 0}`);
  if (enriched.length > 0) {
    console.log('\nEmails found:');
    for (const e of enriched) {
      console.log(`  ${e.name.padEnd(50)} ${e.email}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
