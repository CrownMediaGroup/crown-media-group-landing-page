# Workflow: Client Reporting Automation
## All Glory to Jesus Global LLC

---

## Purpose

Automatically pull performance data from Meta, Google, and social platforms at the end of each month, summarize results using AI, and deliver a branded report to the client — with zero manual number-pulling.

---

## Trigger

- **Automated:** 1st of each month (reporting on the previous month)
- **Manual:** Can be triggered on-demand for mid-month check-ins or client requests

---

## Inputs Required

Pull from the client's Airtable record:

| Field                   | Used For                              |
|-------------------------|---------------------------------------|
| Business Name           | Report personalization                |
| Client Email            | Report delivery                       |
| Ad Account ID (Meta)    | Pull Meta Ads data                    |
| Ad Account ID (Google)  | Pull Google Ads data                  |
| Social Media Handles    | Pull organic social data              |
| Services Provided       | Determines which sections to include  |
| Reporting Frequency     | Monthly / Bi-weekly trigger logic     |
| Goals                   | Context for AI summary                |

---

## Workflow Steps

### Step 1 — Pull Performance Data

Run all data pulls in parallel for the previous calendar month.

#### Meta Ads (if applicable)
- Use Meta Marketing API to pull:
  - Impressions, Reach, Clicks, CTR
  - Amount Spent
  - Cost Per Click (CPC)
  - Leads / Conversions (if pixel is installed)
  - Top-performing ad variation

#### Google Ads (if applicable)
- Use Google Ads API to pull:
  - Impressions, Clicks, CTR
  - Average CPC
  - Amount Spent
  - Conversions / Conversion Rate
  - Top-performing keyword or ad

#### Organic Social (if applicable)
- Use Meta Graph API (Facebook/Instagram) to pull:
  - Total Posts Published
  - Total Reach
  - Total Impressions
  - Engagement Rate (Likes + Comments + Shares / Reach)
  - Top-performing post (most reach or engagement)

### Step 2 — Store Raw Data in Airtable

Write all pulled metrics to the Monthly Reports table:

| Field                  | Type          | Notes                            |
|------------------------|---------------|----------------------------------|
| Client                 | Linked Record |                                  |
| Report Month           | Date          | First day of reported month      |
| Meta Impressions       | Number        |                                  |
| Meta Reach             | Number        |                                  |
| Meta Clicks            | Number        |                                  |
| Meta CTR               | Percent       |                                  |
| Meta Spend             | Currency      |                                  |
| Meta CPC               | Currency      |                                  |
| Meta Conversions       | Number        |                                  |
| Google Impressions     | Number        |                                  |
| Google Clicks          | Number        |                                  |
| Google CTR             | Percent       |                                  |
| Google Spend           | Currency      |                                  |
| Google CPC             | Currency      |                                  |
| Google Conversions     | Number        |                                  |
| Organic Posts          | Number        |                                  |
| Organic Reach          | Number        |                                  |
| Organic Engagement Rate| Percent       |                                  |
| Top Post               | Long Text     | Caption snippet + metric         |
| AI Summary             | Long Text     | Generated in Step 3              |
| Report PDF Link        | URL           | Generated in Step 4              |
| Status                 | Single Select | Generating, Ready, Sent          |

### Step 3 — Generate AI Summary with Claude

Build a prompt from the raw data and client goals:

```
You are a marketing analyst writing a monthly performance report for a local small business client.
Write in a warm, encouraging, and professional tone that reflects Christian values —
be honest about what worked and what didn't, and focus on what the data means for the business owner.

Client: {Business Name}
Reporting Period: {Month} {Year}
Primary Goal: {Client Goal}

Performance Data:
- Meta Ads: {Impressions} impressions, {Reach} reach, {Clicks} clicks,
  {CTR}% CTR, ${Spend} spent, ${CPC} CPC, {Conversions} conversions
- Google Ads: {Impressions} impressions, {Clicks} clicks,
  {CTR}% CTR, ${Spend} spent, ${CPC} CPC, {Conversions} conversions
- Organic Social: {Posts} posts published, {Reach} reach,
  {EngagementRate}% engagement rate
- Top Performing Post: "{Top Post}"

Write a report with the following sections:
1. **Monthly Highlights** — 2-3 wins from this month in plain English
2. **What the Numbers Mean** — interpret each platform's results for a non-technical business owner
3. **What We're Improving** — 1-2 honest areas to optimize next month
4. **Next Month's Focus** — brief plan for the coming month based on results

Keep each section concise (3-5 sentences). Avoid jargon.
```

- **Model:** `claude-sonnet-4-6` (higher quality for client-facing output)
- Save AI Summary output back to the Airtable Monthly Reports record

### Step 4 — Generate PDF Report

Options (choose one based on your stack):

**Option A — Google Docs + PDF Export**
- Use a Google Docs template with placeholder fields
- Fill placeholders via Google Docs API
- Export as PDF and save to Google Drive client folder

**Option B — Notion Template**
- Duplicate a Notion report template page
- Populate via Notion API
- Export or share as a public link

**Option C — HTML to PDF (lightweight)**
- Populate an HTML report template with data
- Convert to PDF using a service like PDFShift or html-pdf-node
- Store PDF in client's folder (`/clients/<client-name>/reports/`)

### Step 5 — Deliver Report to Client

- Send branded email via Gmail or SendGrid:

```
Subject: Your {Month} Marketing Report — {Business Name}

Hi {Owner Name},

Your marketing report for {Month} is ready! Here's a quick look at how things went:

{Monthly Highlights — pulled from AI Summary}

Your full report is attached (or linked below).

As always, it's a privilege to serve your business. Let's keep building something great together.

In His service,
[Your Name]
All Glory to Jesus Global LLC

[View Full Report] → {Report Link or PDF attachment}
```

- Update Airtable record `Status` → `Sent`
- Log send timestamp

### Step 6 — Internal Performance Review (Optional)

- Trigger a separate internal Slack or email notification with:
  - All client reports sent this cycle
  - Any clients with declining metrics flagged for attention
  - Total ad spend managed across all clients (agency-level view)

---

## Make (Integromat) Module Sequence

```
[Schedule Trigger: 1st of Month]
    → [Airtable: Search Records] (active clients with reporting due)
    → [Iterator] (loop per client)
        → [Router] (parallel data pulls by service)
            [Meta Ads Path]   → [HTTP: Meta Marketing API]
            [Google Ads Path] → [HTTP: Google Ads API]
            [Organic Path]    → [HTTP: Meta Graph API]
        → [Airtable: Create Record] (Monthly Reports table, raw data)
        → [Text Aggregator] (build Claude summary prompt)
        → [HTTP: Claude API]
        → [Airtable: Update Record] (save AI Summary)
        → [Google Docs / HTML: Generate Report]
        → [Gmail / SendGrid: Send Report Email]
        → [Airtable: Update Record] (Status → Sent)
    → [Slack: Internal Summary Notification]
```

---

## Error Handling

- API authentication failure (Meta/Google): alert immediately, do not send incomplete report
- Missing data for a platform: note "Data unavailable this month" in that report section, proceed
- Claude API error: fall back to a template summary with raw numbers only, flag for manual review
- Email delivery failure: retry once, then alert via Slack

---

## Cost Estimate (per client per month)

- AI Summary: ~800 tokens input + ~600 tokens output = ~1,400 tokens
- Claude Sonnet: ~$0.02–$0.05 per client per month
- PDF generation: free (Google Docs) or ~$0.01 (PDFShift)

---

## Files Related to This Workflow

- `/clients/<client-name>/reports/` — stored PDF reports per client
- `/templates/report-email-template.md` — reusable email copy (to be created)
- `/templates/report-html-template.html` — HTML report template (to be created)
- `/workflows/content-calendar-automation.md` — upstream content workflow
- `/workflows/paid-ads-automation.md` — upstream ads workflow
