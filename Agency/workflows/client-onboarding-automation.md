# Workflow: Client Onboarding Automation
## All Glory to Jesus Global LLC

---

## Purpose

Automatically trigger a structured onboarding sequence the moment a new client signs their contract — creating their folder, populating their Airtable record, sending a welcome email, requesting platform access, and scheduling their kickoff call, all without manual setup.

---

## Trigger

- **Automated:** New contract signed in DocuSign, HelloSign, or HoneyBook
- **Manual Fallback:** New record created in Airtable Clients table with Status set to `Onboarding`

---

## Inputs Required

Collected via intake form (Typeform, Jotform, or HoneyBook intake questionnaire) linked to the contract:

| Field                        | Used For                            |
|------------------------------|-------------------------------------|
| Business Name                | Folder creation, all communications |
| Owner First & Last Name      | Personalized messaging              |
| Email Address                | All email communications            |
| Phone Number                 | SMS welcome + contact record        |
| Industry / Niche             | Client record + content strategy    |
| Location                     | Ad targeting, local content         |
| Website                      | Client record                       |
| Social Media Handles         | Access request, content research    |
| Services Selected            | Determines onboarding steps to run  |
| Monthly Ad Budget            | Campaign setup                      |
| Brand Tone & Audience        | Pre-populates content prompts       |
| Content Pillars              | Pre-populates content calendar      |
| Logo & Brand Assets Link     | Asset collection step               |
| Contract Start Date          | Billing and first deliverable dates |

---

## Workflow Steps

### Step 1 — Create Client Record in Airtable
- Create new record in Clients table using all intake form fields
- Set `Status` → `Onboarding`
- Set `Contract Start Date`, `First Report Due`, `First Content Calendar Due`
- Link to Services table based on selected services

### Step 2 — Create Client Folder Structure
- Create folder in Google Drive (or local `/clients/` directory):

```
/clients/{business-name}/
    ├── intake.md            ← populated from form data
    ├── brand-assets/        ← placeholder for logos, fonts, colors
    ├── content/
    │   ├── drafts/
    │   └── approved/
    ├── ads/
    │   ├── copy/
    │   └── creatives/
    └── reports/
```

- Populate `intake.md` using `CLIENT_INTAKE_TEMPLATE.md` with all known fields pre-filled

### Step 3 — Send Welcome Email

```
Subject: Welcome to All Glory to Jesus Global LLC — Let's Build Something Great, {First Name}!

Hi {First Name},

Welcome! It's truly an honor to partner with {Business Name}. We don't take lightly
the trust you've placed in us, and we're committed to serving your business with
excellence and integrity.

Here's what happens next:

1. You'll receive a separate email requesting access to your social media and ad accounts
2. We'll schedule your kickoff call within the next 48 hours
3. Your first {content calendar / ad campaign / report} will be delivered by {First Deliverable Date}

In the meantime, if you need anything at all, just reply to this email.

Grateful to be on this journey with you,

{Your Name}
All Glory to Jesus Global LLC
{Phone} | {Email}
```

### Step 4 — Send Platform Access Request Email

Send a separate, focused email requesting credentials and access:

```
Subject: Action Needed: Account Access for {Business Name}

Hi {First Name},

To get started, I'll need access to the following accounts. Please use the
secure sharing method noted for each:

{IF Social Media Management selected}
□ Facebook Page — add {your email} as Editor via Page Settings > Page Roles
□ Instagram — connected through the Facebook Page above

{IF Meta Ads selected}
□ Meta Business Manager — add {your email} as Admin
  Your Ad Account ID: (please reply with this)

{IF Google Ads selected}
□ Google Ads — share access to {your email} (Admin level)
  Your Google Ads Customer ID: (please reply with this)

{IF Google Business Profile selected}
□ Google Business Profile — add {your email} as Manager

Please also send your logo files and brand assets to this email or upload them here:
{Google Drive Upload Link}

Once I have access, I'll begin setup right away. Let me know if you need help
with any of these steps — I'm happy to walk you through it.

{Your Name}
```

### Step 5 — Schedule Kickoff Call
- Send calendar invite via Calendly or Google Calendar
- Suggested agenda (auto-attached to invite):

```
Kickoff Call Agenda — {Business Name}
Duration: 30–45 minutes

1. Introductions & relationship (5 min)
2. Review business goals and what success looks like (10 min)
3. Confirm content pillars, tone, and target audience (10 min)
4. Walk through first deliverables and timeline (10 min)
5. Questions and next steps (5 min)
```

### Step 6 — Internal Slack / Email Notification

Notify yourself with a new client alert:

```
New Client Onboarded: {Business Name}
Owner: {Owner Name}
Services: {Services Selected}
Contract Start: {Start Date}
First Deliverable: {First Deliverable} by {Due Date}
Kickoff Call: {Scheduled Date/Time}
Access Status: Pending

Client folder: {Google Drive Link}
Airtable Record: {Airtable Link}
```

### Step 7 — Trigger Downstream Workflows

Based on services selected, automatically trigger:

| Service Selected         | Workflow Triggered                              |
|--------------------------|-------------------------------------------------|
| Social Media Management  | `content-calendar-automation.md` (first batch)  |
| Meta Ads                 | `paid-ads-automation.md` (once access confirmed)|
| Google Ads               | `paid-ads-automation.md` (once access confirmed)|
| All services             | Schedule first `client-reporting-automation.md` |

- Flag downstream workflows as `Pending Access` until Step 4 access is confirmed
- Watch Airtable `Access Status` field — trigger content/ads workflows when flipped to `Granted`

### Step 8 — 48-Hour Follow-Up Check

- If platform access not yet received after 48 hours: send a gentle follow-up

```
Subject: Re: Account Access for {Business Name}

Hi {First Name},

Just checking in to make sure my access request didn't get buried!
Whenever you're ready, the steps are in my previous email.
Let me know if you'd like me to walk you through any of them.

{Your Name}
```

- If kickoff call not yet scheduled after 48 hours: send a Calendly link reminder

---

## Airtable Fields — Clients Table (Additions)

| Field                  | Type           | Notes                                  |
|------------------------|----------------|----------------------------------------|
| Status                 | Single Select  | Lead, Onboarding, Active, Paused, Ended|
| Contract Start Date    | Date           |                                        |
| First Deliverable Date | Date           | Auto-calculated based on service type  |
| First Report Due       | Date           | Auto-calculated: start date + 1 month  |
| Access Status          | Single Select  | Pending, Partial, Granted              |
| Kickoff Call Date      | Date           |                                        |
| Google Drive Folder    | URL            | Link to client folder                  |
| Onboarding Complete    | Checkbox       | Checked when all steps done            |

---

## Make (Integromat) Module Sequence

```
[Webhook: DocuSign / HoneyBook contract signed]
    → [Typeform / Jotform: Get Intake Response]
    → [Airtable: Create Record] (Clients table)
    → [Google Drive: Create Folder Structure]
    → [Google Drive: Copy & Populate intake.md]
    → [Router] (parallel)
        [Email Path 1] → [Gmail: Send Welcome Email]
        [Email Path 2] → [Gmail: Send Access Request Email]
        [Calendar Path] → [Google Calendar: Create Kickoff Event + Send Invite]
        [Slack Path]   → [Slack: Post Internal Notification]
    → [Router] (services selected)
        [Social Media] → [Trigger: Content Calendar Workflow]
        [Ads]          → [Set Airtable: Access Status = Pending]
    → [Schedule: 48hr delay]
        → [Airtable: Check Access Status]
        → [If still Pending] → [Gmail: Send Follow-Up Email]
```

---

## Error Handling

- Intake form missing required fields: halt workflow, send Slack alert with missing fields listed
- Google Drive folder creation fails: retry once, then alert and create manually
- Email delivery failure: log to Airtable, retry after 30 minutes
- Kickoff call not scheduled after 72 hours: escalate Slack alert

---

## Cost Estimate (per client onboarded)

- No Claude API calls in this workflow — pure automation
- Make operations: ~20–30 operations per onboarding
- Effectively free within Make's free/starter tier for low volume

---

## Files Related to This Workflow

- `/clients/CLIENT_INTAKE_TEMPLATE.md` — template used to generate client intake.md
- `/workflows/content-calendar-automation.md` — triggered after onboarding
- `/workflows/paid-ads-automation.md` — triggered after access confirmed
- `/workflows/client-reporting-automation.md` — scheduled at onboarding
