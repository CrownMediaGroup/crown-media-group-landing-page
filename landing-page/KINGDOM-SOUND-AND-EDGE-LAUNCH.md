# Kingdom Sound + Kingdom Edge — Launch Handoff
Built 2026-05-13 · Status: code shipped, manual setup required to go live

This doc walks King through the manual steps to flip both services live. Everything else is already coded and pushed.

---

## SERVICE A — Kingdom Sound

### What's already built
- Pricing tiers (`$27` / `$67` / `$147` per month) in `create-subscription.mjs`
- Stripe checkout flow + `subscription_data.metadata` propagation
- Welcome email + subscriber-notification email on `checkout.session.completed`
- Library API: `GET /api/music-library` (paginated, filtered, gated by active sub)
- Download API: `POST /api/music-download` (signed URL, monthly quota enforcement)
- Custom track request API: `POST /api/music-custom-request` (Pro + Studio only)
- Marketing + member surface: `/music.html`
- DB schema: 4 tables in `landing-page/supabase/migrations/0001_kingdom_sound.sql`

### King's manual steps to launch

1. **Run the SQL migration** in Supabase
   - Open https://supabase.com/dashboard/project/pcikjtzvruvavaduawes → SQL Editor
   - Paste contents of `landing-page/supabase/migrations/0001_kingdom_sound.sql`
   - Run. (Idempotent — safe to re-run.)

2. **Create the `kingdom-sound` Storage bucket** (Supabase Studio → Storage → New bucket)
   - Name: `kingdom-sound`
   - Public: NO (private — signed URLs only)
   - File size limit: 50 MB (room for WAV)

3. **Subscribe to AI music platforms** (recurring monthly cost):
   - Suno Pro: $24/mo (https://suno.com)
   - Udio Pro: $30/mo (https://udio.com)
   - AIVA Pro: $33/mo (https://aiva.ai)
   - Verify each platform's terms grant commercial use AND third-party licensing rights. Suno's TOS explicitly grants this on Pro; verify Udio + AIVA before going live.

4. **Seed the catalog** — generate 100 starting tracks (10 each across 10 genres)
   - Recommended genres: cinematic, corporate, hip-hop, ambient, worship, upbeat, lo-fi, rock, electronic, R&B
   - Export each as MP3 (320 kbps) + WAV
   - Upload to the `kingdom-sound` bucket — path pattern: `tracks/<track-id>.mp3` and `.wav`
   - Insert each into `music_tracks` via Supabase Studio (Table Editor → music_tracks → Insert). Or batch via SQL.

5. **Test the full flow**
   - Use Stripe Test Mode keys. Subscribe to Starter via `/music.html`.
   - Click "Open Library" after redirect, enter the test email.
   - Search, filter, download a track — verify it lands.
   - Try 6th download → should hit `quota_exceeded` 429.

---

## SERVICE B — Kingdom Edge

### What's already built
- Pricing tiers (`$37` / `$97` / `$297` per month) in `create-subscription.mjs`
- Welcome email + default watchlist auto-created on subscription
- Watchlist CRUD API: `/api/edge-watchlist` (GET/POST/PATCH/DELETE)
- Dashboard data API: `GET /api/edge-dashboard` (one-shot fetch)
- Daily brief generator: `POST /api/edge-daily-brief` (Polygon + Claude + Resend)
- Marketing surface: `/edge.html`
- Member dashboard: `/edge/dashboard.html`
- Legal pages: `/edge/terms.html`, `/edge/disclaimers.html`, `/edge/risk-disclosure.html`
- DB schema: 5 tables in `landing-page/supabase/migrations/0002_kingdom_edge.sql`

### King's manual steps to launch

1. **Run the SQL migration** in Supabase
   - Paste contents of `landing-page/supabase/migrations/0002_kingdom_edge.sql` → Run.

2. **Get API keys** and add to Netlify environment variables:
   - `POLYGON_API_KEY` — sign up at https://polygon.io (Starter plan, $29/mo)
   - `ANTHROPIC_API_KEY` — already set (Claude API)
   - `EDGE_INTERNAL_SECRET` — make up a strong secret (this gates `/api/edge-daily-brief` so randoms can't trigger it)

3. **LEGAL — DO NOT SKIP**
   - Send `/edge/terms.html` + `/edge/disclaimers.html` + `/edge/risk-disclosure.html` to a securities attorney for review. Budget: $1.5k-3k flat fee.
   - Common attorneys for SC small business / fintech disclaimers: search for "securities lawyer Charleston SC" or "fintech attorney South Carolina."
   - Until attorney signs off — keep `/edge.html` link off the homepage if you want to be ultra-cautious. (It's already on the homepage. If concerned, comment out the service card on `landing-page/index.html` lines ~498-500 until reviewed.)

4. **Stripe products in test mode first**
   - Subscribe to one of each tier via `/edge.html`
   - Confirm welcome email arrives, default watchlist auto-creates
   - Log into dashboard with that email, add symbols, edit watchlist

5. **Trigger first daily brief manually**
   ```bash
   curl -X POST https://crownmediagroup.co/api/edge-daily-brief \
     -H "Content-Type: application/json" \
     -d '{"brief_type":"morning","secret":"YOUR_EDGE_INTERNAL_SECRET"}'
   ```
   - Verify the response includes `subscribers > 0` and `sent > 0`
   - Verify the brief arrives in the test subscriber's inbox
   - View brief in dashboard (latest brief surfaces automatically)

6. **Set up the schedule** (once everything else works)
   - Add this to `landing-page/netlify.toml` to schedule the morning brief at 10:00 UTC = ~6 AM ET:
     ```toml
     [functions."edge-daily-brief"]
       schedule = "0 10 * * 1-5"
     ```
   - Note: Netlify's scheduled functions don't pass POST bodies. You'll need to refactor `edge-daily-brief.mjs` to accept default `brief_type='morning'` and read the secret from `process.env`. Or use an external cron service (cron-job.org is free, lets you POST with a body).
   - Repeat for midday + close: `0 16 * * 1-5` (12 PM ET) and `30 20 * * 1-5` (4:30 PM ET).

---

## SHARED — Site Updates Shipped

- 2 new service cards on homepage (`/` → services section) — cards 07 + 08 with NEW badges
- Updated `LocalBusiness > hasOfferCatalog` JSON-LD with both new services
- Nav links to `/music.html` + `/edge.html` (desktop + mobile)
- `sitemap.xml` updated with 5 new URLs (music, edge, terms, disclaimers, risk)

---

## Environment Variables Required (Netlify Dashboard → Site Settings → Env)

| Var | Used by | Required? |
|-----|---------|-----------|
| `STRIPE_SECRET_KEY` | All checkout + webhook | Already set |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | Already set |
| `SUPABASE_URL` | All Supabase clients | Already set |
| `SUPABASE_SERVICE_ROLE_KEY` | All Supabase clients (admin) | Already set |
| `RESEND_API_KEY` | Welcome + brief emails | Already set |
| `POLYGON_API_KEY` | Edge daily brief market data | **NEW — set this** |
| `ANTHROPIC_API_KEY` | Edge daily brief summarization | Already set (or set if missing) |
| `EDGE_INTERNAL_SECRET` | Gates manual brief trigger | **NEW — set this (any strong string)** |

---

## Stripe Test-Mode Verification Checklist

Run through this BEFORE switching to live mode:

- [ ] Subscribe to `music-starter-27` → welcome email arrives → `/music.html?success=1&email=...` opens → library loads → download 1 track → quota shows 1/5
- [ ] Hit download 6 times → 6th returns 429 `quota_exceeded`
- [ ] Subscribe to `music-pro-67` from same test email → quota now 1/20 (pro tier wins over starter)
- [ ] Try `/api/music-custom-request` from starter email → 403 `starter_tier_not_eligible`
- [ ] Subscribe to `edge-watch-37` → welcome email → default watchlist auto-created → dashboard loads → add 5 symbols → save
- [ ] Manually trigger morning brief via curl → email arrives in test subscriber inbox → dashboard shows it under "Today's brief"
- [ ] Cancel subscription in Stripe → `customer.subscription.deleted` fires → `upkeep_clients.status = 'cancelled'` → next API call returns 403

---

## Files Changed/Created This Session

**Backend:**
- `landing-page/netlify/functions/create-subscription.mjs` (modified — 6 new SKUs + subscription_data metadata)
- `landing-page/netlify/functions/stripe-webhook.mjs` (modified — music/edge welcome flow + default watchlist)
- `landing-page/netlify/functions/_music-helpers.mjs` (new — shared helpers)
- `landing-page/netlify/functions/_edge-helpers.mjs` (new — shared helpers)
- `landing-page/netlify/functions/music-library-search.mjs` (new)
- `landing-page/netlify/functions/music-download.mjs` (new)
- `landing-page/netlify/functions/music-custom-request.mjs` (new)
- `landing-page/netlify/functions/edge-watchlist-crud.mjs` (new)
- `landing-page/netlify/functions/edge-dashboard-data.mjs` (new)
- `landing-page/netlify/functions/edge-daily-brief.mjs` (new)

**Migrations:**
- `landing-page/supabase/migrations/0001_kingdom_sound.sql` (new)
- `landing-page/supabase/migrations/0002_kingdom_edge.sql` (new)

**Frontend:**
- `landing-page/music.html` (new)
- `landing-page/edge.html` (new)
- `landing-page/edge/dashboard.html` (new)
- `landing-page/edge/terms.html` (new)
- `landing-page/edge/disclaimers.html` (new)
- `landing-page/edge/risk-disclosure.html` (new)

**Site integration:**
- `landing-page/index.html` (services grid + OfferCatalog JSON-LD + nav)
- `landing-page/sitemap.xml` (5 new URLs)

---

## What's NOT shipped (deferred to Phase 2+)

- Music license PDF auto-generator (currently returns license object inline)
- Edge alert engine (5-min scheduled cron checking setups)
- Edge SMS delivery (currently email-only)
- Edge auto-execute via user's brokerage API (Phase 6 — requires attorney review)
- Magic-link authentication for member areas (currently email-gate trust model)
- AI tools page tabs for Music + Edge (skipped — both have dedicated marketing pages)

These are noted as future scope. None block launch.
