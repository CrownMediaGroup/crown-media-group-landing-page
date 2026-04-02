-- Crown Media Group — Supabase Tables
-- Run this in: https://pcikjtzvruvavaduawes.supabase.co → SQL Editor → New Query → Run
-- All Glory to Jesus Global LLC | 2026-03-17
-- ENV VAR NOTE: Use SUPABASE_SECRET_KEY (not SUPABASE_SERVICE_KEY) — that is the correct name in .env

-- ============================================
-- TABLE: clients
-- ============================================
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT DEFAULT 'Columbia, SC',
  tier TEXT CHECK (tier IN ('starter', 'growth', 'premium')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'churned')),
  monthly_rate INTEGER,
  setup_fee INTEGER,
  start_date DATE,
  notes TEXT
);

-- ============================================
-- TABLE: leads
-- ============================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  business_name TEXT NOT NULL,
  contact_name TEXT,
  contact_method TEXT CHECK (contact_method IN ('dm', 'in_person', 'referral', 'inbound', 'card')),
  platform TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'responded', 'call_booked', 'proposal_sent', 'closed_won', 'closed_lost')),
  notes TEXT,
  follow_up_date DATE
);

-- ============================================
-- TABLE: invoices
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  invoice_number TEXT UNIQUE,
  amount INTEGER NOT NULL,
  type TEXT CHECK (type IN ('setup', 'monthly', 'addon')),
  status TEXT DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'overdue', 'void')),
  due_date DATE,
  paid_date DATE,
  notes TEXT
);

-- ============================================
-- TABLE: onboarding_submissions
-- ============================================
CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  client_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  business_type TEXT,
  brand_colors TEXT,
  brand_style TEXT,
  logo_notes TEXT,
  form_response JSONB,
  logo_generated BOOLEAN DEFAULT FALSE,
  logo_urls TEXT[],
  king_approved BOOLEAN,
  client_delivered BOOLEAN DEFAULT FALSE
);

-- ============================================
-- ROW LEVEL SECURITY (enable but allow service key)
-- ============================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- Service role bypass (Railway server uses secret key — full access)
CREATE POLICY "allow_all_clients" ON clients FOR ALL USING (true);
CREATE POLICY "allow_all_leads" ON leads FOR ALL USING (true);
CREATE POLICY "allow_all_invoices" ON invoices FOR ALL USING (true);
CREATE POLICY "allow_all_onboarding" ON onboarding_submissions FOR ALL USING (true);

-- ============================================
-- TABLE: ai_orders
-- Tracks every AI Tools purchase end-to-end
-- ============================================
CREATE TABLE IF NOT EXISTS ai_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status_updated_at TIMESTAMPTZ DEFAULT NOW(),
  email TEXT NOT NULL,
  business_name TEXT,
  product_type TEXT NOT NULL CHECK (product_type IN ('logo-basic', 'banner-pack')),
  amount INTEGER,
  stripe_session_id TEXT UNIQUE,
  status TEXT DEFAULT 'awaiting_intake' CHECK (status IN (
    'awaiting_intake',  -- paid, form not submitted yet
    'processing',       -- form received, generating
    'logos_ready',      -- King has logos in email, awaiting review
    'completed',        -- King approved, delivered to client
    'failed',           -- something broke
    'abandoned'         -- paid but never filled form (24hr+)
  )),
  style TEXT,
  industry TEXT,
  error_msg TEXT
);

-- ============================================
-- TABLE: ai_assets
-- Stores generated logo/banner file references
-- ============================================
CREATE TABLE IF NOT EXISTS ai_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  order_id UUID REFERENCES ai_orders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  asset_type TEXT CHECK (asset_type IN ('logo', 'banner')),
  style TEXT,
  platform TEXT,
  width INTEGER,
  height INTEGER,
  prompt_used TEXT,
  ai_model TEXT
);

-- Storage bucket: ai-generated
-- Create this manually in Supabase → Storage → New bucket → "ai-generated" → Private

ALTER TABLE ai_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_ai_orders" ON ai_orders FOR ALL USING (true);
CREATE POLICY "allow_all_ai_assets" ON ai_assets FOR ALL USING (true);

-- ============================================
-- TABLE: portfolio_hidden
-- Persists deleted portfolio items across browsers/devices
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_hidden (
  item_id TEXT PRIMARY KEY,
  hidden_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE portfolio_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_portfolio_hidden" ON portfolio_hidden FOR ALL USING (true);
