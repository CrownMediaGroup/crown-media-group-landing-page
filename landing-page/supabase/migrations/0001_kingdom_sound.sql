-- Kingdom Sound — AI music library subscription schema
-- Run this in the Supabase SQL editor. Idempotent (safe to re-run).
-- All tables use RLS — server-side access via SERVICE_ROLE_KEY only.

-- ── TRACK CATALOG ──────────────────────────────────────────────────────────
create table if not exists music_tracks (
  id              bigserial primary key,
  title           text not null,
  genre           text not null,
  mood            text,
  bpm             integer,
  duration_sec    integer,
  storage_path    text not null,                          -- e.g. orders/music/<id>.mp3
  wav_path        text,
  stems_path      text,
  tier_required   text not null default 'starter',        -- starter | pro | studio
  source_platform text not null default 'suno',           -- suno | udio | aiva | other
  source_id       text,                                   -- platform-side track ID
  tags            text[] default '{}',
  description     text,
  public          boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists music_tracks_genre_idx on music_tracks (genre);
create index if not exists music_tracks_mood_idx  on music_tracks (mood);
create index if not exists music_tracks_tier_idx  on music_tracks (tier_required);
create index if not exists music_tracks_public_idx on music_tracks (public) where public = true;

-- ── DOWNLOAD LOG (drives monthly quota enforcement) ────────────────────────
create table if not exists music_downloads (
  id                bigserial primary key,
  user_email        text not null,
  product_id        text not null,                        -- e.g. music-license-150
  stripe_sub_id     text,
  track_id          bigint not null references music_tracks(id) on delete cascade,
  downloaded_at     timestamptz not null default now(),
  license_pdf_path  text                                  -- storage path of per-download license PDF
);

create index if not exists music_downloads_email_idx on music_downloads (user_email);
create index if not exists music_downloads_track_idx on music_downloads (track_id);

-- ── CUSTOM TRACK REQUESTS (Pro + Studio tier only) ─────────────────────────
create table if not exists music_custom_requests (
  id                  bigserial primary key,
  user_email          text not null,
  product_id          text not null,
  stripe_sub_id       text,
  brief               text not null,
  reference_track_url text,
  status              text not null default 'pending',    -- pending | in_progress | delivered | rejected
  delivered_track_id  bigint references music_tracks(id) on delete set null,
  requested_at        timestamptz not null default now(),
  delivered_at        timestamptz,
  notes               text
);

create index if not exists music_custom_requests_status_idx on music_custom_requests (status);
create index if not exists music_custom_requests_email_idx  on music_custom_requests (user_email);

-- ── TRACK DISPUTES (Content ID free-swap guarantee) ────────────────────────
create table if not exists music_track_disputes (
  id              bigserial primary key,
  user_email      text not null,
  track_id        bigint not null references music_tracks(id) on delete cascade,
  platform        text,                                   -- youtube | instagram | tiktok | other
  description     text,
  replacement_id  bigint references music_tracks(id) on delete set null,
  status          text not null default 'open',           -- open | resolved | rejected
  filed_at        timestamptz not null default now(),
  resolved_at     timestamptz
);

create index if not exists music_track_disputes_status_idx on music_track_disputes (status);

-- ── ROW-LEVEL SECURITY ─────────────────────────────────────────────────────
alter table music_tracks            enable row level security;
alter table music_downloads         enable row level security;
alter table music_custom_requests   enable row level security;
alter table music_track_disputes    enable row level security;

-- Public can read public catalog metadata (for preview cards on /music marketing surface)
drop policy if exists "anon-read-public-tracks" on music_tracks;
create policy "anon-read-public-tracks"
  on music_tracks for select to anon
  using (public = true);

-- Service role has full access (Netlify functions use SERVICE_ROLE_KEY)
drop policy if exists "service-role-full-tracks" on music_tracks;
create policy "service-role-full-tracks"
  on music_tracks for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-downloads" on music_downloads;
create policy "service-role-full-downloads"
  on music_downloads for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-custom" on music_custom_requests;
create policy "service-role-full-custom"
  on music_custom_requests for all to service_role using (true) with check (true);

drop policy if exists "service-role-full-disputes" on music_track_disputes;
create policy "service-role-full-disputes"
  on music_track_disputes for all to service_role using (true) with check (true);

-- ── STORAGE BUCKET ─────────────────────────────────────────────────────────
-- Create the bucket via Supabase Studio UI: bucket name = "kingdom-sound", private.
-- Or run from SQL (only on fresh DBs that have storage extension):
-- insert into storage.buckets (id, name, public) values ('kingdom-sound', 'kingdom-sound', false)
--   on conflict (id) do nothing;

-- Done.
