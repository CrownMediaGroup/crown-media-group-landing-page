# Workflow: Content Calendar Automation
## All Glory to Jesus Global LLC

---

## Purpose

Automatically generate a monthly content calendar for a client using their intake data and AI, then populate a scheduling tool ready for review and publishing.

---

## Trigger

- **Manual:** Triggered once per month per client (e.g., last week of the month for the following month)
- **Automated Option:** Schedule in Make/n8n on a recurring monthly date (e.g., 25th of each month)

---

## Inputs Required

Pull from the client's intake file (`/clients/<client-name>/intake.md`):

| Field                  | Used For                          |
|------------------------|-----------------------------------|
| Business Name          | Personalizing copy                |
| Brand Tone             | Claude prompt instruction         |
| Target Audience        | Claude prompt instruction         |
| Content Pillars        | Post category distribution        |
| Words to Use/Avoid     | Claude prompt guardrails          |
| Posting Frequency      | Number of posts to generate       |
| Platform(s)            | Format and character limits       |
| Current Promotions     | Featured content for the month    |

---

## Workflow Steps

### Step 1 — Pull Client Data
- Source: Airtable (Client table) or Notion database
- Fetch the active client record for the current cycle
- Extract all fields listed in Inputs above

### Step 2 — Build the Claude Prompt
Construct a prompt using the client data:

```
You are a social media copywriter for a Christian-values marketing agency.

Client: {Business Name}
Tone: {Brand Tone}
Audience: {Target Audience}
Platforms: {Platforms}
Content Pillars: {Pillar 1}, {Pillar 2}, {Pillar 3}
Always use: {Words to Always Use}
Never use: {Words to Never Use}
This month's promotion: {Current Promotion}

Generate {N} social media posts for the month of {Month}.
Distribute posts evenly across the content pillars.
For each post provide:
- Post date (weekday, spread across the month)
- Platform
- Caption (within platform character limit)
- Suggested image description or visual concept
- Hashtags (5-10 relevant, no generic spam tags)

Format output as a JSON array.
```

### Step 3 — Call Claude API
- **Model:** `claude-haiku-4-5` (fast + cost-effective for bulk generation)
- **Endpoint:** `POST https://api.anthropic.com/v1/messages`
- **Max Tokens:** 4096
- Parse the JSON array response

### Step 4 — Populate Content Calendar
- Write each post to Airtable (Content Calendar table) or a Google Sheet with columns:
  - `Client` | `Date` | `Platform` | `Pillar` | `Caption` | `Visual Concept` | `Hashtags` | `Status: Draft`

### Step 5 — Review Notification
- Send an email or Slack message to yourself:
  > "{Business Name} content calendar for {Month} is ready for review. {N} posts generated. [Link to calendar]"

### Step 6 — Client Approval (Optional)
- If client reviews before publishing: share a filtered view or export to Google Doc
- Update post `Status` from `Draft` → `Approved` after review

### Step 7 — Schedule Posts
- Once approved, push to Buffer or Meta Business Suite via API
- Set each post to its assigned date/time
- Update `Status` → `Scheduled`

---

## Airtable Schema (Content Calendar Table)

| Field           | Type            | Notes                          |
|-----------------|-----------------|--------------------------------|
| Client          | Linked Record   | Links to Clients table         |
| Post Date       | Date            |                                |
| Platform        | Single Select   | Facebook, Instagram, etc.      |
| Content Pillar  | Single Select   | Matches client's pillars       |
| Caption         | Long Text       |                                |
| Visual Concept  | Long Text       | Brief for designer or Canva AI |
| Hashtags        | Long Text       |                                |
| Status          | Single Select   | Draft, Approved, Scheduled, Posted |
| Notes           | Long Text       | Internal review comments       |

---

## Make (Integromat) Module Sequence

```
[Schedule Trigger: Monthly]
    → [Airtable: Search Records] (get active clients due for calendar)
    → [Iterator] (loop per client)
        → [Airtable: Get Record] (fetch client details)
        → [Text Aggregator] (build Claude prompt)
        → [HTTP: Make a Request] (POST to Claude API)
        → [JSON: Parse JSON] (extract posts array)
        → [Iterator] (loop per post)
            → [Airtable: Create Record] (add to Content Calendar)
        → [Email / Slack: Send Notification]
```

---

## Error Handling

- If Claude API returns an error: log to an Airtable "Errors" table and send alert
- If JSON parsing fails: save raw response to a "Raw Output" field for manual review
- If a client record is missing required fields: skip and notify

---

## Cost Estimate (per client per month)

- ~30 posts × ~300 tokens each = ~9,000 tokens
- Claude Haiku: ~$0.01–$0.02 per client per month

---

## Files Related to This Workflow

- `/clients/<client-name>/intake.md` — source of client data
- `/templates/social-caption-prompt.md` — reusable prompt template (to be created)
- `/scripts/generate-calendar.js` — custom script version (to be created)
