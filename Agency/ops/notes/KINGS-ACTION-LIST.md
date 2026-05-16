# King's Action List — Manual Items Only
Last updated 2026-05-16 · ⚠️ SECURITY HARDENING PASS just shipped — top section below is URGENT

Everything Claude Code shipped this week is coded and pushed. This list is only the things that need YOUR hands — Stripe Dashboard, Supabase Studio, Netlify env, attorney, Google. Work top to bottom.

Project ref for all Supabase steps: `pcikjtzvruvavaduawes`
Supabase SQL Editor: https://supabase.com/dashboard/project/pcikjtzvruvavaduawes

---

## ⚠️ DO RIGHT NOW — Security rotation (2026-05-16 hardening pass)

Three audits found the live codebase had hardcoded token fallbacks (`KingdomSeed2026`, `EdgeBrief2026`) that bypassed auth. Those fallbacks are now **removed** — code requires the real env vars. **You must rotate the env vars now**, otherwise:
- Old leaked tokens become useless (good — that's the whole point)
- Anything in `Agency/ops/outreach/*.sh` that hard-coded `KingdomSeed2026` will stop working until you update it (you'll fix this in step 4)

### Sec-1. Rotate `SEED_TOKEN` in Fly.io (Kingdom Reach API)
- Generate a strong new value: `openssl rand -hex 24` or any 30+ char random string
- `flyctl secrets set SEED_TOKEN=<newvalue>` (from the `tools/` directory)
- **Effect:** Old `KingdomSeed2026` references in `Agency/ops/outreach/*.sh` will get 401 until you update them (next step)

### Sec-2. Rotate `EDGE_INTERNAL_SECRET` in Netlify
- Netlify Dashboard → site → Site settings → Environment variables → edit `EDGE_INTERNAL_SECRET` → set to new strong value
- **Effect:** The Edge bot runner + daily brief now require this exact value to fire

### Sec-3. Confirm `EDGE_BOT_KEY_SECRET` is set in Netlify
- Same place. **Without this, Alpaca connect returns 500 — no keys stored unencrypted.** This is the AES master key for stored Alpaca keys; setting/changing it after subscribers exist will make old keys unrecoverable. **Set once, never change.**

### Sec-4. Update local outreach scripts to use the new SEED_TOKEN
- `grep -r KingdomSeed2026 Agency/ops/outreach/` — list every file that hardcodes the old token
- Replace with the new value (or better, refactor to read from `process.env.SEED_TOKEN` and pass via `--token` flag)

### Sec-5. Run migration `0005_security_hardening.sql`
- Adds `churches.unsubscribed`, `music_orders.updated_at`, and the new `edge_bot_connection_attempts` table
- BLOCKED until done: unsubscribe links in campaign emails won't work; the new alpaca-connect anomaly log won't write; the music-intake rate-limit query will fail

### Sec-6. Re-test critical flows
- Hit the CRM with the OLD token → confirm 401: `curl 'https://crm.crownmediagroup.co/api/kingdom-reach/churches?token=KingdomSeed2026'`
- Hit the CRM with the NEW token → confirm 200
- Click an unsubscribe link in a Kingdom Reach email → confirm the page works + the church record flips to `unsubscribed=true`

See `SECURITY.md` at the repo root for the full audit summary.

---

## DO TODAY

### 1. Run Supabase migrations 0001, 0002, 0003, 0004 (in order)
- **What:** Four SQL migration files create every table the new products write to.
  - `0001_kingdom_sound.sql` — music tracks, downloads, custom_requests, disputes
  - `0002_kingdom_edge.sql` — watchlists, setups, alerts, briefs, deliveries
  - `0003_music_orders.sql` — `music_orders` table (the per-project pivot writes here, NOT the old subscription table)
  - `0004_edge_bot.sql` — `edge_brokerage_connections`, `edge_bot_strategies`, `edge_bot_executions`, `edge_bot_snapshots`
- **Steps:** Open the SQL Editor link above → for each file, paste the contents of `landing-page/supabase/migrations/<file>.sql` → Run. Do them in numeric order. They're idempotent — safe to re-run.
- **BLOCKED until done:** Every music checkout, every Edge signup, the Alpaca bot connect flow, and the daily brief all fail with DB errors until these run.

### 2. Create the `kingdom-sound` private storage bucket
- **What:** Supabase Storage bucket that holds music files; downloads are served via signed URLs.
- **Steps:** Supabase Studio → Storage → New bucket → Name: `kingdom-sound` → Public: **NO** → File size limit: 50 MB.
- **BLOCKED until done:** Music downloads and the license PDF generator (writes to `licenses/` in this bucket) fail.

### 3. Set `EDGE_BOT_KEY_SECRET` in Netlify env
- **What:** The AES-256-GCM key that encrypts every user's Alpaca API key before it's stored.
- **Steps:** Netlify Dashboard → Site Settings → Environment variables → Add `EDGE_BOT_KEY_SECRET` = a 32+ character random string.
- **CRITICAL:** Once set, NEVER change it — every stored brokerage key becomes permanently unrecoverable if you do.
- **BLOCKED until done:** `edge-alpaca-connect.mjs` cannot encrypt/store keys — the Paper Trader connect flow is dead.

### 4. Run fire-touch-2.sh — TODAY IS 05-15-eligible, fire it
- **What:** Touch-2 follow-up to the ~41 openers (proof-led `follow_up_opener` template) plus newly-eligible cold records. The 7-day window opened 2026-05-15.
- **Steps:** `bash Agency/ops/outreach/fire-touch-2.sh` — it's interactive, runs a dry-run pre-flight, and asks for confirmation before live fire. Pauses 60s between the opener wave and the cold wave.
- **BLOCKED until done:** 41 warm openers go cold. This is the highest-yield outreach action available right now — they already opened, they just didn't act.

---

## THIS WEEK

### 5. Create all Stripe products / SKUs
- **What:** Every new SKU needs a matching product in the Stripe Dashboard or checkout 404s. Create in **test mode first**, then live.
- **Music — per-project, one-time payment SKUs (the pivot):**
  - `music-license-150`, `music-license-297`, `music-license-497` — catalog track licenses (3 tiers)
  - `music-custom-500`, `music-custom-750`, `music-custom-997` — custom instrumentals (3 tiers)
  - `music-original-993` — fully original song
  - `music-bundle-2500` — all three services bundle
- **Edge — subscription SKUs:**
  - `edge-watch-37` ($37/mo — Watch)
  - `edge-trade-97` ($97/mo — Paper Trader)
  - `edge-edge-297` ($297/mo — Live Trader, stays gated)
- **Note:** The old `music-starter-27` / `music-pro-67` / `music-studio-147` subscription SKUs are deprecated — do NOT create them. Zero existing subscribers; the music model is now per-project only.
- **BLOCKED until done:** Any checkout for a missing SKU fails.

### 6. Create the `LAUNCH30` Stripe coupon
- **What:** 30% off, one-time use — drives the launch announcement email blast to existing upkeep clients.
- **Steps:** Stripe Dashboard → Products → Coupons → New → 30% off, duration "once", code `LAUNCH30`.
- **Then:** `node Agency/tools/announce-new-services.mjs --dry-run` to see the active client list → review → live fire.
- **BLOCKED until done:** The launch announcement to existing clients can't go out.

### 7. Set Edge env vars in Netlify: `POLYGON_API_KEY` + `EDGE_INTERNAL_SECRET`
- **What:**
  - `POLYGON_API_KEY` — market data for the daily brief + bot bars. Sign up at https://polygon.io (Starter plan ~$29/mo).
  - `EDGE_INTERNAL_SECRET` — any strong random string; gates the manual brief trigger and bot runner so randoms can't fire them.
- **Steps:** Netlify → Site Settings → Environment variables → add both.
- **BLOCKED until done:** Daily brief generation and `edge-bot-runner.mjs` won't run.

### 8. Seed the music library — start with 30 tracks
- **What:** The catalog is empty. Prompts are ready in `Agency/ops/music/100-track-seed-prompts.md` (10 genres × 10 tracks, tier-assigned, with SQL INSERT template + upload workflow).
- **Steps:** Generate tracks (Suno/Udio), export MP3 320kbps + WAV, upload to `kingdom-sound` bucket at `tracks/<track-id>.mp3`, insert rows into `music_tracks`. Even 30 tracks across 5 genres unblocks the Starter/license tier.
- **Also:** Upload the 5 sample preview MP3s to `landing-page/assets/music-samples/` (the player UI on `/music.html#samples` is already live and waiting — expected filenames in that folder's README.md). Note: 5 samples were already generated via the generator script — confirm whether they're committed or still need upload.
- **BLOCKED until done:** `music-license-*` purchases have nothing to deliver.

### 9. GBP claim — Crown Media Group Google Business Profile
- **What:** Claim/create the Google Business Profile for local SEO. Full playbook: `Agency/ops/outreach/GBP-SETUP-CHECKLIST.md`.
- **Steps:** Incognito → search "Crown Media Group Columbia SC". If a listing exists, "Own this business?". If not, https://business.google.com signed in as king@crownmediagroup.co → Add business → category "Marketing agency" → service-area business (Columbia + 6 Midlands cities) → phone +1-908-848-1436. **Video verification is fastest.**
- **BLOCKED until done:** Can't optimize the profile, can't send the REPUTATION review sequence (needs the verified `g.page/r/...` review link), no local Maps ranking.

### 10. Test the full Edge paper-bot flow end-to-end
- **What:** Before announcing Edge publicly, run the whole loop with your own Alpaca paper account: connect key via `/edge/connect-alpaca.html` → pick a strategy → manually trigger `edge-bot-runner.mjs` via curl with `EDGE_INTERNAL_SECRET` → confirm executions log and the dashboard bot-card updates.
- **BLOCKED until done:** Don't announce Paper Trader publicly until this passes — a broken connect flow on launch day burns trust.

---

## BEFORE PUBLIC LAUNCH

### 11. Securities attorney review of Edge legal pages — HIGHEST RISK ITEM
- **What:** `/edge/terms.html`, `/edge/disclaimers.html`, `/edge/risk-disclosure.html` are templates. Edge is now an actual **trading bot** that places orders on a user's account — not just a research tool — so this review is more urgent than when it was research-only.
- **Steps:** Send all three pages to a securities attorney. Budget $1.5k–3k flat fee. Search "securities lawyer Charleston SC" or "fintech attorney South Carolina".
- **BLOCKED until done:** The **Live Trader ($297/mo)** tier stays gated. Do NOT set `EDGE_LIVE_ENABLED=true` until the attorney signs off. Leaving that env var unset is what keeps live mode blocked — that is correct and intentional.

### 12. Stripe test-mode end-to-end for every SKU
- **What:** Run the full verification checklist in `landing-page/KINGDOM-SOUND-AND-EDGE-LAUNCH.md` — subscribe to each Edge tier, buy each music SKU type, confirm welcome emails, custom/original/bundle routing to intake forms, quota/gating, cancellation flow.
- **BLOCKED until done:** Don't flip Stripe to live mode until this passes.

### 13. Schedule launch social posts
- **What:** 10 platform-specific posts (5 Music + 5 Edge) with engagement-reply scripts at `Agency/ops/social/2026-05-13-launch-music-edge.md`.
- **Steps:** Schedule across your platforms once products are live and tested.

---

## ONGOING

### 14. Run fire-touch-2.sh on its cadence / monitor reply sweep
- New cold records become Touch-2 eligible on a rolling 7-day window. Reply detection is still manual — sweep Resend dashboard / Gmail for "Re:" replies. Only 1 reply so far (Rehoboth Baptist) — that one still needs follow-through.

### 15. Cron-schedule the Edge daily brief + bot runner (deferred)
- Currently manual curl triggers. When ready, add scheduled function config to `landing-page/netlify.toml` (or use cron-job.org which supports POST bodies). Brief: morning/midday/close. Bot runner: market hours.

### 16. Weekly GBP posts + push for 5 reviews in 30 days
- After GBP verifies: 1 Google Post/week (pull from blog), and work the REPUTATION sequence (`Agency/ops/outreach/REPUTATION-SEQUENCE.md`) — ask Jim Reese, Lionheart, Shatiea first.

### 17. Submit sitemap to Google Search Console
- Add `crownmediagroup.co` as a domain property, verify via Cloudflare DNS TXT, submit `https://crownmediagroup.co/sitemap.xml`. Note: sitemap has ~30 duplicate blog URLs (known build-blog.cjs bug) — not blocking, but flag for cleanup.

### 18. Subscribe to AI music platforms (recurring cost)
- Suno Pro ($24/mo), Udio Pro ($30/mo), AIVA Pro ($33/mo) — needed to keep generating library tracks. Verify Udio + AIVA TOS grant commercial + third-party licensing rights before relying on them (Suno Pro explicitly does).

---

## IF YOU ONLY DO 3 THINGS TODAY
Run the 4 Supabase migrations, set `EDGE_BOT_KEY_SECRET` in Netlify, and fire `bash Agency/ops/outreach/fire-touch-2.sh` — that unblocks every new product and hits 41 warm leads while they're still warm.
