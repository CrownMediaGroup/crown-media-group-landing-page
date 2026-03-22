---
description: Create and post social content from plain English. Generates platform-specific captions via Claude, optional video via ffmpeg, shows captions in chat for approval, then posts to all platforms simultaneously.
---

# Create Post — Full Pipeline (Natural Language)

King described what to post. Run the pipeline in TWO steps:
1. Generate captions + show them in chat (dry-run + skip-preview)
2. When King approves, re-run with --auto-approve --skip-preview using the saved captions-file

No confirmation needed. No questions unless topic is completely absent.

---

## INPUT: `$ARGUMENTS`

Parse his English into the flags below.

---

## PARSING RULES

### Topic
- Everything King says describing the content IS the topic
- Strip platform references, client names, video flags — isolate the core message
- REQUIRED — if completely absent, ask: "What do you want to post about?"

### Client
- "shatiea" / "juice" / "fruit of the spirit" / "Shatiea's" → `--client shatiea`
- Everything else → omit (default: crown)

### Video flag
- "video" / "make a video" / "video post" / "reel" / "reel about" → `--video`
- "for TikTok" → `--video` (TikTok requires video)
- Default: NO video (image post)

### Orientation (only relevant with --video)
- "portrait" / "vertical" / "for Reels" / "for TikTok" → `--orientation portrait` (default)
- "square" / "feed post" / "1080x1080" → `--orientation square`

### Platform
- "instagram" / "IG" / "gram" → `--platform instagram`
- "facebook" / "FB" → `--platform facebook`
- "twitter" / "X" → `--platform x`
- "tiktok" → `--platform tiktok` + add `--video`
- "threads" → `--platform threads`
- "all" / "everywhere" / "all platforms" → omit (default: all)
- Default (nothing specified) → omit (default: all)

### Text overlay (video only)
- If King gives a specific headline/tagline for the video → `--text "headline"`
- Otherwise omit

### Dry run / test
- "test" / "preview only" / "don't post" / "dry run" / "just show me" → stop after Step 1, don't proceed to Step 2

---

## EXECUTION — TWO-STEP FLOW

### Step 1: Generate captions (show in chat)
```
Bash: node Agency/tools/social-creator.js --topic "<topic>" [--client shatiea] [--video] [--platform <platform>] [--orientation <portrait|square>] [--text "<overlay>"] --dry-run --skip-preview
```

After running Step 1:
- Print the generated captions directly in chat (copy from terminal output)
- Ask King: "Approve? Type **post it** to publish, or tell me what to change."

### Step 2: Post (only when King approves)
When King says "post it", "looks good", "yes", "go", "send it", "approved":
- Note the captions-file path from Step 1 output (Agency/tools/output/captions-[ts].json)
- Run:
```
Bash: node Agency/tools/social-creator.js --topic "<same topic>" --captions-file "<path>" [same other flags except --dry-run] --auto-approve --skip-preview
```

If King requests edits instead of approving, update the specific caption in chat, re-run Step 1 with a revised topic, or manually edit the captions JSON and run Step 2.

Run from: `c:\Users\ldavi\Documents\AllGloryAgency`

---

## EXAMPLES

King: "create a post about how Crown Media Group is changing Columbia SC"
Step 1: `node Agency/tools/social-creator.js --topic "Crown Media Group is changing the marketing game in Columbia SC" --dry-run --skip-preview`
[Show captions] → King says "post it"
Step 2: `node Agency/tools/social-creator.js --topic "Crown Media Group is changing the marketing game in Columbia SC" --captions-file "Agency/tools/output/captions-[ts].json" --auto-approve --skip-preview`

King: "make a video reel about Shatiea's juice for TikTok"
Step 1: `node Agency/tools/social-creator.js --topic "Shatiea Fruit of the Spirit Juice" --client shatiea --video --platform tiktok --dry-run --skip-preview`

King: "test a Shatiea post, don't actually post it"
Step 1 only: `node Agency/tools/social-creator.js --topic "Shatiea faith-based juice Columbia SC" --client shatiea --dry-run --skip-preview`
[Stop here — dry run only]

---

## WHAT HAPPENS

Step 1: Claude Haiku generates 5 platform-specific captions (IG, FB, X, TikTok, Threads) — shown in chat
Step 2 (on approval): Posts to IG, FB, X, Threads simultaneously. TikTok only with --video.
Captions saved to Agency/tools/output/captions-[ts].json

---

## AFTER POSTING

Report each platform on one line:
`[PLATFORM] Posted → "[first 60 chars of caption]"`

Then stop. No summaries.
