// schema.js — Kingdom Reach SQLite tables (additive against existing CRM DB)
export function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS churches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tier TEXT,
      name TEXT NOT NULL UNIQUE,
      denomination TEXT,
      address TEXT, city TEXT, state TEXT, zip TEXT,
      phone TEXT, website TEXT, pastor TEXT, email TEXT,
      instagram TEXT, facebook TEXT,
      size TEXT, social TEXT, fit TEXT,
      has_website INTEGER DEFAULT 0,
      status TEXT DEFAULT 'Not Contacted',
      recommended_tier TEXT,
      pipeline_value REAL DEFAULT 0,
      pain_points TEXT, interests TEXT, key_quotes TEXT,
      sentiment TEXT, budget TEXT, follow_up_date DATE,
      notes TEXT DEFAULT '',
      date_added DATETIME DEFAULT CURRENT_TIMESTAMP,
      workspace_id INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS kingdom_dispatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER REFERENCES churches(id),
      church_slug TEXT NOT NULL,
      transcript TEXT NOT NULL,
      extracted_json TEXT,
      website_path TEXT,
      proposal_path TEXT,
      email_draft_path TEXT,
      email_sent INTEGER DEFAULT 0,
      email_sent_at DATETIME,
      email_message_id TEXT,
      status TEXT DEFAULT 'pending',
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      workspace_id INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_churches_status       ON churches(status, workspace_id);
    CREATE INDEX IF NOT EXISTS idx_churches_tier         ON churches(tier);
    CREATE INDEX IF NOT EXISTS idx_churches_has_website  ON churches(has_website);
    CREATE INDEX IF NOT EXISTS idx_churches_recommended  ON churches(recommended_tier);
    CREATE INDEX IF NOT EXISTS idx_dispatches_church     ON kingdom_dispatches(church_id);
    CREATE INDEX IF NOT EXISTS idx_dispatches_status     ON kingdom_dispatches(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_dispatches_slug       ON kingdom_dispatches(church_slug);
  `);

  // Additive columns — safe against existing production table
  const cols = db.prepare('PRAGMA table_info(kingdom_dispatches)').all().map(c => c.name);
  if (!cols.includes('followup_1_sent')) db.exec('ALTER TABLE kingdom_dispatches ADD COLUMN followup_1_sent INTEGER DEFAULT 0');
  if (!cols.includes('followup_2_sent')) db.exec('ALTER TABLE kingdom_dispatches ADD COLUMN followup_2_sent INTEGER DEFAULT 0');

  // Additive email tracking columns on churches table
  const cc = db.prepare('PRAGMA table_info(churches)').all().map(c => c.name);
  if (!cc.includes('email_sent'))         db.exec('ALTER TABLE churches ADD COLUMN email_sent INTEGER DEFAULT 0');
  if (!cc.includes('email_sent_at'))      db.exec('ALTER TABLE churches ADD COLUMN email_sent_at DATETIME');
  if (!cc.includes('email_opened'))       db.exec('ALTER TABLE churches ADD COLUMN email_opened INTEGER DEFAULT 0');
  if (!cc.includes('email_opened_at'))    db.exec('ALTER TABLE churches ADD COLUMN email_opened_at DATETIME');
  if (!cc.includes('follow_up_sent'))     db.exec('ALTER TABLE churches ADD COLUMN follow_up_sent INTEGER DEFAULT 0');
  if (!cc.includes('follow_up_sent_at'))  db.exec('ALTER TABLE churches ADD COLUMN follow_up_sent_at DATETIME');
  if (!cc.includes('replied'))            db.exec('ALTER TABLE churches ADD COLUMN replied INTEGER DEFAULT 0');
  if (!cc.includes('replied_at'))         db.exec('ALTER TABLE churches ADD COLUMN replied_at DATETIME');
  if (!cc.includes('org_type'))           db.exec("ALTER TABLE churches ADD COLUMN org_type TEXT DEFAULT 'church'");
  if (!cc.includes('unsubscribed'))       db.exec('ALTER TABLE churches ADD COLUMN unsubscribed INTEGER DEFAULT 0');
  if (!cc.includes('unsubscribed_at'))    db.exec('ALTER TABLE churches ADD COLUMN unsubscribed_at DATETIME');
  if (!cc.includes('email_bounced'))      db.exec('ALTER TABLE churches ADD COLUMN email_bounced INTEGER DEFAULT 0');
  if (!cc.includes('email_bounced_at'))   db.exec('ALTER TABLE churches ADD COLUMN email_bounced_at DATETIME');
  if (!cc.includes('breakup_sent'))       db.exec('ALTER TABLE churches ADD COLUMN breakup_sent INTEGER DEFAULT 0');
  if (!cc.includes('breakup_sent_at'))    db.exec('ALTER TABLE churches ADD COLUMN breakup_sent_at DATETIME');
  // Lead scoring (GAUGE Agent 43) + variant tracking columns
  if (!cc.includes('lead_score'))         db.exec('ALTER TABLE churches ADD COLUMN lead_score INTEGER DEFAULT 0');
  if (!cc.includes('lead_score_at'))      db.exec('ALTER TABLE churches ADD COLUMN lead_score_at DATETIME');

  // ── A/B Testing infrastructure (LABS Agent 38) ─────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_override TEXT,
      weight INTEGER DEFAULT 100,
      sent_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      UNIQUE(template, variant_id)
    );

    CREATE TABLE IF NOT EXISTS email_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      church_id INTEGER REFERENCES churches(id),
      template TEXT NOT NULL,
      variant_id TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      opened_at DATETIME,
      replied_at DATETIME,
      bounced_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_variants_template ON email_variants(template, active);
    CREATE INDEX IF NOT EXISTS idx_sends_church      ON email_sends(church_id);
    CREATE INDEX IF NOT EXISTS idx_sends_variant     ON email_sends(template, variant_id);
  `);

  // Seed 5 subject variants per high-volume template (LABS auto-A/B at send time)
  const seedVariant = db.prepare('INSERT OR IGNORE INTO email_variants (template, variant_id, subject, weight, notes) VALUES (?, ?, ?, ?, ?)');

  // breakup_warm — short, lowercase, no punctuation (Adam Robinson 2026 pattern)
  seedVariant.run('breakup_warm', 'v1', 'One last note for ${name} — and a small gift on the way out', 100, 'original hardcoded');
  seedVariant.run('breakup_warm', 'v2', 'closing the loop on ${name}', 100, 'short lowercase, low pressure');
  seedVariant.run('breakup_warm', 'v3', 'last note + a gift for ${name}', 100, 'gift hook upfront');
  seedVariant.run('breakup_warm', 'v4', 'quick q before i stop reaching out', 100, 'curiosity gap');
  seedVariant.run('breakup_warm', 'v5', 'one final thing for ${name}', 100, 'finality framing');

  // follow_up_cold — Touch-2 cold (no open)
  seedVariant.run('follow_up_cold', 'v1', 'One question about ${name}', 100, 'original hardcoded');
  seedVariant.run('follow_up_cold', 'v2', 'quick q about ${name}', 100, 'lowercase Adam Robinson pattern');
  seedVariant.run('follow_up_cold', 'v3', 'small idea for ${name}', 100, 'curiosity + benefit');
  seedVariant.run('follow_up_cold', 'v4', 'noticed something at ${name}', 100, 'attention hook');
  seedVariant.run('follow_up_cold', 'v5', '${name} — 90 seconds', 100, 'time-bounded ask');

  // follow_up_opener — Touch-2 opener (they peeked)
  seedVariant.run('follow_up_opener', 'v1', 'Quick follow-up — saw you took a look', 100, 'original hardcoded');
  seedVariant.run('follow_up_opener', 'v2', 'saw you read my note', 100, 'direct acknowledgment lowercase');
  seedVariant.run('follow_up_opener', 'v3', 'sending the 1-pager for ${name}', 100, 'assumes they want it');
  seedVariant.run('follow_up_opener', 'v4', '${name} concept ready', 100, 'product-frame');
  seedVariant.run('follow_up_opener', 'v5', 'thanks for opening', 100, 'gratitude + curiosity');

  // ── Workspace-level settings (single-tenant: key/value pairs) ──────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed defaults idempotently
  const seedSetting = db.prepare('INSERT OR IGNORE INTO workspace_settings (key, value) VALUES (?, ?)');
  seedSetting.run('outreach_paused', 'false');
  seedSetting.run('last_reply_poll_at', '');
  seedSetting.run('safety_pause_reason', '');
}

export function slugify(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'church';
}
