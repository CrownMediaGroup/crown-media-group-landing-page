# Session Notes — 2026-03-17
## Crown Media Group | All Glory to Jesus Global LLC
## Sprint Day 6 of 10

---

## COMPLETED THIS SESSION

### Pitch Assets
- One-pager HTML (`crown-media-one-pager-logo.html`) — finalized with logo, blend effect, website-aligned copy
- One-pager PDF (`crown-media-one-pager.pdf`) — print-ready, no Chrome headers, 634KB
- Full deck (`crown-media-full-deck.html`) — pricing updated, email corrected
- Both aligned to live website: https://crown-media-group.netlify.app

### Pricing (locked across all files)
- Starter: $750/mo + $250 setup
- Growth: $1,200/mo + $400 setup
- Premium: $3,500/mo + $1,000 setup

### Email Fixed Everywhere
- `davidking@crownmediagroup.co` → `king@crownmediagroup.co`
- Fixed in: one-pager (x2), full deck, DASHBOARD.html, landing-page/index.html, BRANDING-KIT.md, CLAUDE.md, sales-automator.md, memory files

### Security Hardened
- `.gitignore` updated: added `*service-account*.json`, `*.csv`, `agency-automation-*.json`
- `resend api-keys-1773638573567.csv` moved from root → `security/resend-api-keys.csv`

### Files Organized
- `CLAUDE.md` pricing updated from old ranges to fixed prices
- `.claude/agents/sales-automator.md` pricing updated
- `assets/personal/DavidKing real pfp.png` renamed → `david-king-pfp.png`
- Sprint tracker Days 1–6 filled in
- Memory files (project_agency.md, project_pending_tasks.md) updated to current state
- `Agency/ops/supabase-tables.sql` created — ready to run

### Supabase SQL Ready
- File: `Agency/ops/supabase-tables.sql`
- Tables: clients, leads, invoices, onboarding_submissions
- Run at: https://pcikjtzvruvavaduawes.supabase.co → SQL Editor

---

## DISCOVERED THIS SESSION

### Email Bounce
- `king@crownmediagroup.co` bounces with "554 5.7.1 Relay access denied"
- Root cause: Namecheap DNS not switched to Cloudflare — no MX records active
- Fix: Namecheap → switch nameservers → Cloudflare email routing

### Social Handle Status
- `@crownmediagroup` on Instagram: TAKEN (someone has `@crownmediagroup_`)
- `@crownmediagroup` on LinkedIn: TAKEN (Indiana agency)
- TikTok / X / YouTube: Unconfirmed — check manually
- Best fallback: `@crownmediaco`

---

## STILL BLOCKED

| Item | Blocked By |
|---|---|
| king@crownmediagroup.co | Namecheap DNS not switched |
| Netlify custom domain | Same — DNS not pointing to Cloudflare |
| Cloudflare www CNAME | DNS propagation pending |
| Supabase tables | King needs to run SQL in dashboard |
| GoHighLevel | Wait until first client closes |
| Google Ads billing | Check bank for $0.01–$1.00 deposit, 2 attempts left |
| Social handles | King needs to claim manually |

---

## NEXT ACTIONS FOR KING

1. **TODAY** — Print one-pager, hit 5 Columbia SC businesses in person
2. **TODAY** — Send 10 DMs, post both accounts
3. **TODAY** — Log into Namecheap → check if account unlock email arrived
4. **TODAY** — Run `Agency/ops/supabase-tables.sql` in Supabase SQL Editor
5. **This week** — Check and claim social handles (`@crownmediaco` or `@crownmediagroup`)

---

## OPEN QUESTIONS FOR KING

- **Change 3**: Does the Railway server OR any local Agency script use `Agency/agency-automation-490122-d77e3228bafa.json` directly? If only the Railway system uses a key (it has its own `service-account-key.json`), the Agency copy can be moved to `security/`.

---

# SESSION UPDATE — Directives 001 / 003 / 004
## Same Day (2026-03-17) | Sprint Day 6 continued

---

## CC DIRECTIVE AUTHORITY
CC (Claude Chat) is now King's strategic director. CC issues numbered directives. Claude Code executes. King approves.

---

## COMPLETED — DIRECTIVE 001

All 4 tasks verified complete (most were done in the prior session):
- CLAUDE.md pricing: already correct ($750/$1,200/$3,500 + $250/$400/$1,000 setup) — no change
- sales-automator.md pricing: already correct — no change
- Personal photo renamed: `assets/personal/david-king-pfp.png` confirmed exists
- Session notes: already existed with more detail than template — kept as-is

**Setup fees locked at:** $250 / $400 / $1,000 (King confirmed)

---

## COMPLETED — DIRECTIVE 003

### Phase 1 — Security Purge
- `assets/brand/IMG_9880.png` — DELETED (was Bank of America online banking screen: account #223024255919, routing numbers, balance)
- `assets/brand/IMG_9881.png` — DELETED (was Bank of America March statement)
- `assets/brand/IMG_9882.jpeg` — DELETED (was SC Driver's License with full personal info)
- Files were never in git history — no history purge needed
- `.gitignore` already covered `assets/personal/` and sensitive doc patterns

### Phase 2 — Bug Prevention
- `.env.claude` created: `NODE_OPTIONS=--max-old-space-size=4096`, `CLAUDE_CODE_MAX_OUTPUT_TOKENS=8000`
- `Agency/ops/HEALTH-CHECK.md` created — session-start checklist, freeze recovery, security checklist, current versions

### Phase 3 — Capability Expansion
- `.mcp.json` expanded from 1 → 4 MCP servers: filesystem, memory, sequential-thinking, puppeteer
- `.claude/agents/coordinator.md` created — routes to 6 specialized sub-agents
- `.claude/commands/` created with 6 slash commands: save-state, restore-session, research, content-batch, sprint-check, client-prep
- 16 VS Code extensions documented in capability report

### Phase 4 — Intelligence Report
- `Agency/ops/notes/CAPABILITY-REPORT-2026-03-17.md` created — full system map

### Final Step
- GitHub repo made PRIVATE: `gh repo edit --visibility private --accept-visibility-change-consequences`
- Verified: `isPrivate: true`, repo name: `crown-media-group-landing-page`

---

## COMPLETED — DIRECTIVE 004

### Task 1 — Footer Email
- `landing-page/index.html` already has `king@crownmediagroup.co` — no fix needed (was corrected in earlier session)
- Checked lines 44, 505, 523 — all correct

### Task 2 — Setup Fee Audit
- Searched all files for `$150 setup`, `$300 setup`, `$500 setup`, `$150/$300/$500`
- Result: NO matches found — pricing is already correct everywhere

### Task 3 — Supabase SQL
- `Agency/ops/supabase-tables.sql` ready — 4 tables: clients, leads, invoices, onboarding_submissions
- **KING ACTION REQUIRED:** Run SQL in Supabase (see below)

### Task 4 — Social Handles Tracker
- `Agency/social/handles-status.md` CREATED

### Task 5 — Sprint Tracker
- `Agency/ops/sprint/10-day-sprint.md` — Day 6 row updated + Day 6 completion block appended

### Task 6 — Save State
- This file updated

---

## FILES CREATED THIS SESSION

| File | Purpose |
|---|---|
| `.env.claude` | Node memory + output token limits (freeze fix) |
| `Agency/ops/HEALTH-CHECK.md` | Session-start checklist + freeze recovery |
| `Agency/ops/notes/CAPABILITY-REPORT-2026-03-17.md` | Full system capability map |
| `.claude/agents/coordinator.md` | Multi-agent coordinator |
| `.claude/commands/save-state.md` | /save-state slash command |
| `.claude/commands/restore-session.md` | /restore-session slash command |
| `.claude/commands/research.md` | /research slash command |
| `.claude/commands/content-batch.md` | /content-batch slash command |
| `.claude/commands/sprint-check.md` | /sprint-check slash command |
| `.claude/commands/client-prep.md` | /client-prep slash command |
| `Agency/social/handles-status.md` | Social handle claim tracker |

## FILES MODIFIED THIS SESSION

| File | Change |
|---|---|
| `.mcp.json` | Added memory, sequential-thinking, puppeteer servers |
| `Agency/ops/sprint/10-day-sprint.md` | Day 6 row + completion block + wins log |

## FILES DELETED THIS SESSION

| File | Reason |
|---|---|
| `assets/brand/IMG_9880.png` | Bank of America account screen — sensitive |
| `assets/brand/IMG_9881.png` | Bank of America statement — sensitive |
| `assets/brand/IMG_9882.jpeg` | SC Driver's License — sensitive |

---

## CURRENT BLOCKERS

| Item | Root Cause | Fix |
|---|---|---|
| `king@crownmediagroup.co` bounces | Namecheap DNS not switched to Cloudflare | Namecheap → Manage → Nameservers → switch to Cloudflare |
| Supabase tables don't exist yet | King hasn't run SQL | See action #1 below |
| Social handles unclaimed | King hasn't created accounts | See action #2 below |
| MCP servers not active | VS Code restart required after `.mcp.json` update | See action #3 below |
| Google Ads billing | $0.01–$1.00 bank deposit unverified, 2 attempts left | Check bank |
| Netlify custom domain | DNS not pointing to Cloudflare | Fix DNS first |

---

## NEXT ACTIONS FOR KING (numbered, in order)

1. **Run Supabase SQL** — Go to https://pcikjtzvruvavaduawes.supabase.co → SQL Editor → New Query → paste contents of `Agency/ops/supabase-tables.sql` → Run. Come back and confirm.
2. **Claim social handles** — Open `Agency/social/handles-status.md`, go to each URL, claim `@crownmediagroup`. If taken on any platform, report back to CC.
3. **Restart VS Code** — Required to activate memory, sequential-thinking, and puppeteer MCP servers.
4. **Fix Namecheap DNS** — Log into Namecheap → domain manager → switch nameservers to Cloudflare. This activates `king@crownmediagroup.co` email and Netlify custom domain.
5. **Check Google Ads bank deposit** — Look for $0.01–$1.00 from Google in your bank. Enter the amount in Google Ads billing. 2 attempts remaining — don't guess.
6. **Daily non-negotiables** — 10 DMs, 3 card follow-ups, post @mkdavidking, post agency page.

---

## AWAITING

- Directive 005 from CC
