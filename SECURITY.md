# Security Policy — Crown Media Group

**Owner:** David King (king@crownmediagroup.co)
**Last reviewed:** 2026-05-16
**Status:** Production hardening pass complete. Items flagged "deferred" below are tracked for a future session.

---

## Reporting a vulnerability

If you discover a security issue, email **king@crownmediagroup.co** with:
- A description of the vulnerability
- Steps to reproduce
- The URL, function, or component involved
- Your contact info (optional — anonymous reports welcome)

Please don't publicly disclose the issue until we've had a chance to fix it. We read every report and respond within 72 hours.

---

## Security posture (what we do)

### Authentication & authorization
- **No hardcoded secret fallbacks** — every authenticated endpoint requires its env var to be set; if missing, the endpoint fails closed (returns 503 or 401). Specifically: `SEED_TOKEN` (Kingdom Reach API), `EDGE_INTERNAL_SECRET` (Edge bot runner + daily brief), `STRIPE_WEBHOOK_SECRET`, `EDGE_BOT_KEY_SECRET`.
- **Stripe webhook signature verification** is enforced via `stripe.webhooks.constructEvent()` on every `customer.subscription.*` and `checkout.session.completed` event.
- **CRM** uses bcrypt-hashed passwords, HttpOnly + SameSite=Strict + Secure session cookies, rate-limited login (5 attempts / 15 min), and time-bounded sessions.
- **Kingdom Edge brokerage connection** logs every Alpaca-connect attempt to `edge_bot_connection_attempts`. If the same IP submits 2+ distinct emails inside 10 minutes, we email King. Subscribers also receive a confirmation email any time their Alpaca key is connected, with revoke instructions.

### Data protection
- **TLS everywhere** — both crownmediagroup.co (Netlify) and crm.crownmediagroup.co (Fly.io) force HTTPS.
- **AES-256-GCM encryption at rest** for sensitive secrets (Alpaca API keys). The master key (`EDGE_BOT_KEY_SECRET`) lives only in the Netlify environment, never in the database.
- **No plaintext PII in server logs** — CRM login events log a 12-char SHA-256 hash of the email and IP, not the raw values.
- **Parameterized queries** for all dynamic SQL inputs. The Kingdom Reach `org_type` filter uses a hard-coded enum whitelist + parameter binding to prevent injection.

### Input validation & abuse prevention
- **All POST endpoints validate inputs** before any side effects (DB write, email send, paid-API call).
- **Music intake** (`/api/music-intake`) requires a paid order on the submitting email + rate-limits to 2 briefs / hour / email. No anonymous brief submissions.
- **Music download** (`/api/music-download`) verifies the email owns a paid order for the specific track before issuing a signed URL — license-tier downloads are tied to the buyer.
- **CRM API** has rate limits: 5 logins / 15 min, 120 API requests / minute, 5 mass-send campaigns / hour.

### Headers
The Netlify configuration sets these on every response:
- `Content-Security-Policy` with locked `frame-ancestors 'none'`, narrow `connect-src` allow-list
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=()`

### Email and outreach hygiene
- Every Kingdom Reach campaign email carries a one-click unsubscribe link signed with an HMAC token. Confirmed unsubscribes are excluded from all future campaign-send queries.
- We never sell, rent, or trade customer email addresses.

### CORS
- Netlify functions that handle side-effects (`scout-apply`, `contact`, `custom-pkg`, `log-contract`, `summarize`) restrict `Access-Control-Allow-Origin` to `https://crownmediagroup.co`.
- The CRM allows the production domain in all environments; `localhost:*` only when `NODE_ENV !== 'production'`.

---

## Required environment variables (fail-closed)

If any of these are unset in production, the corresponding feature fails closed (returns 503 or 401). We never use a hardcoded fallback.

| Variable | Used by | What happens if unset |
|----------|---------|----------------------|
| `SEED_TOKEN` | Kingdom Reach API token-bypass routes | All token-bypass requests fail; session login still works |
| `EDGE_INTERNAL_SECRET` | `edge-bot-runner`, `edge-daily-brief` | Both endpoints return 503 |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` signature verification | `constructEvent()` throws → 400; no orders processed |
| `EDGE_BOT_KEY_SECRET` | AES-256-GCM encryption of Alpaca API keys | `edge-alpaca-connect` returns 500 — no keys are stored unencrypted |
| `SUPABASE_SERVICE_ROLE_KEY` | All Supabase server-side access | Functions return 500 — no data writes |
| `RESEND_API_KEY` | All transactional emails | Emails silently fail; user-facing operations still succeed |
| `EDGE_LIVE_ENABLED` | Live-mode unlock for Edge trading bot | If unset or != 'true', live trading is permanently blocked |

---

## Audit findings (2026-05-16) — status

### Fixed this pass
- ✅ `KingdomSeed2026` hardcoded fallback removed from Kingdom Reach (token bypass now requires the env var match)
- ✅ `EdgeBrief2026` hardcoded fallback removed from `edge-bot-runner` + `edge-daily-brief`
- ✅ SQL string-concat in Kingdom Reach `org_type` filter replaced with whitelist + parameter bind
- ✅ Music intake locked to paid-order-only + rate-limited
- ✅ Music download verifies license-order ownership for one-time purchases
- ✅ Edge Alpaca connect logs every attempt, alerts on anomaly, sends confirmation email
- ✅ Permissive CORS removed from 5 Netlify functions that have side effects
- ✅ CRM `localhost` origins gated behind `NODE_ENV`
- ✅ CRM login logs hash emails + IPs (no plaintext PII)
- ✅ Privacy Policy at `/privacy.html` (covers all products + data flows)
- ✅ Terms of Service at `/terms.html`
- ✅ Cookie consent banner at `/assets/cookie-consent.js`
- ✅ Unsubscribe flow for Kingdom Reach campaign emails (signed link → `/unsubscribe.html` → CRM endpoint → DB flag → all future sends exclude)
- ✅ Supabase migration `0005_security_hardening.sql` covers all schema changes

### Deferred — King's explicit go required
- ⏳ **Force-rewriting git history** to purge `KingdomSeed2026` token references. The rotated `SEED_TOKEN` makes the old token useless in practice, but the pattern is still visible in commits. Action requires force-push + team coordination.
- ⏳ **Full CSP refactor** to drop `unsafe-inline` for scripts. Requires rewriting every inline `<script>` block across every page to use external files + nonces.
- ⏳ **KMS / Vault for `EDGE_BOT_KEY_SECRET`** — currently lives in Netlify env. Moving to AWS KMS or HashiCorp Vault adds rotation + decryption audit trail.
- ⏳ **Per-IP rate limiting** on Netlify functions (best done via Netlify Pro or a Cloudflare layer).
- ⏳ **Magic-link confirmation** for Alpaca connection — proper email-ownership verification.
- ⏳ **Soft-delete + audit log** on `admin-delete-order.mjs`.

---

## What King MUST do manually after the 2026-05-16 hardening pass

These are tracked in detail at `Agency/ops/notes/KINGS-ACTION-LIST.md`. Top three:

1. **Rotate `SEED_TOKEN`** in Fly.io secrets (the old `KingdomSeed2026` value is now useless — set a new strong value).
2. **Rotate `EDGE_INTERNAL_SECRET`** in Netlify env (the old `EdgeBrief2026` is now useless — set a new strong value).
3. **Confirm `EDGE_BOT_KEY_SECRET` is set** in Netlify env. Without it, Alpaca connect now fails closed instead of using a weak default.
4. **Run migration `0005_security_hardening.sql`** in the Supabase SQL editor.
5. **Update any local scripts** that previously curl'd the Kingdom Reach API with `KingdomSeed2026` to use the new token (Agency/ops/outreach/*.sh).
