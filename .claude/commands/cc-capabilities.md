# Crown Media Group — Full Capability Map
# /cc-capabilities — Run this at the start of any session to orient fast

When this command is invoked, print the following capability map exactly as formatted below. Do not summarize or shorten it. This is King's system status board.

---

## CROWN MEDIA GROUP — CAPABILITY MAP
**Last updated:** April 2026 | Phase 2 Active

---

### LIVE (fully operational)

| System | URL / Command | Notes |
|--------|--------------|-------|
| Main website | crownmediagroup.co | Netlify + Cloudflare, auto-deploy on git push |
| CRM | crm.crownmediagroup.co | Railway + Supabase, login: king@crownmediagroup.co |
| AI Tools page | crownmediagroup.co/ai-tools.html | Logo $97, Banner $97, Website $197 |
| Video service | crownmediagroup.co/video | Client upload, dashboard, PIN auth |
| Blog | crownmediagroup.co/blog | Auto-generated, build-blog.cjs — never edit directly |
| Email | king@crownmediagroup.co | Google Workspace, DKIM+SPF live |
| n8n Daily Engine | localhost:5678 | Fires 7AM: leads → pipeline → caption → briefing email |
| n8n bridge | localhost:3456 | Connects Claude Code → n8n |
| Railway CI/CD | auto on git push | Backend server, auto-deploy |
| Supabase | pcikjtzvruvavaduawes | 7 tables: clients, leads, invoices, onboarding_submissions, ai_orders, ai_assets, portfolio_hidden |
| Stripe | checkout + webhooks | Payments live |
| Resend | email delivery | Onboarding + monthly reports |
| SAM.gov | UEI XLFXZQCQFTH7 | Registered — awaiting IRS TIN match |
| YouTube | @CrownMediaGroupco | 9 videos live |
| maps-scraper.js | node Agency/tools/maps-scraper.js | Nightly Google Maps scrape |
| gov-monitor.js | node Agency/tools/gov-monitor.js | SAM.gov contract watcher |
| proposal-generator.js | node Agency/tools/proposal-generator.js | Auto-proposal for all 3 tiers |
| lead-tracker.js | node Agency/tools/lead-tracker.js | Real-time lead status |
| social-post.js | node Agency/tools/social-post.js | IG, FB, X, TikTok, Threads |
| content-scheduler.js | node Agency/tools/content-scheduler.js | Post queue |
| social-creator.js | node Agency/tools/social-creator.js | AI captions |
| control.js | node tools/bridge/control.js | Mouse + keyboard via PowerShell |

---

### BLOCKED (built, needs credential)

| System | File | Missing |
|--------|------|---------|
| Instagram DM | Agency/tools/instagram-dm.js | IG_USERNAME + IG_PASSWORD in .env |
| LinkedIn outreach | Agency/tools/linkedin-outreach.js | LI_USERNAME + LI_PASSWORD in .env — also needs account verification |
| AI Website Generator ($197) | client-onboarding-system/website-generator.js | NETLIFY_TOKEN in Railway env vars |
| YouTube/X auto-post | tools/video-service/automation/auto-poster.js | BUFFER_ACCESS_TOKEN in .env |

---

### PENDING (King action required)

| Item | Action | Note |
|------|--------|------|
| NETLIFY_TOKEN | netlify.com → User Settings → Personal Access Tokens | Unlocks $197 AI Website product |
| IG credentials | Add IG_USERNAME + IG_PASSWORD to .env | 8 DMs/day, ready to fire |
| LinkedIn credentials | Add LI_USERNAME + LI_PASSWORD to .env | 15 connections/day, ready to fire |
| Buffer token | buffer.com → Settings → Apps & Integrations | Unlocks YouTube + X auto-post |
| Google Ads deposit | Check billing in Google Ads dashboard | Required for paid ad delivery |
| Fort Jackson MWR | Call Katherine Romero: 803-751-6990 | Gov retainer potential $1,200+/mo |
| SAM.gov DBA | Wait for IRS TIN match, then add "Crown Media Group" | UEI XLFXZQCQFTH7 |
| Business insurance | Get BOP policy ($30-60/mo) | Required before gov contracts |
| @crownmediagroup handles | Claim on Pinterest, Threads, LinkedIn Co Page, YouTube | Do before growth push |

---

### KEY FILE PATHS

| What | Path |
|------|------|
| Agency tools | Agency/tools/ |
| Client onboarding | client-onboarding-system/ |
| Supabase schema | Agency/ops/supabase-tables.sql |
| n8n workflows | tools/n8n-mcp/ |
| CRM server | tools/crm/server.js |
| Bridge control | tools/bridge/control.js |
| Video automation | tools/video-service/automation/ |
| Blog builder | landing-page/scripts/build-blog.cjs |
| Main site | landing-page/index.html |
| .env (root) | .env (never commit) |

---

### PHASE STATUS

| Phase | Target | Status |
|-------|--------|--------|
| Phase 1 ($0→$3.5k) | 3-5 clients | DONE — Shatiea signed |
| Phase 2 ($3.5k→$8k) | 6-10 clients | NOW — 1 Growth or 2 Starter needed |
| Phase 3 ($8k→$20k) | 10-20 clients | Q3 2026 |
| Phase 4 ($20k→$50k) | 30-50 + course | Q4 2026 |
| Phase 5 ($50k→$100k+) | 100-1M | 2027+ |
