// database.js — SQLite setup using Node.js built-in node:sqlite (no compilation needed)
import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { existsSync, mkdirSync } from 'fs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || __dirname;
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
const DB_PATH = join(dataDir, 'crm.db');

export const db = new DatabaseSync(DB_PATH);

// ── Schema ─────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    business      TEXT,
    phone         TEXT,
    email         TEXT,
    source        TEXT DEFAULT 'NxLevel',
    priority      TEXT DEFAULT 'Normal',
    status        TEXT DEFAULT 'Not Contacted',
    last_contacted DATE,
    next_followup  DATE,
    notes         TEXT DEFAULT '',
    ai_notes      TEXT DEFAULT '',
    deal_value    REAL DEFAULT 0,
    archived      INTEGER DEFAULT 0,
    workspace_id  INTEGER DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS interactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER NOT NULL REFERENCES contacts(id),
    type       TEXT NOT NULL,
    date       DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes      TEXT DEFAULT '',
    outcome    TEXT DEFAULT 'Neutral'
  );

  CREATE TABLE IF NOT EXISTS messages_sent (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER REFERENCES contacts(id),
    type       TEXT NOT NULL,
    subject    TEXT,
    body       TEXT,
    sent_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    status     TEXT DEFAULT 'sent'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    primary_color TEXT DEFAULT '#C9A84C',
    logo_url      TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT DEFAULT 'rep',
    workspace_id  INTEGER REFERENCES workspaces(id),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    token        TEXT UNIQUE NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    workspace_id INTEGER NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at   DATETIME NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id   INTEGER NOT NULL REFERENCES contacts(id),
    tag          TEXT NOT NULL,
    color        TEXT DEFAULT '#C9A84C',
    workspace_id INTEGER NOT NULL,
    UNIQUE(contact_id, tag)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id   INTEGER REFERENCES contacts(id),
    title        TEXT NOT NULL,
    due_date     DATE,
    completed    INTEGER DEFAULT 0,
    workspace_id INTEGER NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Maintenance Requests ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS maintenance_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    website     TEXT,
    description TEXT NOT NULL,
    priority    TEXT DEFAULT 'Normal',
    status      TEXT DEFAULT 'open',
    notes       TEXT DEFAULT '',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
  );
  CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status, created_at);
`);

// ── Runtime column additions for maintenance_requests (traffic light system) ──
const _maintCols = db.prepare('PRAGMA table_info(maintenance_requests)').all().map(r => r.name);
if (!_maintCols.includes('traffic_light'))  db.exec("ALTER TABLE maintenance_requests ADD COLUMN traffic_light TEXT DEFAULT 'yellow'");
if (!_maintCols.includes('ai_category'))    db.exec("ALTER TABLE maintenance_requests ADD COLUMN ai_category TEXT DEFAULT ''");
if (!_maintCols.includes('confirm_token'))  db.exec("ALTER TABLE maintenance_requests ADD COLUMN confirm_token TEXT DEFAULT ''");

// ── Campaigns (NxLevel outreach + future) ─────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    status       TEXT DEFAULT 'draft',
    workspace_id INTEGER DEFAULT 1,
    calendly_link TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS campaign_contacts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id     INTEGER NOT NULL REFERENCES campaigns(id),
    contact_id      INTEGER NOT NULL REFERENCES contacts(id),
    current_step    INTEGER DEFAULT 0,
    enrolled_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_sent_at    DATETIME,
    status          TEXT DEFAULT 'active',
    ai_observations TEXT,
    UNIQUE(campaign_id, contact_id)
  );
`);

// ── SMS Conversation Inbox (2-way messaging) ──────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS sms_inbox (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id   INTEGER REFERENCES contacts(id),
    from_number  TEXT NOT NULL,
    to_number    TEXT NOT NULL,
    body         TEXT NOT NULL,
    direction    TEXT NOT NULL DEFAULT 'inbound',
    twilio_sid   TEXT,
    read_at      DATETIME,
    workspace_id INTEGER DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_sms_inbox_contact ON sms_inbox(contact_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sms_inbox_from    ON sms_inbox(from_number);
  CREATE INDEX IF NOT EXISTS idx_sms_inbox_unread  ON sms_inbox(workspace_id, direction, read_at);
`);

// ── Password Reset Tokens ─────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    token      TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used       INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Review Requests (auto-send after Closed Won) ─────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS review_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id   INTEGER REFERENCES contacts(id),
    workspace_id INTEGER DEFAULT 1,
    sent_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    method       TEXT,
    status       TEXT DEFAULT 'sent'
  );
`);

// ── Crown Scout Program ───────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS scouts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    phone           TEXT DEFAULT '',
    referral_code   TEXT UNIQUE NOT NULL,
    status          TEXT DEFAULT 'active',
    tier            TEXT DEFAULT 'standard',
    total_referrals INTEGER DEFAULT 0,
    total_earned    REAL DEFAULT 0,
    joined_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS referrals (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    scout_id          INTEGER NOT NULL REFERENCES scouts(id),
    contact_id        INTEGER REFERENCES contacts(id),
    referred_business TEXT DEFAULT '',
    referred_email    TEXT DEFAULT '',
    status            TEXT DEFAULT 'pending',
    contract_value    REAL DEFAULT 0,
    commission_amount REAL DEFAULT 50,
    paid_out          INTEGER DEFAULT 0,
    paid_at           DATETIME,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_scouts_code    ON scouts(referral_code);
  CREATE INDEX IF NOT EXISTS idx_scouts_status  ON scouts(status);
  CREATE INDEX IF NOT EXISTS idx_referrals_scout ON referrals(scout_id);
  CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status, paid_out);
`);

// ── Runtime column additions for scouts (payment info) ───────────────────────
const _scoutPayCols = db.prepare('PRAGMA table_info(scouts)').all().map(r => r.name);
if (!_scoutPayCols.includes('payment_method'))    db.exec("ALTER TABLE scouts ADD COLUMN payment_method TEXT DEFAULT ''");
if (!_scoutPayCols.includes('payment_handle'))    db.exec("ALTER TABLE scouts ADD COLUMN payment_handle TEXT DEFAULT ''");
if (!_scoutPayCols.includes('payment_updated_at')) db.exec("ALTER TABLE scouts ADD COLUMN payment_updated_at DATETIME");

// ── Runtime column additions for referrals (payout protection + refund) ───────
const _refCols = db.prepare('PRAGMA table_info(referrals)').all().map(r => r.name);
if (!_refCols.includes('refund_status'))      db.exec("ALTER TABLE referrals ADD COLUMN refund_status TEXT DEFAULT ''");
if (!_refCols.includes('payout_hold'))        db.exec("ALTER TABLE referrals ADD COLUMN payout_hold INTEGER DEFAULT 0");
if (!_refCols.includes('payout_eligible_at')) db.exec("ALTER TABLE referrals ADD COLUMN payout_eligible_at DATETIME");

// ── Runtime column addition: referred_by_scout on contacts ────────────────────
const _scoutCols = db.prepare('PRAGMA table_info(contacts)').all().map(r => r.name);
if (!_scoutCols.includes('referred_by_scout')) db.exec("ALTER TABLE contacts ADD COLUMN referred_by_scout TEXT DEFAULT ''");

// ── Indexes (safe — CREATE INDEX IF NOT EXISTS) ───────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_contacts_workspace    ON contacts(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_status       ON contacts(workspace_id, status);
  CREATE INDEX IF NOT EXISTS idx_contacts_priority     ON contacts(workspace_id, priority);
  CREATE INDEX IF NOT EXISTS idx_contacts_last_contact ON contacts(workspace_id, last_contacted);
  CREATE INDEX IF NOT EXISTS idx_contacts_archived     ON contacts(workspace_id, archived);
  CREATE INDEX IF NOT EXISTS idx_interactions_contact  ON interactions(contact_id);
  CREATE INDEX IF NOT EXISTS idx_interactions_date     ON interactions(date);
  CREATE INDEX IF NOT EXISTS idx_messages_contact      ON messages_sent(contact_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token        ON sessions(token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user         ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_expires      ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_tags_contact          ON tags(contact_id, workspace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_workspace       ON tasks(workspace_id, completed);
  CREATE INDEX IF NOT EXISTS idx_tasks_contact         ON tasks(contact_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_due             ON tasks(due_date, completed);
  CREATE INDEX IF NOT EXISTS idx_campaign_contacts     ON campaign_contacts(campaign_id, status);
  CREATE INDEX IF NOT EXISTS idx_campaign_step         ON campaign_contacts(campaign_id, current_step, last_sent_at);
`);

// ── Runtime column additions (safe for existing DB) ───────────────────────────
const _cols = db.prepare('PRAGMA table_info(contacts)').all().map(r => r.name);
if (!_cols.includes('archived'))     db.exec('ALTER TABLE contacts ADD COLUMN archived INTEGER DEFAULT 0');
if (!_cols.includes('deal_value'))   db.exec('ALTER TABLE contacts ADD COLUMN deal_value REAL DEFAULT 0');
if (!_cols.includes('workspace_id')) {
  db.exec('ALTER TABLE contacts ADD COLUMN workspace_id INTEGER DEFAULT 1');
  db.exec('UPDATE contacts SET workspace_id = 1 WHERE workspace_id IS NULL');
}

// ── Runtime column additions for messages_sent (email tracking) ───────────────
const _msgCols = db.prepare('PRAGMA table_info(messages_sent)').all().map(r => r.name);
if (!_msgCols.includes('track_token')) db.exec('ALTER TABLE messages_sent ADD COLUMN track_token TEXT');
if (!_msgCols.includes('open_count'))  db.exec('ALTER TABLE messages_sent ADD COLUMN open_count INTEGER DEFAULT 0');
if (!_msgCols.includes('opened_at'))   db.exec('ALTER TABLE messages_sent ADD COLUMN opened_at DATETIME');
if (!_msgCols.includes('clicked_at'))  db.exec('ALTER TABLE messages_sent ADD COLUMN clicked_at DATETIME');

// ── Runtime column additions for workspaces (subscription tracking) ───────────
const _wsCols = db.prepare('PRAGMA table_info(workspaces)').all().map(r => r.name);
if (!_wsCols.includes('trial_ends_at'))        db.exec("ALTER TABLE workspaces ADD COLUMN trial_ends_at DATETIME");
if (!_wsCols.includes('subscription_status'))  db.exec("ALTER TABLE workspaces ADD COLUMN subscription_status TEXT DEFAULT 'trial'");
if (!_wsCols.includes('subscription_ends_at')) db.exec("ALTER TABLE workspaces ADD COLUMN subscription_ends_at DATETIME");

// ── Runtime column additions for users (Google OAuth) ─────────────────────────
const _userCols = db.prepare('PRAGMA table_info(users)').all().map(r => r.name);
if (!_userCols.includes('google_id'))    db.exec("ALTER TABLE users ADD COLUMN google_id TEXT");
if (!_userCols.includes('display_name')) db.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
if (!_userCols.includes('avatar_url'))   db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");

// ── Seed default workspace ────────────────────────────────────────────────────
db.prepare(`INSERT OR IGNORE INTO workspaces (id, name, primary_color) VALUES (1, 'Crown Media Group', '#C9A84C')`).run();
// King's workspace is always active — no trial restrictions
db.prepare(`UPDATE workspaces SET subscription_status = 'active' WHERE id = 1`).run();

// ── Default settings ───────────────────────────────────────────────────────────

const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
insertSetting.run('owner_name',  'King');
insertSetting.run('agency_name', 'Crown Media Group');
insertSetting.run('website',     'crownmediagroup.co');
insertSetting.run('daily_goal',  '10');

// ── Seed contacts ─────────────────────────────────────────────────────────────

const count = db.prepare('SELECT COUNT(*) as c FROM contacts').get();
if (count.c === 0) {
  const insert = db.prepare(`
    INSERT INTO contacts (id, name, business, phone, email, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const contacts = [
    [1,  'Chelsea Johnson',          'W.E.A.L with Chelsea J. LLC',                '(803)430-6544', 'wealwithchelseaj@gmail.com',           'NxLevel', ''],
    [2,  'Angelica Thomas',           'Artzipants',                                 '(839)223-7594', 'thomas.angelica702@gmail.com',         'NxLevel', ''],
    [3,  'Louis David Domond',        'All Glory to Jesus Global (ME)',              '(908)848-1436', 'ldavid226@gmail.com',                  'NxLevel', 'This is me. Skip for outreach.'],
    [4,  'Ebony Goodson',             'Velvet Esthetics Lounge',                    '(803)422-9815', 'ttwabh@yahoo.com',                     'NxLevel', ''],
    [5,  'Chrishonna Sutton',         'We Like 2 Party LLC',                        '(803)800-0968', 'welike2party803@gmail.com',            'NxLevel', ''],
    [6,  'Charlene Sims',             'Time Is of the Essence LLC',                 '(803)979-2071', 'charlenesims@bellsouth.net',           'NxLevel', ''],
    [7,  'Kristina Houseworth',       'Nex Gen Media',                              '(843)789-9864', 'kristinahouseworth@gmail.com',         'NxLevel', 'Also in media — potential partner or referral.'],
    [8,  'Deshana Washington',        'Slime Lab LLC',                              '(803)319-3947', 'slimelabsc@gmail.com',                 'NxLevel', ''],
    [9,  'Renee Lyons',               'Reverent Consulting Marketing & Design',     '(803)212-5450', 'lola.lyon@icloud.com',                 'NxLevel', 'Also in marketing — possible referral partner.'],
    [10, 'Pedro Morales-Llanos',      'Strategic Rise Advisory Group LLC',          '(803)203-1672', 'info@strategicadvisorygroup.com',      'NxLevel', ''],
    [11, 'James Moore',               'AMPS Facility Solutions LLP',                '(850)750-9062', 'jamesmoore@ampsfacilitysolutions.com', 'NxLevel', ''],
    [12, 'Stephanie McCummings',      'Unknown',                                    '(803)497-2103', 'mccummings.stephanie@icloud.com',      'NxLevel', ''],
    [13, 'Clorise Haynes',            'Honey Honey Cakes LLC',                      '(803)312-3939', 'cloenic27@gmail.com',                  'NxLevel', 'Food business — strong social media potential.'],
    [14, 'Shakira Simmons',           'IAM Professional Services',                  '(407)491-9018', 'kingdomchozen@gmail.com',              'NxLevel', 'Email handle kingdomchozen — faith-aligned.'],
    [15, 'Carolyn Collins',           'Collins Bakery (The Crumb Master)',           '(803)422-8392', 'cscollins67@icloud.com',               'NxLevel', 'Bakery — great social content potential.'],
    [16, 'Teliana Rice',              'Viral Pathway Home Health',                   '(803)995-2137', 'TelianaR18@gmail.com',                 'NxLevel', 'Healthcare — Viral Pathway suggests marketing awareness.'],
    [17, 'Michael Hill',              'Mental Hillness',                             '(803)445-8114', 'mentalhillness24@gmail.com',           'NxLevel', 'Mental health brand — strong content play.'],
    [18, 'Tatia Toney',               'Project Refresh',                            '(913)952-4402', 'projectfreshsc@gmail.com',             'NxLevel', ''],
    [19, 'Katrina Dewberry',          'The Way UP C3S LLC',                         '(803)307-8923', 'katrina@thewayupc3s.com',              'NxLevel', 'Has own domain — slightly more established.'],
    [20, 'LaToya Bullard',            "Ms. B's Learning Bees",                      '(772)713-4130', 'latoya.bullard@yahoo.com',             'NxLevel', 'Education business — parent/community audience.'],
    [21, 'Ayanna Thomas',             'Arie Venture Holdings LLC',                  '(803)833-7168', 'a.thomas2183@gmail.com',               'NxLevel', 'Holding company — potentially multiple businesses to serve.'],
    [22, "Y'ticcia Williams",         "Dollarson's Den Counseling & Consulting LLC", '(803)319-7480', 'theddccllc@gmail.com',                'NxLevel', 'Counseling — professional credibility focus.'],
    [23, 'Victoria Marshall',         'Unknown',                                    '(803)201-8327', 'victoria.r.marshall02@gmail.com',      'NxLevel', ''],
    [24, 'Lee Livingston',            'Leliv By Lee LLC',                           '(803)920-3496', 'lelivbylee@gmail.com',                 'NxLevel', 'Personal brand vibe — lifestyle or fashion possible.'],
    [25, 'Barry Elmore',              'Unknown',                                    '(803)403-5119', 'hawtigger11@gmail.com',                'NxLevel', ''],
    [26, 'Nikki Washington',          'Secure Diagnostic Results LLC',              '(803)406-2960', 'nikki.washington78@gmail.com',         'NxLevel', 'Healthcare/diagnostics.'],
    [27, 'DeMarcus Wilson',           'Fly Forever Music Group LLC',                '(803)269-2310', 'flyforevermusicgroup@gmail.com',       'NxLevel', 'Music — strong content/social media needs.'],
    [28, 'Myia Peterson',             "At Kira's",                                  '(803)716-4101', 'atkiras803@gmail.com',                 'NxLevel', ''],
    [29, 'Lakasha Martin',            "Pressed'bout'Me LLC",                        '(803)846-6206', 'martinlakasha@gmail.com',              'NxLevel', 'Hair/beauty — great social content opportunity.'],
    [30, 'Bridgette Williams',        'Benchmark Health Screening LLC',             '(803)807-1868', 'benchmarkhealthscreeningllc@gmail.com','NxLevel', 'Healthcare screening.'],
    [31, 'Tanisha Parker',            'The Imara Group LLC',                        '(803)605-8714', 'tanisha.parker@yahoo.com',             'NxLevel', ''],
    [32, 'Kathryn Ray',               'Unknown',                                    '(803)467-1881', 'kathi.ray@gmail.com',                  'NxLevel', ''],
    [33, 'Samone Stokes',             'The Saj Collective',                         '(803)243-0808', 'samonesstokes@gmail.com',              'NxLevel', 'Collective — possibly creative or community focus.'],
    [34, 'Zoe Glenn',                 'Flour & Flow by Zo LLC',                     '(803)626-4291', 'flourflowbyzo@gmail.com',              'NxLevel', 'Baked goods brand — amazing social content potential. High priority.'],
    [35, 'Sherri Livingston',         "Sherri's Creations Fiber Arts",              '(803)479-7504', 'shug1959@yahoo.com',                   'NxLevel', 'Handmade crafts — Etsy/Instagram audience.'],
    [36, 'Kayla Major',               'Krave',                                      '(219)688-7831', 'kaylamajor228@gmail.com',              'NxLevel', 'Short punchy brand name — food or lifestyle.'],
    [37, 'Brittney Griffin',          'Unknown',                                    '(803)323-8648', 'brittneyg94@gmail.com',                'NxLevel', ''],
    [38, 'Krystal House',             'K House Enterprise',                         '(803)386-5475', 'kmhousemtc@yahoo.com',                 'NxLevel', ''],
    [39, 'Artellia Shaw',             'Occasions Catering',                         '(803)221-2022', 'aka119561@gmail.com',                  'NxLevel', 'Catering — events + social content goldmine.'],
    [40, "I'Anna Osborne",            'A1 Laboratory Solutions',                    '(803)477-0698', 'osborne.iannat@gmail.com',             'NxLevel', 'Lab/diagnostic services.'],
  ];

  db.exec('BEGIN');
  for (const row of contacts) insert.run(...row);
  db.exec('COMMIT');

  console.log('[CRM] Seeded 40 NxLevel contacts');
} else {
  console.log(`[CRM] Database ready — ${count.c} contacts loaded`);
}

export default db;
