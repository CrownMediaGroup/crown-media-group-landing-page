-- Security hardening migration (2026-05-16) — SUPABASE PORTION ONLY
-- Run idempotently in Supabase SQL editor.
--
-- What this adds to Supabase (allglory-agency project):
--   1. `music_orders.updated_at` (needed by the new music-intake rate-limiter)
--   2. `edge_bot_connection_attempts` (anomaly tracking for Alpaca connect)
--
-- NOTE: `churches.unsubscribed` is NOT in Supabase — it lives on the
-- Fly.io CRM SQLite database and is added by tools/kingdom-reach/schema.js
-- on every CRM startup (auto-applied on next deploy).

-- ── MUSIC ORDERS — updated_at for rate-limit + intake updates ─────────────
alter table music_orders add column if not exists updated_at timestamptz not null default now();

-- Backfill any existing rows (idempotent)
update music_orders set updated_at = coalesce(updated_at, created_at) where updated_at is null;

-- ── EDGE BOT CONNECTION ATTEMPTS — audit log for Alpaca connect anomalies ─
create table if not exists edge_bot_connection_attempts (
  id            bigserial primary key,
  user_email    text not null,
  requester_ip  text,
  mode          text,
  success       boolean not null default false,
  error_reason  text,
  created_at    timestamptz not null default now()
);
create index if not exists edge_bot_connection_attempts_ip_idx on edge_bot_connection_attempts (requester_ip, created_at desc);
create index if not exists edge_bot_connection_attempts_email_idx on edge_bot_connection_attempts (user_email, created_at desc);

alter table edge_bot_connection_attempts enable row level security;
drop policy if exists "service-role-full-conn-attempts" on edge_bot_connection_attempts;
create policy "service-role-full-conn-attempts" on edge_bot_connection_attempts for all to service_role using (true) with check (true);

-- Done.
