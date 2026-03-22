-- Run this in Supabase SQL Editor: supabase.com → your project → SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS ai_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  product_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  business_name TEXT,
  style TEXT,
  industry TEXT,
  error_msg TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES ai_orders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  asset_type TEXT,
  style TEXT,
  platform TEXT,
  width INTEGER,
  height INTEGER,
  prompt_used TEXT,
  ai_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Storage bucket (run in SQL editor too)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-generated', 'ai-generated', false)
ON CONFLICT (id) DO NOTHING;
