// maps-scraper.js — Google Maps lead scraper (Playwright-based, no extra chromium)
// Usage: npm run scrape -- "bakery Columbia SC"
//        node Agency/tools/maps-scraper.js "restaurant Columbia SC"
// Output: Agency/ops/leads/maps-YYYY-MM-DD.json

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEADS_DIR = join(__dirname, '../ops/leads');

const query = process.argv[2];
if (!query) {
  console.error('Usage: node Agency/tools/maps-scraper.js "bakery Columbia SC"');
  process.exit(1);
}

async function scrape(searchQuery) {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  console.log(`[Scraper] Searching: "${searchQuery}"`);
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`);
  await page.waitForTimeout(3000);

  // Scroll to load more results
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(800);
  }

  const leads = await page.evaluate(() => {
    const cards = document.querySelectorAll('[data-result-index]');
    return Array.from(cards).map(card => {
      const name     = card.querySelector('.qBF1Pd')?.textContent?.trim() || '';
      const rating   = card.querySelector('.MW4etd')?.textContent?.trim() || '';
      const reviews  = card.querySelector('.UY7F9')?.textContent?.trim() || '';
      const category = card.querySelector('.W4Etuc')?.textContent?.trim() || '';
      const address  = card.querySelector('.W4Etuc + .W4Etuc, .UaQhfb .W4Etuc')?.textContent?.trim() || '';
      const phone    = card.querySelector('[data-dtype="d3ifr"]')?.textContent?.trim() || '';
      const website  = card.querySelector('[data-dtype="d3adr"] a')?.href || '';
      return { name, category, rating, reviews, address, phone, website };
    }).filter(l => l.name);
  });

  await browser.close();
  return leads;
}

(async () => {
  try {
    const leads = await scrape(query);

    if (!leads.length) {
      console.log('[Scraper] No results found.');
      process.exit(0);
    }

    const date    = new Date().toISOString().split('T')[0];
    const slug    = query.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    const outFile = join(LEADS_DIR, `maps-${date}-${slug}.json`);

    if (!existsSync(LEADS_DIR)) mkdirSync(LEADS_DIR, { recursive: true });

    const output = {
      query,
      scraped_at: new Date().toISOString(),
      count: leads.length,
      leads,
    };

    writeFileSync(outFile, JSON.stringify(output, null, 2));
    console.log(`[Scraper] ${leads.length} leads saved → ${outFile}`);

    // Print summary
    leads.forEach((l, i) => {
      console.log(`  ${i + 1}. ${l.name} | ${l.category} | ${l.phone || 'no phone'} | ${l.website ? 'has website' : 'no website'}`);
    });

  } catch (err) {
    console.error('[Scraper] Error:', err.message);
    process.exit(1);
  }
})();
