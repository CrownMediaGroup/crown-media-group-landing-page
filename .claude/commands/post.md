---
description: Post to social media using plain English. Parses natural language into the right platform, caption, and image automatically.
---

# Social Post — Natural Language Interface

King is telling you to post something to social media. Parse his English into a command and run it immediately. No confirmation needed. No questions unless a critical piece is missing.

---

## INPUT: `$ARGUMENTS`

Parse this natural language into the post parameters below.

---

## PARSING RULES

### Platform
- "instagram" / "IG" / "gram" → `instagram`
- "facebook" / "FB" → `facebook`
- "twitter" / "X" → `x`
- "tiktok" → `tiktok`
- "all" / "everywhere" / "all platforms" → `all`
- **Default (nothing specified) → `instagram`**

### Caption
- Use the exact text King provides
- If he says "write a caption about X" → write one first using his brand voice (bold, direct, faith-aligned), then use it
- King's voice: confident, no fluff, Columbia SC, faith-infused where natural, strong CTA

### Image
Use these available brand images (pick the most relevant or use post-1 as default):
- `assets/social/crown-media-post-1-ig.jpg` — Crown Media brand photo #1 (DEFAULT)
- `assets/social/crown-media-post-2-ig.jpg` — Crown Media brand photo #2
- `assets/social/crown-media-post-3-ig.jpg` — Crown Media brand photo #3
- If King specifies a file path, use that path directly
- If King says "no image" or "text only" → omit --image flag (only valid for X/Facebook)
- Instagram always needs an image — use default if none specified

### Video
- If King provides a video path or says "this video" → use `--video path`

---

## EXECUTION

Once parsed, run immediately:
```
Bash: node Agency/tools/social-post.js --platform <platform> --caption "<caption>" [--image <path>] [--video <path>]
```

Do NOT use `npm run post` — use the node command directly to avoid shell quoting issues with long captions.

---

## EXAMPLES

King says: "post to instagram: Crown Media Group just landed a new client in Columbia SC"
→ Run: `node Agency/tools/social-post.js --platform instagram --caption "Crown Media Group just landed a new client in Columbia SC" --image assets/social/crown-media-post-1-ig.jpg`

King says: "post everywhere that we're live"
→ Write a caption, then run with `--platform all`

King says: "post to X: Crown Media Group is the AI marketing agency Columbia SC has been waiting for. crownmediagroup.co"
→ Run with `--platform x` (no image needed for X)

King says: "post this Shatiea juice photo to instagram" + provides path
→ Use provided path, write a faith-aligned caption for Shatiea if none given

---

## AFTER POSTING

Report result in one line:
`[PLATFORM] Posted → "[first 60 chars of caption]"`

If it fails, show the error and suggest the fix. No summaries.
