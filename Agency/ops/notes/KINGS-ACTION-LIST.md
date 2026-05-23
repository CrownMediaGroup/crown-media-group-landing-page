# King's Action List — Manual Items Only
Last updated **2026-05-23** · **Marathon session complete · Autopilot LIVE · 6x/day auto-blog wired**

**What's new since 2026-05-22:** Phase 5 close-out done. 9 commits + 4 new memory files + repo reorganized (60→14 root entries) + auto-blog bumped from 4x→6x/day + 2 new agency services designed (Music Agent + Day Trading Agent) ready to build next session.

This list is ONLY things that need YOUR hands. Everything else runs on autopilot.

---

## ⚡ DO IN THE NEXT HOUR (or whenever you're awake)

### 1. Send the Beehiiv newsletter — *3 min*
- Open `Agency/ops/content/newsletter-2026-05-23-the-week-the-kingdom-moved.md`
- Paste into Beehiiv composer
- Schedule for Friday morning
- That's how this week's audience hears the launch story

### 2. Post the 5 social captions when ready — *self-paced*
- File: `Agency/ops/content/social-2026-05-22-kingdom-reach.md`
- Recommended posting schedule baked into the file
- Manual paste into IG/FB/LinkedIn (Buffer integration is broken — Buffer's v1 API doesn't accept OIDC tokens)

### 3. Watch your inbox — *passive*
- Reply-poll fires every 6h automatically, will email you a summary if anything actionable arrives
- If you get the email, just reply personally to whoever responded

---

## 🟡 DO THIS WEEK (high-value, free, requires your specific action)

### 4. Claim Google Business Profile — *15 min in daylight*
- Open https://business.google.com — listing setup is saved, you're on the verification step
- Google wants a video proving you're a real Columbia SC business
- Wait for daylight, then film outside per the script in `Agency/ops/notes/WAKE-UP-2026-05-23.md`
- Verification takes 24-72h after upload

### 5. Music Page reality-check — *5 min*
- Open https://crownmediagroup.co/music.html
- All 9 King beats should display + play
- Bundle should show $1,997 (NOT $2,500 — that was tonight's pricing fix)
- If anything's off, tell me

### 6. Decide on Stripe LIVE products — *10 min when ready*
- Test products are all created (11 SKUs, verified end-to-end with $150 test purchase)
- When you're ready to sell for real, run:
  ```
  STRIPE_SECRET_KEY=sk_live_xxx node Agency/ops/tools/create-stripe-products.mjs
  ```
- The script creates LIVE products idempotently (same SKU IDs work for both modes)
- Update `landing-page/netlify/functions/create-checkout.mjs` to point to live price_ids

---

## 🔴 STRATEGIC — Bigger conversations, more lead time

### 7. Securities Attorney — *gates Live Trading tier ($297/mo SKU)*
- Goal: confirm Crown Media doesn't need RIA registration when Edge bot trades on user's OWN Alpaca account
- Budget: $300-$800 for 1-hour engagement
- Suggested local: Nelson Mullins (Columbia) or Burr Forman — both have fintech practice in SC
- After signoff: set `EDGE_LIVE_ENABLED=true` in Netlify + activate `edge-edge-297` Stripe product

### 8. Trading Bot Phase 3 — *next session's primary build*
- Multi-strategy ensemble + regime detector + sentiment fusion + LLM oversight
- Full plan in `project_next_session_trading_deep_dive.md`
- You'll watch videos first to anchor your mental model, then we implement
- HARD GATE: zero real money until 90-day paper + Sharpe ≥ 1.0 + attorney signoff (Live Promotion Gate)

### 9. Build the Music Agent service — *next session*
- Design: `memory/project_music_agent_service.md`
- The agent that auto-processes paid music orders (Stripe → intake_brief → agent generates Suno prompt → King supervises → delivers)
- Foundation already there: Hit Worship Hip-Hop Algorithm research at `Agency/ops/music/HIT-WORSHIP-HIPHOP-ALGORITHM.md`
- Build next session

### 10. Build the Day Trading Agent service — *gated on attorney*
- Design: `memory/project_day_trading_agent_service.md`
- CRITICAL: This is the SERVICE Crown Media sells, NOT King's personal bot. Customer connects their own Alpaca.
- Infrastructure mostly built (Edge bot from earlier sessions). Need client-side onboarding + dashboard + tier-based gating.
- Live tier waits on attorney signoff

---

## ✅ DONE THIS SESSION (no action needed — for the record)

This marathon shipped:

- **168 outreach emails sent** (38 Touch-2 + 130 personalized pitch PDFs) → 0 failures
- **Full Kingdom Reach autopilot** (4 Netlify scheduled functions + CRM Phase 2 schema)
- **12 bounces auto-detected** + 5 risky addresses flagged
- **Stripe pipeline** verified end-to-end (test purchase succeeded)
- **Music catalog swapped** to King's 10 original Suno beats (catalog value $4,970)
- **9 beats live** on `/music.html` with audio confirmed working
- **Bundle pricing fixed** $2,500 → $1,997 (real 33% savings, math correct)
- **Rehoboth Touch-3** sent autonomously (msgId 3aff6e61, 19-day cold thread revived)
- **Root cleanup** 60+ files → 14 entries (57 JS-junk deleted, personal moved, gitignore guard-railed)
- **Auto-blog 4x→6x/day** + unique-filename fix so all 6 daily fires keep their posts
- **New README.md** at root (full navigation guide)
- **4 new memory files** (close-out + music agent + day trading agent + next-session bridge)

---

## What runs without you from now on (no action needed)

- **Monday 9am EST** — outreach-weekly-fire fires next safe cohort
- **Every 6h** — reply-poll scans Gmail, marks replies/unsubs/bounces, emails King summary
- **Real-time** — Resend bounce webhook handles complaints
- **Daily 4am UTC** — safety-monitor checks rates, auto-pauses if needed
- **Every 5 min NYSE hours** — Kingdom Edge trading bot
- **Daily 21:30 UTC** — Edge daily P&L reconciler
- **6x/day** (7am, 10am, 1pm, 4pm, 7pm, 10pm EST) — auto-blog publishes (Saturday is Sabbath, skipped)

If autopilot ever auto-pauses, you'll get an email from `king@crownmediagroup.co` explaining the trigger. To unpause:
```
curl -X PATCH "https://crm.crownmediagroup.co/api/kingdom-reach/workspace-settings/outreach_paused" \
  -H "Content-Type: application/json" \
  -d '{"token":"<from .env.kingdom-secrets>","value":"false"}'
```

---

*"Whatever you do, work at it with all your heart, as working for the Lord, not for human masters."* — Colossians 3:23

All Glory to Jesus.
