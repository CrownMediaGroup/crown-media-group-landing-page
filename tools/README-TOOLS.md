# Agency Tool Stack — What Each Does + How to Use It

## ngrok — Expose Local Server to the Internet
**Use case:** Test webhooks from Stripe, n8n, Railway without deploying.
When your Railway server is down or you're building locally, ngrok gives it a public URL instantly.

```bash
# Expose your local onboarding server (port 3000)
ngrok http 3000

# Output: https://abc123.ngrok.io → your laptop
# Use that URL in Stripe webhooks, n8n triggers, etc.
```
**Requires free account:** ngrok.com → copy your authtoken → run:
```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

---

## GitHub CLI — Manage Code from Terminal
**Use case:** Push code, create repos, manage client projects without touching the browser.

```bash
# Login once
gh auth login

# Create a new repo for a client
gh repo create crown-media-client-site --private

# Check status of your Railway deployments via GitHub Actions
gh run list
```

---

## FFmpeg — Video Processing
**Use case:** Compress Reels before uploading, trim clips, extract audio, batch convert.

```bash
# Compress a video for Instagram (smaller file, same quality)
ffmpeg -i input.mp4 -vcodec libx264 -crf 23 output.mp4

# Extract audio from a video (for Whisper transcription)
ffmpeg -i video.mp4 -q:a 0 -map a audio.mp3

# Trim a clip (start at 0:10, grab 30 seconds)
ffmpeg -i input.mp4 -ss 00:00:10 -t 00:00:30 output.mp4
```

---

## yt-dlp — Download Any Video
**Use case:** Download competitor content for analysis, download your own posted content, repurpose footage.

```bash
# Download a YouTube video
yt-dlp https://youtube.com/watch?v=VIDEO_ID

# Download just the audio (for transcription)
yt-dlp -x --audio-format mp3 https://youtube.com/watch?v=VIDEO_ID

# Download Instagram Reel (while logged in)
yt-dlp --cookies-from-browser chrome https://instagram.com/reel/REEL_ID
```

---

## Whisper — Transcribe Audio/Video to Text (Free, Local)
**Use case:** Transcribe client discovery calls, turn videos into captions, repurpose podcast content.

```bash
# Transcribe an audio file
whisper audio.mp3 --model small

# Transcribe and output as text file
whisper video.mp4 --model small --output_format txt

# Transcribe in English only (faster)
whisper audio.mp3 --model small --language English
```
Models: tiny (fastest) → base → small → medium → large (most accurate)

---

## Playwright — Browser Automation
**Use case:** Screenshot client websites, scrape competitor posts, auto-fill forms, test your landing pages.

```bash
# Run a script
node tools/screenshot-client.js
```
See screenshot-client.js in this folder for a ready-to-run example.

---

## Stripe CLI — Test Payments Locally
**Use case:** Test your payment links and webhooks before going live with a client.

```bash
# Login
stripe login

# Listen for webhook events locally
stripe listen --forward-to localhost:3000/webhook

# Trigger a test payment
stripe trigger payment_intent.succeeded
```
