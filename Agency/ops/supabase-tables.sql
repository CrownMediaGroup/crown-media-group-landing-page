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
