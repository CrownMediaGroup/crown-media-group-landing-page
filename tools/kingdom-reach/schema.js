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
