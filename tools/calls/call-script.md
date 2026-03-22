# Crown Media Group — AI Call Script
# Anointed Cuts first call: (803) 865-0233

---

## INTRO (plays on answer)

"Hi, this is an automated message from Crown Media Group — an AI-powered marketing agency here in Columbia, South Carolina.
We help local businesses get more customers through social media and digital marketing.
We'd love to offer you a FREE content audit — no cost, no strings attached.
Press 1 to learn more or to schedule a quick call.
Press 9 to be removed from our list.
Thank you and God bless."

---

## RESPONSES

### Press 1 — INTERESTED
"Excellent! We'll have someone from Crown Media Group reach out to you shortly to schedule your free audit.
You can also book directly at crownmediagroup.co/book.
Thank you — God bless!"

→ Log: INTERESTED in Supabase
→ King notification: HOT LEAD — [number] pressed 1 — follow up now
→ Auto-send Calendly link if email available

### Press 9 — OPT OUT
"You've been removed from our list. Have a wonderful day."

→ Log: OPT_OUT in Supabase
→ Never call again

### No keypress — NO RESPONSE
"We didn't catch a response. Feel free to call us back at any time. Have a great day."

→ Log: NO_RESPONSE
→ Retry in 48 hours (max 2 retries)

### No answer / Voicemail — NO_ANSWER
→ Log: NO_ANSWER
→ Retry in 48 hours (max 2 retries)

### Busy — BUSY
→ Log: BUSY
→ Retry in 4 hours

---

## VOICEMAIL VERSION (20 seconds)

"Hi, this is Crown Media Group — an AI-powered marketing agency in Columbia SC.
We help local businesses like yours get more customers.
We'd love to give you a FREE content audit.
Call us back or visit crownmediagroup.co. God bless — have a great day."

---

## OBJECTION HANDLING (for live follow-up, not automated)

| Objection | Response |
|---|---|
| Too expensive | "What's it costing you right now with no marketing?" |
| Think about it | "What would help you feel confident deciding today?" |
| Do it myself | "I'll show you AI-powered results for free first." |
| No budget | "Want to start smaller and scale up with results?" |
| Not interested | "Totally understand — can I ask what's working for you currently?" |

---

## SUPABASE LEAD STATUS VALUES

| Status | Meaning |
|---|---|
| new | Never called |
| NO_ANSWER | Didn't answer, retry eligible |
| BUSY | Line busy, retry in 4hrs |
| NO_RESPONSE | Answered, no keypress |
| OPT_OUT | Pressed 9, never contact again |
| INTERESTED | Pressed 1 — HOT LEAD |
| COMPLETED | Call completed, outcome logged |
| FAILED | Call failed, check number |

---

## ENV VARS NEEDED

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=+1XXXXXXXXXX
WEBHOOK_BASE_URL=https://your-ngrok-or-railway-url
ELEVENLABS_API_KEY=         (optional — upgrade from Polly TTS)
ELEVENLABS_VOICE_ID=        (optional)
```

Add to: security/VAULT.md (gitignored)
Also add to: .env (gitignored)

---

## SETUP STEPS

1. Sign up at twilio.com → free trial gives phone number + $15 credit
2. Get Account SID + Auth Token from Twilio console
3. Set env vars in .env
4. Start ngrok: `ngrok http 4001` → copy HTTPS URL → set as WEBHOOK_BASE_URL
5. Run: `node tools/calls/call-agent.js +18038650233`
6. Anointed Cuts call fires immediately

All Glory to Jesus.
