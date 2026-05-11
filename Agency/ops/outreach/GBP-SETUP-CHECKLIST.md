# Crown Media Group — Google Business Profile Setup
Owner: King · Built: 2026-05-11 · Goal: GBP verified within 7 days, top-3 ranking for "marketing agency Columbia SC" within 60 days.

---

## STEP 1 — Audit + claim (manual, 10 minutes)

1. Open an incognito tab. Search Google for: `Crown Media Group Columbia SC`.
2. **If a listing appears** on the right-side knowledge panel or in the Maps strip:
   - Click "Own this business?" → start verification.
   - If it's already claimed by someone else (rare), click "Suggest an edit" + contact GBP support to claim ownership.
3. **If no listing exists** (most likely):
   - Go to https://business.google.com → sign in as `king@crownmediagroup.co`.
   - "Add your business" → name: `Crown Media Group`.
   - Category: `Marketing agency` (primary).
   - Service area business: **YES** (we serve clients, customers don't visit us). Add: Columbia SC, Lexington SC, Irmo SC, West Columbia SC, Cayce SC, Blythewood SC, Forest Acres SC.
   - Address: use King's home address (29229) — Google won't display it publicly for service-area businesses.
   - Phone: +1-908-848-1436 (matches schema).
   - Website: https://crownmediagroup.co
4. Verification: Google will offer postcard / phone / video. **Video verification is fastest** — record a 30-second walk-through showing the business name, work area, and proof of operation. Phone is next-fastest. Postcard takes ~5 business days to Columbia.

---

## STEP 2 — Optimize the profile (15 minutes after verification clears)

### Categories
- **Primary**: Marketing agency
- **Secondary** (add all that apply): Advertising agency, Internet marketing service, Website designer, Social media marketing agency, Graphic designer

### Description (paste verbatim, 729 chars — under the 750 limit)
> Crown Media Group is a faith-driven, AI-powered marketing agency based in Columbia, SC. We help small businesses, churches, and faith-based organizations across the Midlands grow their reach with custom websites, social media management, paid ads, AI video production, and brand strategy. Built on excellence as unto the Lord (Colossians 3:23), we deliver agency-quality results at small-business budgets. Founded by David King. Serving Columbia, Lexington, Irmo, West Columbia, Cayce, Blythewood, and Forest Acres. AI-native. Faith-aligned. Results-first.

### Hours
- Mon-Fri: 9:00 AM – 6:00 PM
- Sat-Sun: Closed (or "By appointment" if King wants weekend leads)

### Services (add as individual service lines)
1. Social Media Management — `Monthly content + scheduling, captions, hashtags, analytics. Faith-aligned brand voice.`
2. Custom Website Design — `Mobile-first, SEO-ready websites for businesses and ministries. Built fast, launched faster.`
3. Paid Advertising (Meta + Google) — `Lead-gen campaigns, geo-targeted to Columbia SC + Midlands.`
4. AI Video Production — `Reels, Shorts, YouTube — script + voice + visuals via AI pipeline.`
5. Brand Identity Design — `Logos, color systems, typography, brand books.`
6. Local SEO + Google Business optimization — `Get found on Google Maps + local search results.`

### Photos (upload at least 10 — these compound visibility 2-3x)
- Crown Media Group logo (square 1080x1080 from /logo.png — crop)
- Headshot: David King CEO
- Workspace photo (King at the laptop / setup)
- Sample client website screenshot (Shatiea — archived but visual proof)
- Sample client work: Jim Reese site
- Sample social post grid
- Sample Reels still
- Lionheart Church project still
- Behind-the-scenes (1-2 shots — King filming/editing)
- City of Columbia skyline or recognizable Columbia landmark (helps geo-association)

### Posts (set up a weekly cadence)
- 1 Google Post per week minimum (limit: visible 7 days).
- Pull from `landing-page/content/blog/` — write a 150-word summary + CTA + the blog URL.
- This is free SEO juice. Most agencies skip it. Don't.

---

## STEP 3 — Reviews (drives ranking + trust faster than anything else)

Target: **5 reviews in 30 days, all ≥4 stars.**

Ask these clients in order (closest first):
1. Jim Reese — past site work
2. Lionheart Church — site + archive
3. Shatiea — archived client, may still review honestly
4. Any 2026 churches that have closed
5. Personal/professional contacts who can speak to the work

Use the REPUTATION email sequence at `Agency/ops/outreach/REPUTATION-SEQUENCE.md`.

**The review link**: once GBP is verified, Google gives a short URL like `g.page/r/...?review`. Copy that exact link into the emails — sending people to "search Google for us" loses 60% of would-be reviewers.

---

## STEP 4 — Submit sitemap to Search Console (5 minutes)

1. Go to https://search.google.com/search-console
2. Add property: `crownmediagroup.co` (domain property, not URL-prefix).
3. Verify via DNS TXT record (Cloudflare).
4. Submit sitemap: `https://crownmediagroup.co/sitemap.xml` — verify it exists first by curling that URL. If 404, the sitemap needs to be built — flag for follow-up.
5. Manually request indexing for the 5 highest-value pages (homepage, /portfolio.html, top 3 blog posts).

---

## STEP 5 — On-site verification (already done 2026-05-11)

- LocalBusiness JSON-LD schema extended in `landing-page/index.html`:
  - areaServed expanded to 7 Columbia-metro cities
  - `image` + `logo` fields added (points to /logo.png)
  - `slogan` field added
  - `knowsAbout` array added (8 topical SEO terms)
- Next site deploy ships these schema fields live.

---

## Success metrics (track weekly)

| Metric | Baseline (today) | 30-day target | 60-day target |
|--------|------------------|---------------|---------------|
| GBP status | Unclaimed | Verified | Verified + optimized |
| Google reviews | 0 | 5 (avg ≥4.5) | 12+ (avg ≥4.7) |
| Maps rank "marketing agency Columbia SC" | Not present | Top 10 | Top 3 |
| Direct GBP profile views/week | 0 | 50+ | 150+ |
| GBP-driven website clicks/week | 0 | 5+ | 15+ |
