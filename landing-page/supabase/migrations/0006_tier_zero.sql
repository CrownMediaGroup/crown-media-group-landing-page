-- Kingdom Edge Phase 2 — King's Tier-0 + kill-switch audit + trade journal
-- Run after 0005_security_hardening.sql. Idempotent.

-- 1) Add `tier` column to brokerage_connections. Tier-0 unlocks privileged strategies.
alter table edge_brokerage_connections
  add column if not exists tier text not null default 'paper';

-- Backfill from mode for existing rows
update edge_brokerage_connections set tier = mode
  where tier = 'paper' and mode in ('paper','live');

alter table edge_brokerage_connections
  drop constraint if exists edge_brokerage_connections_tier_check;
alter table edge_brokerage_connections
  add constraint edge_brokerage_connections_tier_check
  check (tier in ('paper','live','tier_zero'));

-- 2) Strategy-permission flag — which tier is required to RUN a given strategy assignment.
alter table edge_bot_strategies
  add column if not exists tier_required text not null default 'paper';
alter table edge_bot_strategies
  drop constraint if exists edge_bot_strategies_tier_check;
alter table edge_bot_strategies
  add constraint edge_bot_strategies_tier_check
  check (tier_required in ('paper','live','tier_zero'));

-- 3) Kill-switch audit log — every auto-flatten event recorded for review.
create table if not exists edge_kill_switches (
  id                   bigserial primary key,
  user_email           text not null,
  switch_name          text not null,       -- daily_loss | drawdown_5d | position_size | manual | pdt
  reason               text,                -- JSON-stringified gate detail
  positions_flattened  integer default 0,
  triggered_at         timestamptz not null default now(),
  recovered_at         timestamptz,
  recovered_by         text
);
create index if not exists edge_kill_switches_email_idx
  on edge_kill_switches (user_email, triggered_at desc);

-- 4) Trade journal — every decision recorded: signal + LLM oversight + risk check + context.
create table if not exists edge_trade_journal (
  id                       bigserial primary key,
  execution_id             bigint references edge_bot_executions(id) on delete cascade,
  user_email               text not null,
  symbol                   text not null,
  strategy                 text,
  signal_action            text,
  signal_reason            text,
  signal_confidence        numeric,
  llm_pre_trade_decision   text,            -- approve | block | not_called
  llm_pre_trade_reason     text,
  market_context           jsonb,           -- regime, sentiment, volatility at decision time
  risk_gates_passed        jsonb,
  recorded_at              timestamptz not null default now()
);
create index if not exists edge_trade_journal_email_idx
  on edge_trade_journal (user_email, recorded_at desc);
create index if not exists edge_trade_journal_execution_idx
  on edge_trade_journal (execution_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table edge_kill_switches enable row level security;
drop policy if exists "service-role-full-kill-switches" on edge_kill_switches;
create policy "service-role-full-kill-switches" on edge_kill_switches for all to service_role using (true) with check (true);

alter table edge_trade_journal enable row level security;
drop policy if exists "service-role-full-trade-journal" on edge_trade_journal;
create policy "service-role-full-trade-journal" on edge_trade_journal for all to service_role using (true) with check (true);

-- Done.
