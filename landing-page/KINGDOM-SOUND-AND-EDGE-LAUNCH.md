# Kingdom Sound + Kingdom Edge — Launch Handoff (post-pivot)
Updated 2026-05-14 · Reflects the per-project music model + Alpaca trading bot pivot

> For the full prioritized to-do across ALL of this week's work, see `Agency/ops/notes/KINGS-ACTION-LIST.md`.
> This doc is the technical reference for the two products specifically.

---

## SERVICE A — Kingdom Sound (per-project music)

### Model
NOT a subscription. One-time payments, three services:
- **Catalog License** — `music-license-150` / `music-license-297` / `music-license-497`
- **Custom Instrumental** — `music-custom-500` / `music-custom-750` / `music-custom-997`
- **Fully Original Song** — `music-original-993`
- **Bundle (all three)** — `music-bundle-2500`

The old subscription SKUs (`music-starter-27` / `music-pro-67` / `music-studio-147`) are deprecated — left in `create-subscription.mjs` but removed from the site. Zero existing subscribers, clean cutover.

### What's built
- `landing-page/music.html` — per-project pricing, samples player, three service cards, bundle, market comparison
- `create-checkout.mjs` — all 8 one-time music SKUs
- `stripe-webhook.mjs` — routes `music-license-*` to delivery, `music-custom-*` / `music-original-*` / `music-bundle-*` to intake forms
- `music-intake.mjs` — receives project briefs, emails King
- `music/custom-intake.html` + `original-song-intake.html` + `bundle-intake.html` — one shared template
- `music-download.mjs` + `_music-license-pdf.mjs` — signed-URL delivery + PDF license certificate (pdf-lib)
- 5 sample MP3s live in `assets/music-samples/` (generated via fal.ai stable-audio)
- Migration `0003_music_orders.sql`

### King's manual steps for Music
1. Run `0003_music_orders.sql` in Supabase SQL editor
2. Create `kingdom-sound` private storage bucket in Supabase
3. Create the 8 one-time Stripe products (one per SKU above) — set price IDs to match `create-checkout.mjs` amounts
4. Seed the catalog: generate 100 tracks via Suno/Udio using `Agency/ops/music/100-track-seed-prompts.md`, upload to the bucket, insert rows into `music_tracks`
5. Test-mode: buy `music-license-150` → confirm delivery email + license PDF; buy `music-custom-500` → confirm intake form flow

---

## SERVICE B — Kingdom Edge (Alpaca trading bot)

### Model
Three tiers — the bot trades the user's OWN Alpaca account with the user's OWN keys:
- **Watch — `edge-watch-37`** — daily AI brief only, no bot
- **Paper Trader — `edge-trade-97`** — bot trades the user's Alpaca PAPER account (simulated money)
- **Live Trader — `edge-edge-297`** — bot trades the user's LIVE account — **GATED** behind `EDGE_LIVE_ENABLED=true` env var (leave unset until attorney sign-off)

### What's built
- `landing-page/edge.html` — 3 tiers, "how it works" steps, 3 strategy cards, Live tier shown as "Coming after legal review"
- `_edge-bot-helpers.mjs` — AES-256-GCM key encryption + Alpaca REST helpers (paper/live URL switching)
- `edge-alpaca-connect.mjs` — validates the user's key against Alpaca `/account` before encrypting + storing
- `edge-bot-strategy.mjs` — user picks active strategy + symbols
- `edge-bot-runner.mjs` — scheduled-function-ready executor; loops active strategies, runs evaluators, places orders, snapshots accounts. Manual trigger via curl with `EDGE_INTERNAL_SECRET`.
- `edge-bot-status.mjs` — dashboard data
- `_strategies/{trend-follow,mean-revert,breakout,index}.mjs` — 3 strategies
- `edge/connect-alpaca.html` — 3-step onboarding
- `edge/dashboard.html` — bot status panel added
- Legal pages updated: `terms.html` §2A authorization clause, `disclaimers.html` §3, `risk-disclosure.html` §7A
- Migration `0004_edge_bot.sql`

### King's manual steps for Edge
1. Run `0004_edge_bot.sql` in Supabase SQL editor
2. Create the 3 edge Stripe subscription products (`edge-watch-37`, `edge-trade-97`, `edge-edge-297`)
3. Set Netlify env vars:
   - `EDGE_BOT_KEY_SECRET` — 32+ char random string. **ONE-WAY: never change it once set or all stored Alpaca keys become unrecoverable.**
   - `POLYGON_API_KEY` — for the daily brief market data
   - `EDGE_INTERNAL_SECRET` — gates the bot runner + brief trigger
   - Leave `EDGE_LIVE_ENABLED` UNSET — keeps live trading blocked
4. **Securities attorney review** of `edge/terms.html`, `disclaimers.html`, `risk-disclosure.html` — highest-priority legal item now that Edge places real trades
5. Test-mode: subscribe to `edge-trade-97` → connect a personal Alpaca paper key at `/edge/connect-alpaca.html` → pick a strategy in the dashboard → manually trigger `edge-bot-runner.mjs` via curl during market hours → confirm a paper trade fires
6. Once tested + attorney-cleared: schedule `edge-bot-runner.mjs` in `netlify.toml` (cron `*/5 13-20 * * 1-5`) and `edge-daily-brief.mjs`

---

## Env var summary

| Var | Used by | Status |
|-----|---------|--------|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | checkout + webhook | already set |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | all DB access | already set |
| `RESEND_API_KEY` | all emails | already set |
| `EDGE_BOT_KEY_SECRET` | Alpaca key encryption | **SET THIS — never change after** |
| `POLYGON_API_KEY` | Edge daily brief | **SET THIS** |
| `EDGE_INTERNAL_SECRET` | bot runner + brief trigger gate | **SET THIS** |
| `EDGE_LIVE_ENABLED` | unlocks live trading | **leave UNSET until attorney sign-off** |
| `FAL_KEY` | music sample generation | already set |

---

## The 3 things that block everything

1. **Run the 4 Supabase migrations** (0001-0004) — without these, every signup fails at the data layer
2. **Set `EDGE_BOT_KEY_SECRET`** — without it, nobody can connect Alpaca
3. **Securities attorney review** — Edge is now a real trading bot; this is the top legal exposure

Everything else (Stripe products, catalog seeding, GBP, coupon) is important but not a hard blocker on the others.
