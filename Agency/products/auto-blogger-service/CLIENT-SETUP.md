# Crown Media Group — Auto-Blogger Service
## Client Setup Guide (Internal Use)

---

## What This Is

A fully automated blogging system that:
- Posts 4x daily, 7 days a week (skips Saturday — Sabbath)
- Researches trending topics, Reddit, Google Trends, industry searches
- Writes full SEO-optimized blog posts in the client's brand voice
- Commits to their site's GitHub repo → Netlify auto-rebuilds
- Emails client after each post with ready-to-copy social captions

Clients pay a monthly recurring fee for this service.
King does ZERO manual work per post after initial setup.

---

## Pricing

| Tier | Posts/Day | Monthly | Setup Fee |
|---|---|---|---|
| Starter Auto-Blog | 1x/day | +$200/mo add-on | $150 one-time |
| Growth Auto-Blog | 2x/day | +$350/mo add-on | $250 one-time |
| Premium Auto-Blog | 4x/day | +$500/mo add-on | $400 one-time |

Add to existing Starter ($750), Growth ($1,200), or Premium ($3,500) tiers.
Or sell as standalone: $300–$700/mo depending on volume.

---

## Client Onboarding Checklist

### Step 1 — Client Intake (collect via discovery call or form)

- [ ] Business name + website URL
- [ ] Target city/location (e.g., "Columbia SC" or "Charlotte NC")
- [ ] Industry/niche (e.g., restaurant, salon, real estate, medical)
- [ ] Services they offer (list all)
- [ ] Target audience description
- [ ] Brand voice (3 words: e.g., "warm, expert, faith-driven")
- [ ] Topics to avoid
- [ ] CTA destination URL (booking link, phone, contact form)
- [ ] Email address for notifications (gets post alerts + social captions)
- [ ] GitHub repo URL or create new one for their site
- [ ] Netlify site URL
- [ ] Anthropic API key (or use Crown Media Group's key and bill usage)

### Step 2 — Create Client Config File

Copy `client-config-template.json` → `clients/[client-slug]/config.json`
Fill in all fields.

### Step 3 — Deploy to Railway

Each client gets their own Railway service:
```
railway login
cd Agency/products/auto-blogger-service
railway up --service "client-[slug]-blogger"
```
Set env vars in Railway dashboard:
- ANTHROPIC_API_KEY
- RESEND_API_KEY
- CLIENT_CONFIG_PATH=/app/clients/[slug]/config.json
- GITHUB_TOKEN (for git push)
- GITHUB_REPO (owner/repo)

### Step 4 — GitHub Actions (alternative to Railway)

For clients with GitHub repos:
1. Copy `.github/workflows/auto-blog-client-template.yml` to their repo
2. Add secrets: ANTHROPIC_API_KEY, RESEND_API_KEY
3. Done — runs 24/7 on GitHub's servers (free)

### Step 5 — Test Run

Trigger manual workflow dispatch → verify:
- Post generates correctly
- Brand voice matches
- CTA links are correct
- Email arrives with social captions

---

## Files in This Package

```
auto-blogger-service/
├── CLIENT-SETUP.md              ← This file
├── client-config-template.json  ← Copy for each client
├── blog-writer-client.js        ← Brand-aware writer (reads client config)
├── blog-researcher-client.js    ← Research engine (uses client niche)
├── blog-distributor-client.js   ← Email + social captions to client
├── blog-admin-server-client.js  ← Dashboard (runs locally or on Railway)
├── auto-blog-client-template.yml← GitHub Actions workflow template
└── clients/                     ← One folder per client
    └── example-client/
        └── config.json
```

---

## Revenue Math

5 Auto-Blog clients at Growth tier ($350/mo) = $1,750/mo recurring
10 clients = $3,500/mo
20 clients = $7,000/mo

Each client takes ~2 hours to set up.
After setup: zero ongoing work.

This is the passive income engine.

---

*Crown Media Group | All Glory to Jesus | crownmediagroup.co*
