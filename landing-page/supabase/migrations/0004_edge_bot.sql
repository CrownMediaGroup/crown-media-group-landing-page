-- Kingdom Edge Bot — Alpaca brokerage connections + strategy assignments + execution log
-- Run idempotently in Supabase SQL editor.
--
-- LEGAL: Crown Media never has custody of customer funds. We store the user's Alpaca
-- API key (encrypted) and use it to fire trades on the user's own account.

-- ── BROKERAGE CONNECTIONS ─────────────────────────────────────────────────
create table if not exists edge_brokerage_connections (
  id                bigserial primary key,
  user_email        text not null unique,
  product_id        text not null,                              -- edge-trade-97 | edge-edge-297
  broker            text not null default 'alpaca',
  mode              text not null default 'paper',              -- paper | live
  api_key_id_enc    text not null,                              -- encrypted Alpaca key id
  api_secret_enc    text not null,                              -- encrypted Alpaca secret
  connected_at      timestamptz not null default now(),
  last_health_check timestamptz,
  health_status     text default 'unknown',                     -- ok | error | disconnected
  notes             text
);

create index if not exists edge_brokerage_email_idx on edge_brokerage_connections (user_email);

-- ── STRATEGY ASSIGNMENTS ──────────────────────────────────────────────────
create table if not exists edge_bot_strategies (
  id              bigserial primary key,
  user_email      text not null,
  strategy        text not null,                                -- trend_follow | mean_revert | breakout
  symbols         text[] not null default '{}',                 -- which symbols to apply the strategy to
  active          boolean not null default true,
  position_size_usd integer not null default 1000,              -- per-trade allocation
  max_open_positions integer not null default 3,
  started_at      timestamptz not null default now(),
  stopped_at      timestamptz,
  config          jsonb default '{}'::jsonb                     -- strategy-specific params
);

create index if not exists edge_bot_strategies_active_idx on edge_bot_strategies (active) where active = true;

-- ── EXECUTION LOG ─────────────────────────────────────────────────────────
create table if not exists edge_bot_executions (
  id              bigserial primary key,
  user_email      text not null,
  strategy_id     bigint references edge_bot_strategies(id) on delete set null,
  symbol          text not null,
  side            text not null,                                -- buy | sell
  qty             numeric not null,
  notional        numeric,
  order_id        text,                                         -- Alpaca order id
  status          text default 'submitted',                     -- submitted | filled | rejected | cancelled
  filled_price    numeric,
  signal_reason   text,                                         -- "SMA crossover", "oversold RSI", etc.
  mode            text default 'paper',
  executed_at     timestamptz not null default now(),
  notes           text
);

create index if not exists edge_bot_executions_email_idx on edge_bot_executions (user_email, executed_at desc);

-- ── DAILY ACCOUNT SNAPSHOTS (for P&L charts) ──────────────────────────────
create table if not exists edge_bot_snapshots (
  id              bigserial primary key,
  user_email      text not null,
  snapshot_date   date not null default current_date,
  equity          numeric,
  cash            numeric,
  buying_power    numeric,
  open_positions  jsonb,
  daily_pnl       numeric,
  cumulative_pnl  numeric,
  mode            text default 'paper',
  created_at      timestamptz not null default now(),
  unique (user_email, snapshot_date)
);

create index if not exists edge_bot_snapshots_email_idx on edge_bot_snapshots (user_email, snapshot_date desc);

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table edge_brokerage_connections enable row level security;
alter table edge_bot_strategies enable row level security;
alter table edge_bot_executions enable row level security;
alter table edge_bot_snapshots enable row level security;

drop policy if exists "service-role-full-brokerage" on edge_brokerage_connections;
create policy "service-role-full-brokerage" on edge_brokerage_connections for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-bot-strategies" on edge_bot_strategies;
create policy "service-role-full-bot-strategies" on edge_bot_strategies for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-bot-executions" on edge_bot_executions;
create policy "service-role-full-bot-executions" on edge_bot_executions for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-bot-snapshots" on edge_bot_snapshots;
create policy "service-role-full-bot-snapshots" on edge_bot_snapshots for all to service_role using (true) with check (true);

-- Done.
