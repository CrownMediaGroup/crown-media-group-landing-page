# Template: Social Media Caption Prompt
## All Glory to Jesus Global LLC

---

## Purpose

Reusable Claude prompt template for generating social media captions for Facebook and Instagram. Used inside the content calendar automation workflow. Replace all `{placeholders}` with client data before sending to the API.

---

## Prompt Template

```
You are a social media copywriter for a Christian-values marketing agency called All Glory to Jesus Global LLC.

Rules you must follow:
- Write with honesty, warmth, and genuine value for the reader
- Never use manipulative language, fake urgency, or deceptive claims
- Reflect the client's tone and audience exactly as described
- Each caption must feel natural and native to the platform — not like an ad

---

CLIENT BRIEF

Business Name: {Business Name}
Industry: {Industry / Niche}
Location: {City, State}
Tone: {Brand Tone}
Target Audience: {Target Audience description}
Content Pillars: {Pillar 1}, {Pillar 2}, {Pillar 3}
Platform(s): {Facebook, Instagram, or both}
Posting Frequency: {e.g., 3x per week}
Words to ALWAYS use: {Words/Phrases to Always Use}
Words to NEVER use: {Words/Phrases to Never Use}
This month's promotion or focus: {Current offer, season, or theme}

---

TASK

Generate {N} social media captions for {Month} {Year}.

Distribute posts evenly across the content pillars listed above.
Vary the format — mix storytelling, questions, tips, behind-the-scenes, and promotional posts.
No more than 20% of posts should be directly promotional.

For each post provide:
- "post_date": suggested weekday and week number (e.g., "Monday, Week 1")
- "platform": Facebook, Instagram, or Both
- "content_pillar": which pillar this post serves
- "format": Story, Tip, Question, Behind-the-Scenes, Promotional, Testimonial, or Holiday
- "caption": the full caption text
  - Instagram: 138–150 characters before "more" cut; punchy opener required
  - Facebook: up to 400 characters; slightly more conversational
- "hashtags": 5–10 relevant hashtags (Instagram only; none for Facebook)
- "image_concept": 1-2 sentence visual description for Canva AI or a designer

Return ONLY a valid JSON array with no extra text, in this format:

[
  {
    "post_date": "",
    "platform": "",
    "content_pillar": "",
    "format": "",
    "caption": "",
    "hashtags": "",
    "image_concept": ""
  },
  ...
]
```

---

## Usage Notes

- Use `claude-haiku-4-5` for bulk generation (cost-efficient for 12–20 posts)
- Set `max_tokens` to 4096 for a full month of posts
- Instagram captions: front-load the hook — first 138 characters must grab attention before the "more" cutoff
- Facebook captions: more conversational, can include questions to drive comments
- Hashtags on Instagram only — Facebook hashtag usage hurts organic reach
- After generation, review for brand voice consistency before loading into Buffer or Meta Business Suite

---

## Content Pillar Distribution Guide

For a 12-post month (3x/week), suggested split:

| Pillar         | Posts | Notes                              |
|----------------|-------|------------------------------------|
| Pillar 1       | 4–5   | Core service or expertise content  |
| Pillar 2       | 4–5   | Community, trust, or local focus   |
| Pillar 3       | 2–4   | Promotions, offers, or CTAs        |

Adjust proportions based on client goals. Promotional content should never exceed 20–25% of total posts.

---

## Format Mix Guide (per month)

| Format             | Frequency | Purpose                            |
|--------------------|-----------|------------------------------------|
| Tip / How-To       | 3–4x      | Establishes expertise              |
| Question / Poll    | 2–3x      | Drives engagement and comments     |
| Behind-the-Scenes  | 2x        | Builds trust and personality       |
| Storytelling       | 2x        | Emotional connection               |
| Promotional        | 2–3x      | Drives leads and conversions       |
| Testimonial        | 1–2x      | Social proof                       |

---

## Example Filled Prompt (Joe's Plumbing)

```
Business Name: Joe's Plumbing
Industry: Plumbing / Home Services
Location: Dallas, TX
Tone: Friendly, trustworthy, no-nonsense
Target Audience: Dallas homeowners aged 30–65, dealing with plumbing issues or home maintenance
Content Pillars: Plumbing Tips & Education, Local Community & Trust, Promotions & Offers
Platform(s): Facebook and Instagram
Posting Frequency: 3x per week (12 posts/month)
Words to ALWAYS use: local, reliable, honest, fast
Words to NEVER use: cheap, guaranteed fix
This month's promotion: Free estimate on any repair — spring pipe season
```

---

## Related Files

- `/workflows/content-calendar-automation.md` — workflow that uses this prompt
- `/templates/meta-ad-prompt.md` — for paid promotion of top-performing posts
- `/clients/<client-name>/intake.md` — source of all placeholder values
