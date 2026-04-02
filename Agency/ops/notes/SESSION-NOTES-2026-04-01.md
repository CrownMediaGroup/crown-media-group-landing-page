# Session Notes — 2026-04-01 (EOD)
## Crown Media Group | Claude Code

---

## COMPLETED THIS SESSION

### Site Fixes (all live on crownmediagroup.co)
- Fixed broken character encoding (â instead of —) in index.html
- Fixed BOOK A CALL nav button cut-off on all blog posts
- Rebuilt all 11 blog posts with nav fix + updated service links
- Fixed sitemap invalid date (fallback-post.md had DATE_PLACEHOLDER)
- Fixed build script pointing to wrong file (build-blog.js → build-blog.cjs in package.json)
- Removed "Optional Add-on" label from $35/mo website upkeep on ai-tools.html

### Google Search Console — LIVE
- Verified crownmediagroup.co (auto-verified instantly via HTML meta tag)
- Sitemap submitted: /sitemap.xml — 18 pages, status: Success
- Geo meta tags + LocalBusiness JSON-LD already live

### Blog Service Links — UPDATED
- All blog hyperlinks now point to ai-tools.html with correct tab anchors:
  - social media → ai-tools.html#social
  - paid ads → ai-tools.html#ads
  - logos → ai-tools.html#logos
  - websites → ai-tools.html#websites
  - Calendly (booking/meeting) → unchanged
- Hash-based tab routing added to ai-tools.html (ai-tools.html#social auto-opens that tab)

### AI Summarize Button — FIXED
- Rewrote summarize.mjs to use direct fetch (no SDK bundling issues)

### YouTube Video Pipeline — FIXED, WAITING ON KEY
- Fixed all hardcoded Windows ffmpeg paths → FFMPEG_PATH env → Linux → WinGet path → fallback
- Removed dead code, fixed float crop (608:1080:656:0)
- Dry run passes: 7 segments, ~156s for Facebook Ads post
- Script generation (Claude) works. Blocked on ELEVENLABS_API_KEY.

---

## SINGLE BLOCKER FOR YOUTUBE PIPELINE

**ELEVENLABS_API_KEY is missing from .env**
- Get at: elevenlabs.io → Profile → API Keys
- Add to: landing-page/.env
- Then run: `cd landing-page && node scripts/blog-to-video.js --skip-upload --skip-social`

### GitHub Secrets needed for auto-video Action:
- ELEVENLABS_API_KEY
- YOUTUBE_SERVICE_ACCOUNT_JSON (base64 service account from Google Cloud Console)
- RECRAFT_API_KEY (already in .env — just needs adding to GitHub secrets)

---

## PENDING — KING MUST DO
1. **ElevenLabs key** → elevenlabs.io → add to .env
2. **Google Business Profile** → business.google.com → claim "Crown Media Group" → set service area (Columbia SC) → video verify from home office
3. **YouTube service account** → Google Cloud Console → create service account → share with YouTube channel → base64 encode → add as GitHub secret

---

## NEXT BUILD — GSC INTEGRATION ON BLOG (not started)
King asked to connect Google Search Console data to blog so posts sort dynamically by performance.
Plan:
- scripts/gsc-client.js — fetch clicks/impressions/position/CTR per URL via googleapis
- /api/gsc endpoint in blog-admin-server.js
- "Search Performance" tab in admin panel
- Blog index: sort by clicks once data builds (GSC just set up today — data in 2-3 weeks)
Needs: GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT env var

---

## LAST COMMITS
- 561819b — remove 'optional add-on' label
- b42cd5f — video pipeline path fixes
- 2a57ba8 — summarize fix, service links, hash routing, encoding fix
- e587e77 — sitemap date fix, blog rebuild
