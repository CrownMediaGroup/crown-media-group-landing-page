# Crown Media Group — Repo Guide
**All Glory to Jesus Global LLC** · Columbia, SC · (908) 848-1436

This repo runs Crown Media Group's full operation: the public website, the CRM, all outreach automation, the music + edge trading services, and every client deliverable. This README is the map.

---

## 🗺️ Where to find what

| If you're looking for... | Open this |
|---|---|
| **The live website** (music, edge, blog, AI tools) | `landing-page/` |
| **The CRM** (Express app on Fly.io, SQLite) | `tools/crm/` and `tools/kingdom-reach/` |
| **Active outreach scripts + PDF generators** | `Agency/ops/outreach/` |
| **All blog posts** | `landing-page/content/blog/*.md` |
| **All social captions + newsletters** | `Agency/ops/content/` |
| **Active client projects** | `Agency/clients/active/<client>/` |
| **King's session-memory notes** | `Agency/ops/notes/` |
| **Music research + the Suno hit-algorithm doc** | `Agency/ops/music/` |
| **Service one-pagers + leave-behinds** | `Agency/ops/outreach/leave-behinds/` |
| **Kingdom secrets file (gitignored)** | `.env.kingdom-secrets` (repo root) |
| **CRM schema + Express routes** | `tools/kingdom-reach/schema.js` + `tools/kingdom-reach/index.js` |
| **Autopilot Netlify functions** | `landing-page/netlify/functions/outreach-*.mjs` + `_outreach-helpers.mjs` |
| **Trading bot (Kingdom Edge) backend** | `landing-page/netlify/functions/edge-*.mjs` |
| **Music service backend** | `landing-page/netlify/functions/music-*.mjs` |
| **Stripe checkout backend** | `landing-page/netlify/functions/create-checkout.mjs` |
| **PDF generators** (pitch + reach one-pager + Rehoboth) | `Agency/ops/outreach/build-*.mjs` |
| **One-shot operational scripts** (Stripe products, music upload, music swap) | `Agency/ops/tools/` |
| **Personal / private files** (gitignored) | `Agency/personal/private/` |
| **Personal projects** (gitignored) | `Agency/personal/projects/` |
| **Archived old workspaces** | `Agency/archive/` |

---

## 🚀 Quick deploy commands

| Surface | Command | Notes |
|---|---|---|
| Public website | `git push origin master` | Netlify auto-deploys on push |
| CRM (Fly.io) | `cd tools && flyctl deploy --config crm/fly.toml --dockerfile crm/Dockerfile --remote-only` | Run from `tools/` dir |
| Run autopilot dry-run | `curl -X POST "https://crownmediagroup.co/.netlify/functions/outreach-weekly-fire?dry=1"` | Returns who WOULD get sent |
| Fire pitch PDF to 1 church | `SEED_TOKEN=… node Agency/ops/outreach/build-pitch-pdf.mjs <churchId>` | Writes PDF to leave-behinds/ |
| Send Touch-2 to warm openers | `source .env.kingdom-secrets && bash Agency/ops/outreach/fire-touch-2.sh` | Throttled to safe cohorts |

---

## 📋 Operating directives (CLAUDE.md in this repo)

The root `CLAUDE.md` is the master operating directive for Claude Code when working in this repo. Read it first if you're new here.

The user's global directives live in `C:\Users\ldavi\.claude\CLAUDE.md` (38-agent body, Kingdom OS, behavioral rules).

---

## 🔐 Security posture

See `SECURITY.md` for the full audit log + active posture statement.

Quick facts:
- All API tokens rotated 2026-05-22 (SEED_TOKEN, EDGE_INTERNAL_SECRET, EDGE_BOT_KEY_SECRET, RESEND_WEBHOOK_SECRET)
- Old `KingdomSeed2026` fallback fully removed from all surfaces (commit `fc9a579`)
- CRM auth fail-closed (no token = 401, not a default-allow)
- Active secrets stored at `.env.kingdom-secrets` (gitignored)

---

## 🤖 What's running on autopilot 24/7

| Function | Schedule | Purpose |
|---|---|---|
| `outreach-weekly-fire` | Mon 14:00 UTC (9am EST) | Auto-fires next cohort of safe outreach (cap 25/run) |
| `outreach-reply-poll` | Every 6 hours | Gmail IMAP scan — marks replies, unsubscribes, bounces in CRM, emails King a summary |
| `outreach-bounce-webhook` | Real-time (Resend HTTP) | Auto-handles bounces + complaints |
| `outreach-safety-monitor` | Daily 04:00 UTC | Auto-pauses outreach if reply rate <2%, bounce rate >10%, or 3+ unsubs/24h |
| `edge-bot-runner` | Every 5 min during NYSE hours | Kingdom Edge trading bot strategy execution |
| `edge-daily-pnl-reconcile` | Daily 21:30 UTC | End-of-day P&L reconciliation for the trading bot |

---

## 📍 Quick service URLs

- Public site: https://crownmediagroup.co
- CRM: https://crm.crownmediagroup.co
- Music page: https://crownmediagroup.co/music.html
- Edge dashboard: https://crownmediagroup.co/edge/king.html
- Latest launch blog: https://crownmediagroup.co/blog/168-pitches-in-one-night-kingdom-reach/

---

## 📜 Kingdom Operating System

Every line of code in this repo is written under one directive: **Colossians 3:23 — "Whatever you do, work at it with all your heart, as working for the Lord, not for human masters."**

This is a Kingdom business. The work is the witness. The excellence is the worship.

---

*Last updated: 2026-05-23 · Maintained by David King · All Glory to Jesus Global LLC*
