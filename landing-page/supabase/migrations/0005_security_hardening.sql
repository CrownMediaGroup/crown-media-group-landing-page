-- Security hardening migration (2026-05-16)
-- Run idempotently in Supabase SQL editor.
--
-- What this adds:
--   1. `churches.unsubscribed` + `unsubscribed_at` (Kingdom Reach campaign opt-out)
--   2. `music_orders.updated_at` (needed by the new music-intake rate-limiter)
--   3. `edge_bot_connection_attempts` (anomaly tracking for Alpaca connect)

-- ── KINGDOM REACH UNSUBSCRIBE ─────────────────────────────────────────────
alter table churches add column if not exists unsubscribed boolean not null default false;
alter table churches add column if not exists unsubscribed_at timestamptz;
create index if not exists churches_unsubscribed_idx on churches (unsubscribed) where unsubscribed = true;

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
