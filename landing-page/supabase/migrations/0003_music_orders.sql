-- Kingdom Sound — per-project order model (replaces the deprecated music_subscriptions workflow)
-- Run idempotently in Supabase SQL editor.

create table if not exists music_orders (
  id                bigserial primary key,
  user_email        text not null,
  product_id        text not null,                                  -- music-license-150, music-custom-500, music-bundle-2500, etc
  product_type      text not null,                                  -- license | custom | original | bundle
  amount_cents      integer not null,
  stripe_session_id text unique,
  stripe_payment_intent text,
  status            text not null default 'pending',                -- pending | paid | delivered | refunded
  -- For Service 1 (catalog license): the track being licensed
  track_id          bigint references music_tracks(id) on delete set null,
  -- For Service 2/3 (custom/original): intake form responses
  intake_brief      text,
  intake_metadata   jsonb,                                          -- { mood, bpm, genre, reference_url, deadline, etc. }
  -- Delivery artifacts
  delivered_track_id bigint references music_tracks(id) on delete set null,
  license_pdf_path  text,
  delivery_email_sent_at timestamptz,
  -- Timestamps
  created_at        timestamptz not null default now(),
  paid_at           timestamptz,
  delivered_at      timestamptz,
  notes             text
);

create index if not exists music_orders_email_idx       on music_orders (user_email);
create index if not exists music_orders_status_idx      on music_orders (status);
create index if not exists music_orders_type_idx        on music_orders (product_type);
create index if not exists music_orders_track_idx       on music_orders (track_id);

-- Extend music_tracks with per-track pricing fields (per-project model)
alter table music_tracks add column if not exists price_cents integer;
alter table music_tracks add column if not exists license_tier text default 'standard';   -- standard | premium | signature
update music_tracks set price_cents = 15000 where price_cents is null and tier_required = 'starter';
update music_tracks set price_cents = 29700 where price_cents is null and tier_required = 'pro';
update music_tracks set price_cents = 49700 where price_cents is null and tier_required = 'studio';

alter table music_orders enable row level security;

drop policy if exists "service-role-full-orders" on music_orders;
create policy "service-role-full-orders"
  on music_orders for all to service_role using (true) with check (true);

-- Done.
