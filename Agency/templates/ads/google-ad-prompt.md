# Template: Google Search Ad Copy Prompt
## All Glory to Jesus Global LLC

---

## Purpose

Reusable Claude prompt template for generating Google Responsive Search Ad (RSA) copy variations. Replace all `{placeholders}` with client data before sending to the API.

---

## Prompt Template

```
You are a Google Ads copywriter for a Christian-values marketing agency called All Glory to Jesus Global LLC.

Rules you must follow:
- Write honest, benefit-focused ads — no clickbait, misleading claims, or fake urgency
- Do not make promises the business cannot keep
- Match the client's tone and speak directly to search intent
- Every headline and description must be able to stand alone (Google mixes and matches them)

---

CLIENT BRIEF

Business Name: {Business Name}
Industry: {Industry / Niche}
Location: {City, State}
Tone: {Brand Tone}
Target Audience: {Target Audience description}
Primary Offer: {Offer — e.g., "Free estimate", "Same-day service", "20% off first visit"}
Landing Page: {Landing Page URL}
Display Path Segment 1: {e.g., Services} (15 chars max)
Display Path Segment 2: {e.g., Free-Estimate} (15 chars max)
Top Keywords to Target: {3-5 keywords the audience would search}
Words to ALWAYS use: {Words/Phrases to Always Use}
Words to NEVER use: {Words/Phrases to Never Use}
Additional context: {Seasonal notes, competitors to differentiate from, unique selling points}

---

TASK

Generate 1 Google Responsive Search Ad (RSA) with multiple headline and description options.
Google will automatically mix and match these, so every combination must make sense on its own.

Provide:
- 10 headlines (30 characters max each, no punctuation at end)
- 4 descriptions (90 characters max each)
- Display path already provided above

Distribute the headlines across these angles:
- 3 headlines: include the primary keyword or service
- 2 headlines: highlight the offer or promotion
- 2 headlines: speak to trust, local reputation, or reliability
- 2 headlines: include a benefit or outcome
- 1 headline: include a call to action

For descriptions:
- 2 descriptions: expand on the offer with supporting detail
- 1 description: address a common objection or pain point
- 1 description: include a call to action with the landing page benefit

Return ONLY a valid JSON object with no extra text, in this format:

{
  "display_path_1": "",
  "display_path_2": "",
  "headlines": [
    {"text": "", "angle": ""},
    ...
  ],
  "descriptions": [
    {"text": "", "angle": ""},
    ...
  ]
}
```

---

## Usage Notes

- Use `claude-haiku-4-5` for speed and cost efficiency
- Set `max_tokens` to 1024
- After generation, verify ALL character counts — Google will disapprove ads that exceed limits
- Pin Headline 1 to a keyword-rich option for Quality Score; Pin Headline 3 to the CTA
- Upload directly to Google Ads RSA interface or via Google Ads API

---

## Character Limits Reference

| Field            | Limit    | Notes                                          |
|------------------|----------|------------------------------------------------|
| Headline         | 30 chars | No punctuation at end; Google mixes all 10     |
| Description      | 90 chars | Must make sense without a specific headline    |
| Display Path 1   | 15 chars | Appended to base URL for display only          |
| Display Path 2   | 15 chars | Appended after Path 1                          |

---

## Pinning Strategy (Best Practice)

| Position   | Recommendation                              |
|------------|---------------------------------------------|
| Headline 1 | Pin a keyword-rich headline (boosts Quality Score) |
| Headline 2 | Leave unpinned for Google to optimize        |
| Headline 3 | Pin your CTA or offer headline               |
| Descriptions | Leave all unpinned unless compliance requires specific language |

---

## Example Filled Prompt (Joe's Plumbing)

```
Business Name: Joe's Plumbing
Industry: Plumbing / Home Services
Location: Dallas, TX
Tone: Friendly, trustworthy, no-nonsense
Target Audience: Homeowners in Dallas searching for plumbing repair or emergency service
Primary Offer: Free estimate on any repair
Landing Page: https://joesplumbing.com/free-estimate
Display Path Segment 1: Plumbing
Display Path Segment 2: Free-Estimate
Top Keywords to Target: plumber Dallas, emergency plumber, plumbing repair Dallas, local plumber, pipe repair
Words to ALWAYS use: fast, reliable, local, licensed
Words to NEVER use: cheap, discount, guaranteed fix
Additional context: Competes with large national chains — emphasize local, personal service
```

---

## Related Files

- `/workflows/paid-ads-automation.md` — workflow that uses this prompt
- `/templates/meta-ad-prompt.md` — equivalent template for Meta Ads
- `/clients/<client-name>/intake.md` — source of all placeholder values
