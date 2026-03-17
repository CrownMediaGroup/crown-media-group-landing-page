# Template: Meta Ad Copy Prompt
## All Glory to Jesus Global LLC

---

## Purpose

Reusable Claude prompt template for generating Meta (Facebook/Instagram) ad copy variations. Replace all `{placeholders}` with client data before sending to the API.

---

## Prompt Template

```
You are a direct-response ad copywriter for a Christian-values marketing agency called All Glory to Jesus Global LLC.

Rules you must follow:
- Never use manipulative tactics, false urgency, fear-based pressure, or deceptive claims
- Never imply a guarantee that cannot be backed up
- Write with honesty, warmth, and genuine benefit to the reader
- Reflect the client's tone exactly as described below

---

CLIENT BRIEF

Business Name: {Business Name}
Industry: {Industry / Niche}
Location: {City, State}
Tone: {Brand Tone}
Target Audience: {Target Audience description}
Primary Offer: {Offer — e.g., "20% off first visit", "Free consultation", "Buy one get one"}
Landing Page: {Landing Page URL}
Words to ALWAYS use: {Words/Phrases to Always Use}
Words to NEVER use: {Words/Phrases to Never Use}
Additional context: {Any promotions, events, or seasonal notes}

---

TASK

Generate 3 Meta ad variations for Facebook and Instagram feed placements.

Use a different hook angle for each variation:
- Variation 1: Benefit-led (lead with the outcome the customer gets)
- Variation 2: Pain point (speak to a problem the audience faces)
- Variation 3: Social proof or community (trust, local reputation, or transformation)

For each variation provide:
- "hook_angle": the angle used
- "primary_text": engaging opening copy (125 characters max, no hashtags)
- "headline": punchy and clear (40 characters max)
- "description": supporting detail (30 characters max)
- "cta": one of — Book Now, Learn More, Get Offer, Sign Up, Contact Us, Shop Now, Get Quote
- "image_concept": a brief visual description for a designer or Canva AI (1-2 sentences)

Return ONLY a valid JSON array with no extra text, in this format:

[
  {
    "variation": 1,
    "hook_angle": "",
    "primary_text": "",
    "headline": "",
    "description": "",
    "cta": "",
    "image_concept": ""
  },
  ...
]
```

---

## Usage Notes

- Use `claude-haiku-4-5` for speed and cost efficiency
- Set `max_tokens` to 1024 — sufficient for 3 variations
- If the client has a seasonal or limited-time offer, populate "Additional context" and add urgency through genuine scarcity (real deadline), not fabricated pressure
- After generation, verify all character counts before uploading to Meta Ads Manager

---

## Character Limits Reference

| Field          | Limit         | Notes                              |
|----------------|---------------|------------------------------------|
| Primary Text   | 125 chars     | Longer allowed but truncated in feed|
| Headline       | 40 chars      | Most prominent text in the ad      |
| Description    | 30 chars      | Shows below headline, often hidden |
| CTA Button     | Preset options| Must match Meta's available buttons|

---

## Example Filled Prompt (Joe's Plumbing)

```
Business Name: Joe's Plumbing
Industry: Plumbing / Home Services
Location: Dallas, TX
Tone: Friendly, trustworthy, no-nonsense
Target Audience: Homeowners aged 30-65 in Dallas area dealing with plumbing issues
Primary Offer: Free estimate on any repair
Landing Page: https://joesplumbing.com/free-estimate
Words to ALWAYS use: fast, reliable, local, honest
Words to NEVER use: cheap, discount, guaranteed fix
Additional context: Spring is a high season for pipe issues after winter
```

---

## Related Files

- `/workflows/paid-ads-automation.md` — workflow that uses this prompt
- `/templates/google-ad-prompt.md` — equivalent template for Google Search Ads
- `/clients/<client-name>/intake.md` — source of all placeholder values
