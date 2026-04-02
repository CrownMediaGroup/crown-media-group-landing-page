# CROWN MEDIA GROUP — 13-STEP CYBERSECURITY MASTER PLAN
# Version 1.0 | Created: 2026-04-02 | Owner: King
# RULE: Protect AND preserve. Never delete. King always has full access.

---

## PRIORITY ORDER — DO THESE FIRST

---

## STEP 1 — TODAY (15 min) | Rotate & Secure API Keys
**Protects:** Anthropic, Stripe, ElevenLabs, Resend, Gmail, Twilio, Supabase, YouTube
**How:**
1. Go to each service → regenerate the API key
2. Update .env with new key
3. Verify service still works
4. Confirm .env is in .gitignore: `git rm --cached .env` if not
5. Add API keys to Railway + Netlify environment variables (not just .env)

**Contingency:** Keep old keys in 1Password for 30 days before fully revoking
**King's access:** All keys in Railway/Netlify env vars — King can see/edit anytime

---

## STEP 2 — TODAY (15 min) | Enable 2FA on All Critical Accounts
**Protects:** GitHub, Railway, Netlify, Supabase, Google Workspace from account takeover
**How:**
- GitHub → Settings → Security → Two-factor authentication → Authenticator app
- Railway → Account → Security → Enable 2FA
- Netlify → User Settings → Security → Two-factor
- Supabase → Account → Security → 2FA
- Google (king@crownmediagroup.co) → myaccount.google.com → Security → 2-Step

**Contingency:** Save all backup codes in 1Password immediately
**King's access:** Authenticator app on phone + backup codes in 1Password

---

## STEP 3 — TODAY (10 min) | Secure the .env File Permanently
**Protects:** All API secrets from accidental git exposure
**How:**
```bash
# Verify .env is ignored:
git status  # should NOT show .env

# If .env was ever committed, scrub history:
git rm --cached .env
git commit -m "security: remove .env from tracking"
git push
```
Add to Railway for every production service:
- ANTHROPIC_API_KEY
- SUPABASE_KEY + SUPABASE_URL
- TWILIO_* keys
- GMAIL_USER + GMAIL_APP_PASSWORD
- STRIPE keys
- ELEVENLABS_API_KEY
- EXA_API_KEY

**Contingency:** Local .env is backup. Railway env vars are production source of truth.
**King's access:** King has local .env + Railway dashboard access

---

## STEP 4 — THIS WEEK | Rotate All Social Media Passwords
**Protects:** Instagram, TikTok, Facebook, X, LinkedIn from hijacking/credential stuffing
**How:**
1. Change password on each platform → 20+ char with symbols
2. Store new password in 1Password → "Social Media" vault
3. Enable 2FA on each platform
4. Review → Settings → Connected Apps → remove unknown integrations
5. Test automation tools still work after password change

**Rotation Log** (update as you go):
| Platform | Password Rotated | 2FA On | Verified |
|----------|-----------------|--------|---------|
| Instagram | | | |
| TikTok | | | |
| Facebook | | | |
| X | | | |
| LinkedIn | | | |

**Contingency:** Test all automation (Buffer, social-post.js) before finalizing
**King's access:** All passwords in 1Password, recoverable via king@crownmediagroup.co

---

## STEP 5 — THIS WEEK | Set Up Automated Database Backups
**Protects:** All CRM contacts, interactions, leads from loss/corruption/ransomware
**How:**
1. Add daily backup script to CRM:
```js
// tools/crm/scripts/backup.js
import { execSync } from 'child_process';
const ts = new Date().toISOString().split('T')[0];
execSync(`cp tools/crm/crm.db tools/crm/backups/crm.db.${ts}`);
console.log(`Backup saved: crm.db.${ts}`);
```
2. Add npm script: `"backup": "node scripts/backup.js"`
3. Schedule via cron or Railway cron job: `0 2 * * *` (2 AM daily)
4. Enable Supabase automated backups: Dashboard → Settings → Backups → Enable (free, 7-day retention)

**Contingency:** Manual backup anytime: `npm run backup`
**King's access:** Backups folder in repo, timestamped. King restores via: `cp backups/crm.db.DATE crm.db`

---

## STEP 6 — THIS WEEK | Add Rate Limiting to Onboarding Server
**Protects:** allglory-onboarding-production.up.railway.app from brute force + spam
**How — add to king-review-webhook.js:**
```js
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,
  message: { error: 'Too many requests' }
});

app.use('/api/', limiter);
app.use('/internal/', rateLimit({ windowMs: 60000, max: 5 }));
```
Install: `npm install express-rate-limit` in client-onboarding-system

**Contingency:** If rate limit too strict, increase `max` value
**King's access:** King's IP not affected — he uses Railway dashboard directly

---

## STEP 7 — THIS MONTH | Add Audit Logging to CRM
**Protects:** Tracks every login, contact change, deletion for forensics
**How — add audit_logs table to tools/crm/database.js:**
```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id       INTEGER,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   INTEGER,
  details       TEXT,
  ip_address    TEXT
);
```
Log in server.js after every POST/PUT/DELETE on contacts.

**Contingency:** Audit table is append-only — never delete logs
**King's access:** King (superadmin) can query: `GET /api/admin/audit-logs`

---

## STEP 8 — THIS MONTH | Harden Security Headers (Beyond Helmet)
**Protects:** XSS, clickjacking, MIME sniffing, unauthorized resource loading
**How — update server.js:**
```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com'],
      imgSrc: ["'self'", 'data:', 'https://lh3.googleusercontent.com'],
      connectSrc: ["'self'", 'https://accounts.google.com'],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```
Also add to netlify.toml:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

**Contingency:** If CSP breaks functionality, loosen specific directive
**King's access:** Headers only affect visitors — King's access unaffected

---

## STEP 9 — THIS MONTH | Webhook Signature Verification
**Protects:** Prevents fake webhook injections from Twilio/Stripe/n8n
**How — add to king-review-webhook.js:**
```js
// Verify Twilio webhooks:
import twilio from 'twilio';
function validateTwilio(req, res, next) {
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    req.headers['x-twilio-signature'],
    `${process.env.WEBHOOK_BASE_URL}${req.originalUrl}`,
    req.body
  );
  if (!valid) return res.status(403).json({ error: 'Invalid signature' });
  next();
}

// Verify Stripe webhooks:
const event = stripe.webhooks.constructEvent(
  req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET
);
```

**Contingency:** Log invalid signatures without blocking first — verify before enforcing
**King's access:** King's manual API calls use auth token, not webhook path

---

## STEP 10 — THIS MONTH | DNS CAA Records (Prevent Cert Hijacking)
**Protects:** Prevents attackers from issuing SSL certs for crownmediagroup.co
**How — add to Cloudflare DNS:**
```
Type: CAA | Name: @ | Value: 0 issue "letsencrypt.org"
Type: CAA | Name: @ | Value: 0 issuewild "letsencrypt.org"
Type: CAA | Name: @ | Value: 0 iodef "mailto:king@crownmediagroup.co"
```

**Contingency:** If cert renewal breaks, verify CAA allows your CA
**King's access:** Cloudflare dashboard → DNS → King adds these 3 records in 2 minutes

---

## STEP 11 — THIS MONTH | Automated Dependency Scanning
**Protects:** Vulnerable npm packages from being exploited
**How:**
```bash
# Enable GitHub Dependabot:
# Repo → Settings → Code Security → Dependabot → Enable version + security updates

# Add to CI/CD (optional):
npm audit --audit-level=moderate

# Monthly manual check:
npm audit
npm audit fix
```

**Contingency:** `npm ci` reverts to last known-good lockfile
**King's access:** Review Dependabot PRs in GitHub before merging

---

## STEP 12 — ONGOING | Monthly Security Checklist (1st of each month, ~20 min)
```
□ Verify .env NOT in git: git status
□ Test login on CRM, portfolio admin
□ Check 2FA enabled on GitHub, Railway, Netlify, Supabase, Google
□ Run: npm audit
□ Verify daily backups are running
□ Test restore 1 backup
□ Check SSL cert expiry: curl -I https://crownmediagroup.co
□ Review audit logs for anything suspicious
□ Rotate any test/expired API keys
□ Update SECURITY-ROTATION-LOG.md
```

---

## STEP 13 — ONGOING | Incident Response Plan
**If API key compromised:**
1. Revoke key immediately in the service dashboard
2. Generate new key → update .env + Railway env vars → deploy
3. Monitor service logs for 24h
4. Log in SECURITY-ROTATION-LOG.md

**If database breached:**
1. Shut down CRM: `railway down`
2. Restore from last clean backup: `cp backups/crm.db.LASTGOOD crm.db`
3. Review audit logs to identify breach point
4. Clear all sessions: `DELETE FROM sessions`
5. Force re-login for all users
6. Restart: `railway up`

**If GitHub hacked:**
1. Revoke all personal access tokens: github.com → Settings → Developer settings → PATs
2. Review recent commits for malicious code
3. Reset password + re-enable 2FA
4. Audit who pushed code during breach window

**If email (king@crownmediagroup.co) compromised:**
1. Change password + force 2FA immediately
2. Revoke all active sessions in Google
3. Check recovery email/phone still correct
4. Rotate CRM session tokens: clear sessions table

---

## SECURITY ROTATION LOG
| Date | Type | Service | Action | Notes |
|------|------|---------|--------|-------|
| 2026-04-02 | Baseline | All | Plan created | Starting point |

---

## COMMAND CHEATSHEET
```bash
# Check .env not tracked
git ls-files .env

# Manual CRM backup
node tools/crm/scripts/backup.js

# Check SSL cert
curl -vI https://crownmediagroup.co 2>&1 | grep -E "expire|SSL"

# npm security audit
npm audit

# View CRM sessions (Railway console)
node -e "import('./tools/crm/database.js').then(m => console.log(m.default.prepare('SELECT * FROM sessions').all()))"
```

---

*All Glory to Jesus Global LLC | Crown Media Group*
*Security = Protect + Preserve. Never delete. Always accessible to King.*
