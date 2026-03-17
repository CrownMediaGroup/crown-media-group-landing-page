# Crown Media Group — Business Stack
## All Glory to Jesus Global LLC | Updated 2026-03-16

---

## INSTALLED & RUNNING (Local)

| Tool | Status | Access |
|---|---|---|
| n8n | Running | localhost:5678 |
| Redis | Docker container | localhost:6379 |
| Node 24 / npm 11 | Ready | - |
| Python 3.14 | Ready | - |
| Ollama 0.18.0 | Ready | localhost:11434 |
| ngrok 3.37 | Ready | CLI |
| FFmpeg 8.0 | Ready | CLI |
| yt-dlp | Ready | CLI |
| Playwright 1.58 | Ready | CLI |
| GitHub CLI 2.88 | Ready | CLI |
| Stripe CLI 1.37 | Ready | CLI |

---

## ACCOUNTS TO CREATE (Do in this order)

### 1. Stripe — Collect Money
- signup: stripe.com/register
- Connect bank account immediately
- Add to .env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET
- Run locally: `stripe login` then `stripe listen --forward-to localhost:3000/webhook`

### 2. Supabase — Database
- signup: supabase.com (free)
- Create project: "allglory-agency"
- Add to .env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
- Tables to create: clients, leads, invoices, onboarding_submissions

### 3. Resend — Transactional Email
- signup: resend.com (free — 3k emails/mo)
- Verify domain: crownmediagroup.co
- Add to .env: RESEND_API_KEY
- Use for: onboarding confirmations, invoices, proposals

### 4. Cloudflare — CDN + Storage
- signup: cloudflare.com (free)
- Add domain: crownmediagroup.co (move DNS from Namecheap)
- Enable R2 storage for client media assets
- Benefits: DDoS protection, fast global CDN, free SSL

### 5. GoHighLevel — Agency OS ($97/mo)
- signup: gohighlevel.com/agency
- White-label as Crown Media Group
- Every client gets a sub-account
- Replaces: CRM, email sequences, funnels, booking, reputation management, SMS
- Resell sub-accounts at $97-297/mo (profit center)

---

## PHASE 2 ACCOUNTS (At 10+ clients)

### Beehiiv — Email Newsletter
- signup: beehiiv.com (free up to 2,500 subs)
- Use for: Crown Media weekly newsletter to Columbia SC business owners
- This becomes a lead gen engine

### Metricool — Social Scheduling
- signup: metricool.com (free plan available)
- Connect: @mkdavidking + Crown Media Group page + each client account
- Schedule 30 days of posts at once

### PostHog — Analytics
- signup: posthog.com (free up to 1M events/mo)
- Install on every client's website
- Track: page views, form fills, button clicks, conversions
- Show clients proof their traffic is growing

### Loom — Client Reporting
- signup: loom.com (free)
- Record 2-min monthly report videos per client
- Saves 10hrs/mo of calls

---

## SCALE STACK (50+ clients)

| Tool | Purpose | When |
|---|---|---|
| Hetzner VPS | Move off Railway (~$5-20/mo vs Railway costs) | 20+ clients |
| Upstash Redis | Serverless Redis for n8n queues | n8n gets slow |
| Cloudflare Workers | Edge functions, API routing | high traffic |

---

## SECURITY CHECKLIST

- [x] .gitignore created — all secrets blocked from git
- [x] .env files protected
- [x] service-account-key.json gitignored
- [ ] Rotate Anthropic API key (URGENT)
- [ ] Rotate Twilio 2FA recovery code + move out of repo
- [ ] Enable 2FA on: Stripe, Supabase, Cloudflare, GHL, GitHub
- [ ] Store all credentials in Bitwarden (free password manager)

---

## ENV VARIABLES MASTER LIST
All keys go in: Agency/.env and client-onboarding-system/.env

```
# AI
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# Payments
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Database
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

# Email
RESEND_API_KEY=
GMAIL_USER=ldavid226@gmail.com

# SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Analytics
POSTHOG_API_KEY=

# Agency OS
GHL_API_KEY=

# Infrastructure
REDIS_URL=redis://localhost:6379
N8N_WEBHOOK_URL=
NGROK_AUTHTOKEN=
```
