// seed.js — Idempotent church seeder pulling from Agency/ops/outreach/build-church-list.js
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

export function seedChurches(db) {
  const seedPath = join(__dirname, '..', '..', 'Agency', 'ops', 'outreach', 'build-church-list.js');
  if (!existsSync(seedPath)) {
    console.warn('[Kingdom Reach] Church seed file missing:', seedPath);
    return;
  }

  let churches;
  try {
    const mod = require(seedPath);
    churches = Array.isArray(mod) ? mod : (mod.churches || mod.default || []);
  } catch (e) {
    console.warn('[Kingdom Reach] Failed to load church seed:', e.message);
    return;
  }

  if (!Array.isArray(churches) || churches.length === 0) {
    console.warn('[Kingdom Reach] Church seed empty — skipping');
    return;
  }

  const existing = db.prepare('SELECT COUNT(*) as c FROM churches').get();
  if (existing.c >= churches.length) {
    console.log(`[Kingdom Reach] Churches already seeded — ${existing.c} loaded`);
    return;
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO churches
      (tier, name, denomination, address, city, state, zip,
       phone, website, pastor, email, instagram, facebook,
       size, social, fit, has_website, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  db.exec('BEGIN');
  for (const c of churches) {
    const has = c.website && String(c.website).trim().length > 0 ? 1 : 0;
    insert.run(
      c.tier || '',           c.name || '',          c.denomination || '',
      c.address || '',        c.city || '',          c.state || '',         c.zip || '',
      c.phone || '',          c.website || '',       c.pastor || '',        c.email || '',
      c.instagram || '',      c.facebook || '',
      c.size || '',           c.social || '',        c.fit || '',
      has,                    c.notes || '',
    );
  }
  db.exec('COMMIT');

  const total      = db.prepare('SELECT COUNT(*) as c FROM churches').get().c;
  const noWebsite  = db.prepare('SELECT COUNT(*) as c FROM churches WHERE has_website = 0').get().c;
  console.log(`[Kingdom Reach] Seeded ${total} churches (priority targets — no website: ${noWebsite})`);
}
