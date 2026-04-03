/**
 * nightly-lead-engine.js — Automated Lead Scrape + Score + DM Queue
 * Crown Media Group | Runs nightly at 11PM via n8n or standalone
 *
 * What it does:
 *   1. Playwright scrapes Google Maps for 50+ Columbia SC local businesses
 *   2. Scores each lead (0-100) based on pain signals
 *   3. Upserts all leads into Supabase leads table
 *   4. Flags top 20 (score 60+) as dm_queue = true for tomorrow's DM run
 *
 * Usage:
 *   node Agency/tools/nightly-lead-engine.js
 *   node Agency/tools/nightly-lead-engine.js --dry-run   (score only, no Supabase writes)
 *   node Agency/tools/nightly-lead-engine.js --category "restaurants"
 *
 * n8n: Schedule Trigger (11PM daily) → Execute Command node → this script
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

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

if (!supabase) {
  console.error('[FATAL] SUPABASE_URL and SUPABASE_KEY required in .env');
  process.exit(1);
}

// ── Lead scoring formula ─────────────────────────────────────────────────────
// High score = more pain = better target = front of the DM queue
function scoreLead(lead) {
  let score = 0;

  // Has website (basic digital presence) — if no website, extreme pain
  if (!lead.website || lead.website === '') score += 25;
  else score += 10; // has website, still worth contacting

  // Low Google rating (dissatisfied customers = needs help)
  const rating = parseFloat(lead.rating);
  if (!isNaN(rating)) {
    if (rating < 3.5) score += 25;
    else if (rating < 4.0) score += 20;
    else if (rating < 4.2) score += 15;
    else if (rating < 4.5) score += 5;
  }

  // Few reviews (low visibility, easy win to fix)
  const reviews = parseInt((lead.review_count || '0').replace(/[^0-9]/g, ''));
  if (reviews < 10)  score += 20;
  else if (reviews < 30) score += 10;
  else if (reviews < 100) score += 5;

  // Has phone (means we can contact them)
  if (lead.phone) score += 10;

  // Category bonus (highest-converting niches for Crown Media)
  const highValue = ['restaurant', 'salon', 'barber', 'church', 'law', 'dental', 'real estate', 'gym', 'fitness', 'auto', 'repair', 'contractor'];
  const cat = (lead.category || '').toLowerCase();
  if (highValue.some(k => cat.includes(k))) score += 10;

  return Math.min(score, 100);
}

// ── Google Maps scrape for one query ────────────────────────────────────────
async function scrapeCategory(page, query) {
  console.log(`\n[SCRAPE] Searching: "${query}"`);
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Scroll through results panel to load more
  const panel = page.locator('div[role="feed"]');
  for (let i = 0; i < 8; i++) {
    try {
      await panel.evaluate(el => el.scrollBy(0, 600));
    } catch { break; }
    await page.waitForTimeout(600);
  }

  const leads = await page.evaluate(() => {
    // Try the most common Maps result card selectors
    const cards = document.querySelectorAll('[data-result-index], .Nv2PK');
    return Array.from(cards).map(card => {
      const name        = card.querySelector('.qBF1Pd, .fontHeadlineSmall')?.textContent?.trim() || '';
      const rating      = card.querySelector('.MW4etd')?.textContent?.trim() || '';
      const reviewCount = card.querySelector('.UY7F9')?.textContent?.trim() || '';
      const category    = card.querySelector('.W4Etuc')?.textContent?.trim() || '';
      const address     = card.querySelector('.W4Etuc + .W4Etuc')?.textContent?.trim() || '';
      const phone       = card.querySelector('[data-dtype="d3ifr"]')?.textContent?.trim() || '';
      const websiteEl   = card.querySelector('[data-dtype="d3adr"] a, a[href*="http"]:not([href*="google"])');
      const website     = websiteEl ? (websiteEl.href || '').replace(/^https?:\/\//, '').split('/')[0] : '';
      return { name, rating, review_count: reviewCount, category, address, phone, website };
    }).filter(l => l.name && l.name.length > 1);
  });

  console.log(`[SCRAPE] Found ${leads.length} results for "${query}"`);
  return leads;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes('--dry-run');
  const oneCat  = args.find(a => a.startsWith('--category'))
    ? args[args.indexOf(args.find(a => a.startsWith('--category'))) + 1]
    : null;

  // Columbia SC business categories to scrape — rotate through nightly
  const ALL_CATEGORIES = [
    'restaurants Columbia SC',
    'hair salons Columbia SC',
    'barber shops Columbia SC',
    'auto repair Columbia SC',
    'churches Columbia SC',
    'dental offices Columbia SC',
    'law firms Columbia SC',
    'real estate agents Columbia SC',
    'gyms Columbia SC',
    'home contractors Columbia SC',
    'nail salons Columbia SC',
    'cleaning services Columbia SC',
  ];

  // Each night rotate through 3 categories (covers all in 4 days)
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const start = (dayOfYear * 3) % ALL_CATEGORIES.length;
  const TONIGHT = oneCat
    ? [oneCat]
    : [
        ALL_CATEGORIES[start % ALL_CATEGORIES.length],
        ALL_CATEGORIES[(start + 1) % ALL_CATEGORIES.length],
        ALL_CATEGORIES[(start + 2) % ALL_CATEGORIES.length],
      ];

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Crown Media Group — Nightly Lead Engine');
  console.log(`  ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`);
  console.log(`  Categories: ${TONIGHT.join(' | ')}`);
  if (dryRun) console.log('  MODE: DRY RUN (no writes)');
  console.log('═══════════════════════════════════════════════════\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  const page = await context.newPage();

  const allLeads = [];

  for (const query of TONIGHT) {
    try {
      const leads = await scrapeCategory(page, query);
      for (const lead of leads) {
        lead.query_source = query;
        lead.lead_score   = scoreLead(lead);
      }
      allLeads.push(...leads);
    } catch (err) {
      console.error(`[ERROR] Failed to scrape "${query}": ${err.message}`);
    }
  }

  await browser.close();

  if (!allLeads.length) {
    console.log('[ENGINE] No leads scraped tonight. Check Google Maps availability.');
    process.exit(0);
  }

  // Deduplicate by name (same business, different categories)
  const seen = new Set();
  const unique = allLeads.filter(l => {
    const key = l.name.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by score descending
  unique.sort((a, b) => b.lead_score - a.lead_score);

  console.log(`\n[ENGINE] ${unique.length} unique leads | Scoring complete`);

  // Flag top 20 with score >= 60 for DM queue
  const DM_SCORE_THRESHOLD = 60;
  const DM_DAILY_MAX = 20;
  let dmQueueCount = 0;

  for (const lead of unique) {
    lead.dm_queue = lead.lead_score >= DM_SCORE_THRESHOLD && dmQueueCount < DM_DAILY_MAX;
    if (lead.dm_queue) dmQueueCount++;
  }

  console.log(`[ENGINE] DM queue tonight: ${dmQueueCount} leads (score >= ${DM_SCORE_THRESHOLD})`);

  // Print top 10
  console.log('\n[TOP 10 LEADS]');
  console.log('─'.repeat(80));
  unique.slice(0, 10).forEach((l, i) => {
    const queue = l.dm_queue ? ' ← DM QUEUE' : '';
    console.log(`${String(i + 1).padStart(2)}. [${String(l.lead_score).padStart(3)}] ${l.name} | ${l.category || 'unknown'} | ${l.rating || '?'}★ ${l.review_count || ''} | ${l.phone || 'no phone'}${queue}`);
  });
  console.log('─'.repeat(80));

  if (dryRun) {
    console.log('\n[DRY RUN] No writes to Supabase. Run without --dry-run to save leads.');
    process.exit(0);
  }

  // Upsert all leads to Supabase
  console.log(`\n[SUPABASE] Writing ${unique.length} leads...`);
  let inserted = 0;
  let updated  = 0;
  let failed   = 0;

  for (const lead of unique) {
    const row = {
      business_name: lead.name,
      category:      lead.category || null,
      phone:         lead.phone || null,
      website:       lead.website || null,
      address:       lead.address || null,
      rating:        parseFloat(lead.rating) || null,
      review_count:  lead.review_count || null,
      lead_score:    lead.lead_score,
      dm_queue:      lead.dm_queue,
      source:        'google_maps_scrape',
      notes:         `Query: ${lead.query_source}`,
      updated_at:    new Date().toISOString(),
    };

    // Upsert on business_name (closest dedup key we have without place_id)
    const { error } = await supabase.from('leads').upsert(row, {
      onConflict: 'business_name',
      ignoreDuplicates: false,
    });

    if (error) {
      if (error.code === '23505') { updated++; }
      else { console.error(`[SUPABASE] ${lead.name}: ${error.message}`); failed++; }
    } else {
      inserted++;
    }
  }

  console.log(`[SUPABASE] Done — ${inserted} new | ${updated} updated | ${failed} failed`);

  // Save report locally
  const reportDir  = path.join(__dirname, '../ops/leads');
  const reportFile = path.join(reportDir, `nightly-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportFile, JSON.stringify({ date: new Date().toISOString(), categories: TONIGHT, total: unique.length, dm_queue: dmQueueCount, leads: unique }, null, 2));

  console.log(`\n[REPORT] Saved → ${reportFile}`);
  console.log('\n[ENGINE] Nightly run complete. DM queue loaded for tomorrow morning.');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
