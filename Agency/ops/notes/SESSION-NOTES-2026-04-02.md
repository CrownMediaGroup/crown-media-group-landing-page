# Session Notes — 2026-04-02
## Crown Media Group | Claude Code

---

## COMPLETED THIS SESSION

### YouTube Pipeline Fixes
- Blog link moved to LINE 2 of all YouTube descriptions (visible before "Show more")
- Bulk updated all 9 live YouTube videos via YouTube Data API — 9/9 updated, 1 skipped (seo-vs-geo, no URL)
- Fixed `youtube-uploader.js` and `update-youtube-descriptions.js` — both now put link on line 2

### Blog Scheduler Optimization
- Updated cron times to global-optimal schedule: 9AM / 12PM / 4PM (Tue-Thu) / 8PM EST
- Removed Columbia SC hardcoding from auto-research — now generates global AI marketing topics
- Saturday (Sabbath) still blocked

### Memory System Updates (new files)
- `feedback_windows_node_gotchas.md` — 4 Windows/Node bugs to never repeat
- `feedback_take_initiative.md` — PERMANENT: Claude acts autonomously, never delegates what code can do
- `project_youtube_pipeline_status.md` — 9 videos live, social errors, description format fixed
- `reference_youtube_production_stack.md` — full elite channel research, tool tiers, avatar spec, domination philosophy
- `reference_claude_mythos.md` — Claude Mythos details, MindStudio bridge, upgrade path

### Plans Built (all in memory)
- 12-step YouTube Domination Plan (rivals @airevolutionx)
- Retention + Engagement Arsenal (re-hook, open loops, screen-grab moments, sound design)
- 12-step Token Optimization Plan
- AI Avatar Presenter Plan (HeyGen — young Black businessman, @miramakesai quality)
- Full System Coherence Audit (past/present/future unified flow)

---

## NEXT SESSION — START HERE

### 5 IMMEDIATE ACTIONS (in order)
1. **HeyGen Avatar** — go to heygen.com → Create Avatar → young Black businessman, navy/charcoal turtleneck, gold accent, soft bokeh background with blue ambient light → lock in character → copy HEYGEN_AVATAR_ID → add to .env
2. **FAL_KEY** — go to fal.ai/dashboard/keys → copy "Crown Media Group — Video Pipeline" key → paste here → Kling AI motion video activates immediately
3. **Netlify env vars** — app.netlify.com → Site → Environment Variables → add ANTHROPIC_API_KEY + GEMINI_API_KEY → redeploy
4. **EXA_API_KEY** — get at exa.ai (free tier) → add to .env AND .mcp.json under exa server → reload VS Code → trend research activates
5. **Epidemic Sound** — sign up at epidemicsound.com ($15/month) → download 3 cinematic tracks → save to landing-page/content/blog/video-output/music/ → wire into pipeline Step 6

### After Those 5 (build order)
- Wire HeyGen API call into pipeline.js (avatar A-roll generation)
- Wire Veo 3 API for cinematic b-roll (replaces Recraft static frames)
- Add sound design layer to FFmpeg assembly (music bed + SFX)
- Add kinetic captions (Whisper → SRT → FFmpeg burn-in)
- Add prompt caching to script-generator.js and blog-writer.js (token optimization Step 2)

---

## SYSTEM STATUS

### LIVE & WORKING
- crownmediagroup.co (Netlify)
- 11 blog posts with pre-baked summaries
- Auto-blogger (daily posts)
- Blog admin panel (port 4001)
- 9 YouTube videos (descriptions updated)
- Video pipeline (script → frames → TTS → FFmpeg → YouTube)
- Social distribution (IG/TikTok — 4 working, 5 with login errors)
- CRM (crm.crownmediagroup.co)
- Stripe + Supabase + Railway
- All 12 automation tools in tools/

### BLOCKED (needs King's input)
- FAL_KEY — paste to unlock Kling AI
- ANTHROPIC_API_KEY on Netlify — set in dashboard
- HeyGen avatar — create at heygen.com
- EXA_API_KEY — get at exa.ai
- Epidemic Sound — sign up $15/month
- Social login refresh — 5 videos have IG/TikTok errors (re-lock sessions)
- seo-vs-geo YouTube upload — retry pending

---

## THE VISION REMINDER
Crown Media Group = AI-powered marketing + biblical wisdom + servant heart
Avatar: young Black businessman. Faith-infused. Calm authority.
Goal: Make @miramakesai and every competitor look like 2022 tools — not by competing, by being so excellent that the gap speaks for itself.
"A good name is more desirable than great riches." — Proverbs 22:1
