# King's Action List — Manual Items Only
Last updated 2026-05-22 · **SECURITY PASS COMPLETE · AUTOPILOT LIVE · CRM 770 RECORDS**

**What changed since 2026-05-17:** The whole security rotation is done (SEED_TOKEN, EDGE_INTERNAL_SECRET, EDGE_BOT_KEY_SECRET all set on both Fly + Netlify, verified live). Phase 2 autopilot system is built, deployed, and verified — 4 Netlify scheduled functions running (`outreach-weekly-fire`, `outreach-reply-poll`, `outreach-bounce-webhook`, `outreach-safety-monitor`). 168 personalized outreach emails were sent tonight (130 pitch PDFs + 38 Touch-2). The system runs itself going forward.

This list is only the things that need YOUR hands — clicks in Gmail / Stripe / Google / Beehiiv / Supabase / attorney conversations. Work top to bottom.

**Reference token (gitignored, never commits):** `.env.kingdom-secrets` in repo root has SEED_TOKEN, EDGE_INTERNAL_SECRET, EDGE_BOT_KEY_SECRET, RESEND_WEBHOOK_SECRET.

---

## ⚡ DO RIGHT NOW (highest leverage, smallest effort)

### 1. Send the Rehoboth Baptist reply — *2 minutes, conversation goes cold without this*
- Open Gmail → **Drafts** → find "Re: Helping Rehoboth Baptist Church reach more people online"
- Click paperclip → attach `c:\Users\ldavi\Documents\AllGloryAgency\Agency\ops\outreach\leave-behinds\rehoboth-baptist-free-project-offer.pdf`
- Review body (it already references the attachment)
- Click **Send**
- They've been waiting since 2026-05-04. Admin will forward your reply to Pastor Dr. Ivory T. Thigpen.

### 2. Schedule the social posts — *15 minutes, free amplification*
- Open `Agency/ops/content/social-2026-05-22-kingdom-reach.md`
- 5 captions: 3 Instagram, 1 Facebook, 1 LinkedIn — posting schedule included
- Buffer or your scheduler of choice → drop in the order shown

### 3. Send Friday's newsletter — *5 minutes*
- Open `Agency/ops/content/newsletter-2026-05-23-the-week-the-kingdom-moved.md`
- Paste into Beehiiv composer
- Subject line: "The week the Kingdom moved" (pick from 3 options in the file)
- Schedule for Friday morning EST

---

## 🟡 DO THIS WEEK (high-value, requires your specific manual action)

### 4. Claim Google Business Profile — *10 minutes, biggest local SEO lever*
- Go to https://business.google.com
- Click **Add your business**
- Name: Crown Media Group
- Category: Marketing Agency
- Address: Columbia, SC 29229 (use service area, not physical address since home-based)
- Phone: (908) 848-1436
- Website: crownmediagroup.co
- Google sends a postcard for verification → arrives ~5-7 days → enter the code

### 5. Stripe SKUs (11 products) — *60 minutes*
- Stripe Dashboard → Products → Create products one at a time
- Music (8 SKUs):
  - `music-license-150` — Catalog License ($150)
  - `music-license-297` — Catalog License Premium ($297)
  - `music-license-497` — Catalog License Signature ($497)
  - `music-custom-500` — Custom Instrumental ($500)
  - `music-custom-997` — Custom Instrumental Pro ($997)
  - `music-original-993` — Custom Original Song with Lyrics ($993)
  - `music-original-1497` — Original Song Premium ($1,497)
  - `music-bundle-2500` — Full Catalog Bundle ($2,500)
- Edge (3 subscription SKUs):
  - `edge-watch-37` — Watch Tier ($37/mo)
  - `edge-trade-97` — Paper Trader ($97/mo)
  - `edge-edge-297` — Live Trader ($297/mo) — **keep this one disabled until attorney signs off**

### 6. Music library upload to Supabase — *30 minutes*
- 20 generated tracks at `Agency/ops/music/library/` (~102 MB total)
- Supabase Studio → Storage → Create bucket `kingdom-sound` (private)
- Upload all 20 files
- Run this SQL in Supabase SQL Editor (one row per track — I'll generate the SQL on request):
  ```
  INSERT INTO music_tracks (title, genre, mood, bpm, storage_path, tier_required, source_platform, price_cents)
  VALUES ('Track Name', 'cinematic', 'epic', 120, 'library/cinematic-01.mp3', 'starter', 'falai', 15000), ...
  ```
- Mark the original 5 sample previews as `public=true` for the marketing page

---

## 🔴 STRATEGIC — Bigger conversations, more lead time

### 7. Securities attorney — *Edge Live tier gated on this*
- Goal: Have a securities attorney review `landing-page/terms.html` and `landing-page/edge.html` and confirm Crown Media Group is NOT operating as an RIA when Edge runs on user-connected Alpaca accounts.
- Budget: $300-$800 for a 1-hour engagement
- Suggested local: Nelson Mullins (Columbia office) or Burr Forman — both have fintech practice in SC
- After signoff: set `EDGE_LIVE_ENABLED=true` in Netlify, enable `edge-edge-297` Stripe product

### 8. Trading bot — *6-week build, separate session*
- The Edge bot (paper mode) is shipped. The personal-tier upgrade (with King as tier_zero) is in planning — see prior memory `project_session_close_2026_05_22.md`.
- Phase 1-4 plan exists. Next milestone: backtest 3 existing strategies, install `technicalindicators`, validate Sharpe ratio ≥ 0.5 per strategy before any tier-zero promotion.

---

## ✅ DONE THIS SESSION (no action needed — for the record)

- ~~Sec-1: Rotate `SEED_TOKEN` in Fly.io~~ ✅
- ~~Sec-2: Set `EDGE_INTERNAL_SECRET` in Netlify~~ ✅
- ~~Sec-3: Set `EDGE_BOT_KEY_SECRET` in Netlify~~ ✅
- ~~Sec-4: Update local scripts to require SEED_TOKEN env var~~ ✅ (commit `fe00c20`)
- ~~Sec-5: Run migration 0005 in Supabase~~ ✅
- ~~Sec-6: Verify smoke test all green~~ ✅
- ~~Phase 2 autopilot: 4 scheduled functions + CRM Phase 2 schema + Resend webhook~~ ✅ (commits `fff1d22`, `fc9a579`, `dd62387`, `bee8d10`)
- ~~Pitch PDF send to 130 organizations~~ ✅ (130 sent / 0 failed)
- ~~12 bounces auto-detected, marked, excluded from future cohorts~~ ✅
- ~~Launch blog post written~~ ✅
- ~~5 social captions written~~ ✅
- ~~Beehiiv newsletter draft written~~ ✅
- ~~Crown Media reach one-pager PDF generated~~ ✅

---

## What runs without you from now on (no action needed)

- **Monday 9am EST** — next cohort gets pitched automatically
- **Every 6 hours** — Gmail inbox scanned, replies + unsubs + bounces auto-marked
- **Daily 4am UTC** — safety brake checks reply/bounce/unsub rates, auto-pauses if anything looks wrong
- **Resend webhook** — real-time bounce + complaint handling, auto-excludes records from future cohorts

If autopilot ever auto-pauses, you'll get an email from `king@crownmediagroup.co` (sent by the safety monitor) explaining the trigger. To unpause:
```
curl -X PATCH "https://crm.crownmediagroup.co/api/kingdom-reach/workspace-settings/outreach_paused" \
  -H "Content-Type: application/json" \
  -d '{"token":"<SEED_TOKEN from .env.kingdom-secrets>","value":"false"}'
```
