-- Kingdom Edge — AI trading intelligence schema
-- Run this in the Supabase SQL editor. Idempotent.
-- All tables use RLS — server-side access via SERVICE_ROLE_KEY only.
--
-- LEGAL: Kingdom Edge is an educational/research tool. It does NOT execute
-- trades on behalf of users. No data in these tables is "investment advice."

-- ── WATCHLISTS ─────────────────────────────────────────────────────────────
create table if not exists edge_watchlists (
  id            bigserial primary key,
  user_email    text not null,
  product_id    text not null,                            -- e.g. edge-watch-37
  stripe_sub_id text,
  name          text not null default 'My Watchlist',
  symbols       text[] not null default '{}',             -- e.g. ['AAPL','MSFT','BTC-USD']
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists edge_watchlists_email_idx on edge_watchlists (user_email);
create index if not exists edge_watchlists_active_idx on edge_watchlists (active) where active = true;

-- ── SETUPS (alert conditions on a symbol or watchlist) ────────────────────
create table if not exists edge_setups (
  id              bigserial primary key,
  watchlist_id    bigint not null references edge_watchlists(id) on delete cascade,
  setup_type      text not null,                          -- price_cross | ma_cross | pct_change | volume_spike
  symbol          text not null,
  conditions      jsonb not null default '{}'::jsonb,     -- e.g. {"target_price":4500,"direction":"above"}
  active          boolean not null default true,
  last_triggered  timestamptz,
  cooldown_min    integer not null default 60,            -- silence after trigger
  created_at      timestamptz not null default now()
);

create index if not exists edge_setups_symbol_idx on edge_setups (symbol);
create index if not exists edge_setups_active_idx on edge_setups (active) where active = true;

-- ── ALERTS (history of fires) ─────────────────────────────────────────────
create table if not exists edge_alerts (
  id            bigserial primary key,
  user_email    text not null,
  setup_id      bigint references edge_setups(id) on delete set null,
  symbol        text,
  message       text not null,
  payload       jsonb,                                    -- price snapshot, conditions met, etc.
  triggered_at  timestamptz not null default now(),
  delivered_via text,                                     -- email | sms | dashboard
  opened_at     timestamptz
);

create index if not exists edge_alerts_email_idx on edge_alerts (user_email, triggered_at desc);

-- ── BRIEFS (generated daily/midday/close summaries) ───────────────────────
create table if not exists edge_briefs (
  id            bigserial primary key,
  brief_type    text not null,                            -- morning | midday | close
  brief_date    date not null default current_date,
  content_html  text not null,
  content_text  text not null,
  summary       text,
  symbols       text[] default '{}',                      -- which symbols got coverage
  created_at    timestamptz not null default now(),
  unique (brief_type, brief_date)
);

create index if not exists edge_briefs_date_idx on edge_briefs (brief_date desc);

-- ── BRIEF DELIVERIES (per-user delivery log) ──────────────────────────────
create table if not exists edge_brief_deliveries (
  id            bigserial primary key,
  user_email    text not null,
  brief_id      bigint not null references edge_briefs(id) on delete cascade,
  delivered_at  timestamptz not null default now(),
  opened_at     timestamptz,
  unique (user_email, brief_id)
);

create index if not exists edge_brief_deliveries_email_idx on edge_brief_deliveries (user_email, delivered_at desc);

-- ── ROW-LEVEL SECURITY ─────────────────────────────────────────────────────
alter table edge_watchlists         enable row level security;
alter table edge_setups             enable row level security;
alter table edge_alerts             enable row level security;
alter table edge_briefs             enable row level security;
alter table edge_brief_deliveries   enable row level security;

drop policy if exists "service-role-full-watchlists" on edge_watchlists;
create policy "service-role-full-watchlists"
  on edge_watchlists for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-setups" on edge_setups;
create policy "service-role-full-setups"
  on edge_setups for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-alerts" on edge_alerts;
create policy "service-role-full-alerts"
  on edge_alerts for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-briefs" on edge_briefs;
create policy "service-role-full-briefs"
  on edge_briefs for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-deliveries" on edge_brief_deliveries;
create policy "service-role-full-deliveries"
  on edge_brief_deliveries for all to service_role using (true) with check (true);

-- Done.
