# Workflow: Paid Ads Automation
## All Glory to Jesus Global LLC

---

## Purpose

Automatically generate ad copy variations for Google and Meta campaigns using client intake data and AI, then create draft ads ready for review and launch.

---

## Trigger

- **Manual:** When onboarding a new client or launching a new promotion
- **Automated Option:** Triggered by a new or updated "Active Promotion" field in the client's Airtable record

---

## Inputs Required

Pull from the client's intake file (`/clients/<client-name>/intake.md`):

| Field                  | Used For                              |
|------------------------|---------------------------------------|
| Business Name          | Ad personalization                    |
| Industry / Niche       | Contextual relevance                  |
| Brand Tone             | Claude prompt instruction             |
| Target Audience        | Audience targeting + copy angle       |
| Words to Use/Avoid     | Claude prompt guardrails              |
| Primary Offer          | Core message of the ad                |
| Landing Page URL       | Ad destination                        |
| Geographic Targeting   | Campaign location settings            |
| Ad Account ID (Meta)   | Meta campaign creation                |
| Ad Account ID (Google) | Google campaign creation              |
| Monthly Ad Budget      | Campaign budget allocation            |

---

## Workflow Steps

### Step 1 — Pull Client & Promotion Data
- Source: Airtable (Clients table + Active Promotions table)
- Fetch client record and current promotion details
- Confirm budget, offer, and landing page are present before proceeding

### Step 2 — Build the Claude Prompt

#### Meta Ad Copy Prompt
```
You are a direct-response ad copywriter for a Christian-values marketing agency.
Never use manipulative tactics, false urgency, or deceptive claims.

Client: {Business Name}
Industry: {Industry}
Tone: {Brand Tone}
Audience: {Target Audience}
Offer: {Primary Offer}
Landing Page: {Landing Page URL}
Always use: {Words to Always Use}
Never use: {Words to Never Use}

Generate 3 Meta ad variations. For each provide:
- Primary Text (125 characters max)
- Headline (40 characters max)
- Description (30 characters max)
- Call to Action button: (e.g., Learn More, Book Now, Get Offer)
- Hook angle used (e.g., pain point, curiosity, social proof, benefit-led)

Format as a JSON array.
```

#### Google Search Ad Copy Prompt
```
You are a Google Ads copywriter for a Christian-values marketing agency.
Write honest, benefit-focused ads. No clickbait or misleading claims.

Client: {Business Name}
Industry: {Industry}
Tone: {Brand Tone}
Audience: {Target Audience}
Offer: {Primary Offer}
Landing Page: {Landing Page URL}
Always use: {Words to Always Use}
Never use: {Words to Never Use}

Generate 3 Google Responsive Search Ad variations. For each provide:
- 3 Headlines (30 characters max each)
- 2 Descriptions (90 characters max each)
- Display Path (2 segments, 15 characters each)

Format as a JSON array.
```

### Step 3 — Call Claude API
- **Model:** `claude-haiku-4-5` for copy generation
- Run both prompts in parallel (one HTTP call per platform)
- Parse JSON array responses for Meta and Google separately

### Step 4 — Populate Ads Table in Airtable

Write each ad variation to the Ads table:

| Field            | Type          | Notes                                  |
|------------------|---------------|----------------------------------------|
| Client           | Linked Record | Links to Clients table                 |
| Platform         | Single Select | Meta, Google                           |
| Promotion        | Linked Record | Links to Active Promotions table       |
| Ad Variation #   | Number        | 1, 2, or 3                             |
| Primary Text     | Long Text     | Meta only                              |
| Headline(s)      | Long Text     | Comma-separated for Google RSA         |
| Description(s)   | Long Text     | Comma-separated for Google RSA         |
| CTA              | Short Text    | Meta only                              |
| Hook Angle       | Short Text    | For internal reference                 |
| Display Path     | Short Text    | Google only                            |
| Status           | Single Select | Draft, Approved, Live, Paused, Ended   |
| Performance Notes| Long Text     | Updated after campaign runs            |

### Step 5 — Review Notification
- Send email or Slack alert:
  > "{Business Name} ad copy for '{Promotion}' is ready for review. 3 Meta + 3 Google variations generated. [Link to Airtable]"

### Step 6 — Client or Internal Approval
- Review copy for accuracy, tone, and compliance
- Update `Status` → `Approved` for chosen variations
- Flag any copy that needs revision before launch

### Step 7 — Campaign Setup

#### Meta
- Use Meta Marketing API or manually create campaign in Meta Business Suite
- Campaign structure:
  - **Campaign:** {Business Name} — {Promotion} — {Month}
  - **Ad Set:** Audience targeting per intake (location, age, interests)
  - **Budget:** Allocate from monthly ad budget (suggest 70% Meta / 30% Google split as default)
  - **Ads:** Upload approved copy variations as A/B test

#### Google
- Use Google Ads API or manually create in Google Ads dashboard
- Campaign structure:
  - **Campaign Type:** Search
  - **Campaign:** {Business Name} — {Promotion} — {Month}
  - **Ad Group:** Themed by offer or keyword cluster
  - **Budget:** Remaining 30% of monthly ad budget
  - **Ads:** Upload approved RSA variations

### Step 8 — Post-Launch Tracking Setup
- Set a 7-day follow-up reminder to review performance
- After 7 days: pull CTR, CPC, conversions into Airtable `Performance Notes`
- Flag underperforming variations for replacement

---

## Make (Integromat) Module Sequence

```
[Airtable: Watch Records] (new/updated Active Promotion)
    → [Airtable: Get Client Record]
    → [Router] (split into Meta path + Google path)
        [Meta Path]
            → [Text Aggregator] (build Meta prompt)
            → [HTTP: Make a Request] (POST to Claude API)
            → [JSON: Parse JSON]
            → [Iterator] (loop 3 variations)
                → [Airtable: Create Record] (Ads table, platform = Meta)
        [Google Path]
            → [Text Aggregator] (build Google prompt)
            → [HTTP: Make a Request] (POST to Claude API)
            → [JSON: Parse JSON]
            → [Iterator] (loop 3 variations)
                → [Airtable: Create Record] (Ads table, platform = Google)
    → [Email / Slack: Send Notification]
```

---

## Error Handling

- Missing required fields (budget, landing page, offer): halt workflow, notify via Slack
- Claude API error: log to Airtable Errors table, alert immediately
- Ad copy exceeds character limit: flag in `Performance Notes` field for manual fix before launch

---

## Cost Estimate (per client per promotion)

- ~6 ad variations × ~200 tokens each = ~1,200 tokens
- Claude Haiku: under $0.01 per run

---

## Budget Allocation Default (adjustable per client)

| Platform | Default Split | Notes                              |
|----------|---------------|------------------------------------|
| Meta     | 70%           | Better for local awareness/retarget|
| Google   | 30%           | Intent-based search traffic        |

---

## Files Related to This Workflow

- `/clients/<client-name>/intake.md` — source of client and ad account data
- `/templates/meta-ad-prompt.md` — reusable Meta prompt template (to be created)
- `/templates/google-ad-prompt.md` — reusable Google prompt template (to be created)
- `/workflows/content-calendar-automation.md` — related content workflow
