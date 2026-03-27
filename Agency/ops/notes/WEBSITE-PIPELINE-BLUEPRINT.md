# AI Website Pipeline — Blueprint
# Crown Media Group | Last updated: 2026-03-26
# Status: LIVE — fully tested end-to-end

---

## What It Does

Client pays $197 → fills intake form → Railway generates 1-page HTML site → Netlify deploys it → client gets live URL by email. Zero manual work.

---

## Full Pipeline Flow

```
1. Client clicks "Get My Website" on ai-tools.html
2. Stripe checkout fires ($197)
3. stripe-webhook.mjs:
   - Inserts Supabase row (status: 'awaiting_intake')
   - Sends client email with pre-filled Google Form link
   - Sends King "$197 sale" notification
4. Client submits Google Form (website intake)
5. Apps Script (apps-script-website-form.js) POSTs to:
   POST https://allglory-onboarding-production.up.railway.app/internal/generate-website
6. Railway (king-review-webhook.js):
   a. Responds immediately so Apps Script doesn't timeout
   b. Updates Supabase → status: 'processing'
   c. Calls generateWebsiteCopy() — Claude Haiku polishes copy
   d. Calls generateAndDeploy() — injects template + deploys
7. website-generator.js:
   a. selectTemplate() — routes to correct HTML template
   b. buildPalette() — builds 8-color palette from business type
   c. injectTemplate() — replaces all {{PLACEHOLDER}} vars
   d. createNetlifySite() — creates Netlify site (retry on name conflict)
   e. deployToNetlifySite() — ZIPs HTML, POSTs to Netlify API
   f. pollDeployReady() — polls until ssl_url is live
8. Back in king-review-webhook.js:
   - Updates Supabase (status: 'completed', website_url: live URL)
   - Sends client delivery email with live URL button
   - Sends King notification
```

---

## Template Routing — selectTemplate()

**File:** `client-onboarding-system/website-generator.js`

Routes based on `businessType + primaryService` combined text (lowercase):

| Template | Keywords |
|---|---|
| `restaurant.html` | restaurant, food, burger, pizza, taco, bbq, grill, cafe, diner, bar, kitchen, bakery, catering, cook, chef, eat, meal, sushi, wing, sandwich, sub, seafood, steakhouse |
| `beauty.html` | salon, barber, hair, nail, spa, beauty, lash, brow, wax, facial, skincare, makeup, estheti, aestheti, massage, grooming |
| `professional.html` | law, lawyer, attorney, legal, firm, litigation, consultant, consulting, accountant, cpa, financial, advisor, wealth, insurance, realtor, real estate, doctor, medical, dentist, dental, therapist, counselor, psychologist, psychiatrist, chiropractor, architect, engineer, notary, immigration, divorce, criminal, injury, accident |
| `service-business.html` | default (everything else) |

**Rules check order:** restaurant → beauty → professional → service-business (first match wins)

---

## Color Psychology Engine — buildPalette()

**File:** `client-onboarding-system/website-generator.js`

Auto-assigns an 8-color palette based on the template. Client can override primary + accent.

| Template | Primary | Accent | Dark | Dark2 | Card1/2/3 |
|---|---|---|---|---|---|
| professional.html | Navy `#1a1a3e` | Gold `#c9a84c` | `#0F0F1A` | `#16213E` | navy / gold / burgundy |
| restaurant.html | Crimson `#b91c1c` | Amber `#d97706` | `#1a0505` | `#2d0a0a` | red / amber / green |
| beauty.html | Rose `#9d174d` | Champagne `#d4af7a` | `#1a0510` | `#2d0a1a` | rose / champagne / plum |
| service-business.html | Royal blue `#1e3a8a` | Green `#16a34a` | `#0d1117` | `#161b22` | blue / green / orange |

If client sends a valid hex `primaryColor`, that overrides the default. Palette always builds 8 vars:
`--primary, --accent, --dark, --dark2, --card1, --card2, --card3, --cta-band, --section-alt`

---

## Template Placeholder Vars

All templates use `{{PLACEHOLDER}}` replaced via `replaceAll()` in `injectTemplate()`.

**Universal vars (all 4 templates):**
```
{{BUSINESS_NAME}}    {{TAGLINE}}          {{PRIMARY_SERVICE}}
{{SERVICE_1_NAME}}   {{SERVICE_1_DESC}}   {{SERVICE_2_NAME}}
{{SERVICE_2_DESC}}   {{SERVICE_3_NAME}}   {{SERVICE_3_DESC}}
{{CTA_TEXT}}         {{CTA_PHONE}}        {{CTA_LABEL}}
{{CTA_NOTE}}         {{ABOUT_TEXT}}       {{OWNER_NAME}}
{{PHONE_DISPLAY}}    {{EMAIL_DISPLAY}}    {{ADDRESS_DISPLAY}}
{{CITY}}             {{YEAR}}             {{HERO_VIDEO_URL}}
{{PRIMARY_COLOR}}    {{ACCENT_COLOR}}
```

**Extended palette vars (professional.html only):**
```
{{DARK_COLOR}}   {{DARK2_COLOR}}   {{CARD1_COLOR}}
{{CARD2_COLOR}}  {{CARD3_COLOR}}   {{CTA_BAND_COLOR}}   {{SECTION_ALT}}
```

**Restaurant-specific:**
```
{{MENU_ITEM_1_NAME}}  {{MENU_ITEM_1_DESC}}  {{MENU_ITEM_1_PRICE}}
{{MENU_ITEM_2_NAME}}  {{MENU_ITEM_2_DESC}}  {{MENU_ITEM_2_PRICE}}
{{MENU_ITEM_3_NAME}}  {{MENU_ITEM_3_DESC}}  {{MENU_ITEM_3_PRICE}}
{{HOURS_MON_FRI}}     {{HOURS_SAT}}         {{HOURS_SUN}}
```

**Beauty-specific:**
```
{{SERVICE_1_PRICE}}  {{SERVICE_2_PRICE}}  {{SERVICE_3_PRICE}}
```

---

## Hero Videos — Verified Working (2026-03-26)

All IDs verified HTTP 200. Format: `https://assets.mixkit.co/videos/{ID}/{ID}-720.mp4`

**professional.html** (law firm / attorney vibe):
- `6018` — attorney walking confidently with briefcase
- `46820` — judge pronounces sentence in courtroom
- `47602` — scales of justice
- `16108` — lawyer at desk with city skyline view
- `23115` — contract signing + handshake

**restaurant.html** (food / dining vibe — hardcoded rotation in JS):
- `47191, 12016, 24785, 47159, 11758, 14010, 48322, 47110`

**beauty.html** (salon / spa vibe):
- `40120` — styling hair in barbershop

**service-business.html** (general service):
- `21380` — woman cleaning house
- `5319` — cleaning bathroom surface
- `34661` — cleaning sofa fabric

**Video fallback:** All templates have JS that fires if video fails to load — hides `<video>` element, shows gradient background. Timeout: 4 seconds.

---

## Netlify Deploy Sequence

```javascript
// 1. Create site (retries on name conflict, appends -2, -3...)
POST /api/v1/sites { "name": "{slug}-cmg" }

// 2. Deploy ZIP (jszip builds HTML in-memory)
POST /api/v1/sites/{site_id}/deploys [zip buffer]

// 3. Poll until live (3s intervals, max 20 attempts)
GET /api/v1/deploys/{deploy_id}
→ returns ssl_url when state === 'ready'
```

Site naming: `{business-name-slugified}-cmg.netlify.app`

**Rate limits:** Netlify free tier — avoid more than 2-3 test deploys in 20 minutes or you'll get 429s. Wait ~1 hour to reset.

---

## AI Copy Generator

**File:** `client-onboarding-system/website-copy-generator.js`
**Model:** Claude Haiku (`claude-haiku-4-5-20251001`)
**Env var:** `ANTHROPIC_API_KEY` in Railway

Enhances: tagline, service descriptions, about text, CTA note. Falls back to raw intake data if it fails (`aiCopy || {}`). Silent failure — site still deploys.

---

## Competitor Research Step

**File:** `client-onboarding-system/website-generator.js` → `researchCompetitors()`
**Env vars:** `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` in Railway
**CX:** `85339a72ce1934407`

Searches top competitors per template type, feeds context to AI copy. Silent fallback if not configured.

---

## Key Files

```
client-onboarding-system/
├── king-review-webhook.js          ← Express server, /internal/generate-website endpoint
├── website-generator.js            ← selectTemplate, buildPalette, injectTemplate, deploy
├── website-copy-generator.js       ← Claude Haiku AI copy enhancer
├── templates/
│   ├── professional.html           ← Law, legal, medical, financial, consulting
│   ├── restaurant.html             ← Food + dining (has its own video rotation JS)
│   ├── beauty.html                 ← Salon, spa, barber
│   └── service-business.html       ← Everything else (default)
└── apps-script-website-form.js     ← Google Apps Script for intake form
```

```
landing-page/netlify/functions/
├── create-checkout.mjs             ← Stripe checkout — 'website-basic': $197
└── stripe-webhook.mjs              ← Post-payment: Supabase insert + intake email
```

---

## Railway Environment Variables Required

```
NETLIFY_TOKEN        ← nfp_ELuCvoA965JvGknqhHeWGGH7k2gKW8Wpb4d0
ANTHROPIC_API_KEY    ← sk-ant-api03-...
GOOGLE_CSE_KEY       ← AIzaSyAme1CkzT596eM8rz1v4JNeRwb4cGaoO1M
GOOGLE_CSE_CX        ← 85339a72ce1934407
SUPABASE_URL         ← https://pcikjtzvruvavaduawes.supabase.co
SUPABASE_SECRET_KEY  ← sb_secret_...
RESEND_API_KEY       ← re_Kg1npkbf_...
```

---

## Test End-to-End (Manual)

```bash
curl -X POST https://allglory-onboarding-production.up.railway.app/internal/generate-website \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Test Business",
    "ownerName": "John Smith",
    "primaryService": "Personal Injury Attorney",
    "service1Name": "Car Accidents", "service1Desc": "We fight for you.",
    "service2Name": "Slip & Fall",   "service2Desc": "We hold them accountable.",
    "service3Name": "Wrongful Death","service3Desc": "Justice for your family.",
    "tagline": "No Fee Unless We Win",
    "phone": "8035550100",
    "email": "test@test.com",
    "address": "123 Main St",
    "city": "Columbia SC",
    "ctaText": "Free Consultation",
    "stripeSessionId": "test_001"
  }'
```

Expected: `{"ok":true,"message":"Website generation started"}`
Site live at: `https://test-business-cmg.netlify.app` within ~45 seconds

---

## Known Gotchas

| Issue | Root Cause | Fix |
|---|---|---|
| Wrong template used | Railway running old code | Push any commit to trigger redeploy |
| Hero video is black | Dead Mixkit URL | Remove from HERO_VIDEOS list, re-test with curl |
| 429 from Netlify | Too many deploys in short window | Wait ~1 hour |
| AI copy blank | ANTHROPIC_API_KEY not set or Haiku timeout | Check Railway env vars — site still deploys with raw data |
| CTA shows "undefined" | ctaText not sent in payload | Always include ctaText in request |
| Site not found | Railway still building | Wait 2-3 min after git push before testing |

---

## Adding a New Template

1. Create `templates/new-template.html` with all `{{PLACEHOLDER}}` vars
2. Add video IDs to `HERO_VIDEOS['new-template.html']` in `website-generator.js` (verify 200 first)
3. Add palette entry to `PALETTES['new-template.html']` in `buildPalette()`
4. Add routing keywords to the correct key list in `selectTemplate()`
5. Add JS video fallback block before `</body>`
6. Push → Railway auto-deploys → test
