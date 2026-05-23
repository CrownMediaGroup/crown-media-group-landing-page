#!/usr/bin/env node
// create-stripe-products.mjs — one-shot Stripe product + price creator
// Creates all 11 SKUs (8 Music + 3 Edge) idempotently. Safe to re-run.
//
// Usage:
//   cd landing-page && STRIPE_SECRET_KEY=sk_live_xxx node ../Agency/ops/tools/create-stripe-products.mjs
//
// Output:
//   - Console log per product (created vs skipped if already exists)
//   - CSV manifest at Agency/ops/notes/stripe-products-2026-05-23.csv
//
// IMPORTANT: edge-edge-297 (Live Trader) is created with active:false. Toggle
// to active in Stripe dashboard ONLY AFTER securities attorney signs off.

import Stripe from 'stripe';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY) {
  console.error('STRIPE_SECRET_KEY env var required.');
  console.error('Run: STRIPE_SECRET_KEY=sk_live_xxx node Agency/ops/tools/create-stripe-products.mjs');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY);

// ── 11 SKU CATALOG ──────────────────────────────────────────────────────────
const SKUS = [
  // Music — 8 one-time products
  { id: 'music-license-150',  name: 'Kingdom Sound — Catalog License (Standard)',     price_cents: 15000,  recurring: false, active: true,  category: 'music' },
  { id: 'music-license-297',  name: 'Kingdom Sound — Catalog License (Premium)',      price_cents: 29700,  recurring: false, active: true,  category: 'music' },
  { id: 'music-license-497',  name: 'Kingdom Sound — Catalog License (Signature)',    price_cents: 49700,  recurring: false, active: true,  category: 'music' },
  { id: 'music-custom-500',   name: 'Kingdom Sound — Custom Instrumental',            price_cents: 50000,  recurring: false, active: true,  category: 'music' },
  { id: 'music-custom-997',   name: 'Kingdom Sound — Custom Instrumental Pro',        price_cents: 99700,  recurring: false, active: true,  category: 'music' },
  { id: 'music-original-993', name: 'Kingdom Sound — Custom Original Song (Lyrics)',  price_cents: 99300,  recurring: false, active: true,  category: 'music' },
  { id: 'music-original-1497', name: 'Kingdom Sound — Original Song Premium',         price_cents: 149700, recurring: false, active: true,  category: 'music' },
  { id: 'music-bundle-1997',  name: 'Kingdom Sound — All Three Services Bundle',      price_cents: 199700, recurring: false, active: true,  category: 'music' },
  // Edge — 3 subscriptions (Live tier gated)
  { id: 'edge-watch-37',      name: 'Kingdom Edge — Watch Tier',                      price_cents: 3700,   recurring: 'month', active: true,  category: 'edge' },
  { id: 'edge-trade-97',      name: 'Kingdom Edge — Paper Trader',                    price_cents: 9700,   recurring: 'month', active: true,  category: 'edge' },
  { id: 'edge-edge-297',      name: 'Kingdom Edge — Live Trader (ATTORNEY GATED)',    price_cents: 29700,  recurring: 'month', active: false, category: 'edge' },
];

console.log('Crown Media Group — Stripe product creation');
console.log('═══════════════════════════════════════════════════════════════');
console.log('Creating ' + SKUS.length + ' products...');
console.log('');

const manifest = [];
const results = { created: 0, skipped: 0, failed: 0, errors: [] };

for (const sku of SKUS) {
  try {
    // Look up by metadata.sku_id to handle re-runs idempotently
    const existing = await stripe.products.search({ query: `metadata['sku_id']:'${sku.id}'` });
    let product;
    if (existing.data.length > 0) {
      product = existing.data[0];
      console.log('SKIP  [' + sku.id + '] product exists: ' + product.id);
      results.skipped++;
    } else {
      product = await stripe.products.create({
        name: sku.name,
        active: sku.active,
        metadata: { sku_id: sku.id, category: sku.category, created_by: 'create-stripe-products.mjs 2026-05-23' },
      });
      console.log('NEW   [' + sku.id + '] product created: ' + product.id);
      results.created++;
    }

    // Find or create the price
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 10 });
    let price = prices.data.find(p =>
      p.unit_amount === sku.price_cents &&
      ((sku.recurring && p.recurring && p.recurring.interval === sku.recurring) || (!sku.recurring && !p.recurring))
    );
    if (!price) {
      const priceParams = {
        product: product.id,
        unit_amount: sku.price_cents,
        currency: 'usd',
      };
      if (sku.recurring) priceParams.recurring = { interval: sku.recurring };
      price = await stripe.prices.create(priceParams);
      console.log('       price created: ' + price.id + ' ($' + (sku.price_cents/100).toFixed(2) + (sku.recurring ? '/' + sku.recurring : ' once') + ')');
    } else {
      console.log('       price exists:  ' + price.id);
    }

    manifest.push({
      sku_id: sku.id,
      name: sku.name,
      product_id: product.id,
      price_id: price.id,
      price_cents: sku.price_cents,
      recurring: sku.recurring || '',
      active: sku.active,
      category: sku.category,
    });
  } catch (e) {
    console.log('FAIL  [' + sku.id + '] ' + e.message);
    results.failed++;
    results.errors.push({ sku: sku.id, error: e.message });
  }
}

// ── Write manifest CSV ──────────────────────────────────────────────────────
const notesDir = join(ROOT, 'Agency', 'ops', 'notes');
if (!existsSync(notesDir)) mkdirSync(notesDir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const csvPath = join(notesDir, `stripe-products-${today}.csv`);
const csvHeader = 'sku_id,name,product_id,price_id,price_cents,recurring,active,category';
const csvRows = manifest.map(m => [
  m.sku_id,
  `"${m.name.replace(/"/g, '""')}"`,
  m.product_id,
  m.price_id,
  m.price_cents,
  m.recurring,
  m.active,
  m.category,
].join(','));
writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'), 'utf8');

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('CREATED:  ' + results.created);
console.log('SKIPPED:  ' + results.skipped + ' (already existed)');
console.log('FAILED:   ' + results.failed);
console.log('MANIFEST: ' + csvPath);
console.log('═══════════════════════════════════════════════════════════════');

if (results.errors.length) {
  console.log('');
  console.log('Errors:');
  for (const e of results.errors) console.log('  [' + e.sku + '] ' + e.error);
}

console.log('');
console.log('NEXT STEPS:');
console.log('1. In landing-page checkout flows, point Stripe checkout to the price_id values in the CSV.');
console.log('2. edge-edge-297 is created INACTIVE — flip to active in Stripe dashboard AFTER attorney signs off.');
console.log('3. Test each checkout link end-to-end before public launch.');
