# Kingdom Reach

Crown Media Group's church outreach automation — plugged into the existing CRM at `crm.crownmediagroup.co`.

**What it does**
1. Receives an Otter.ai transcript from King's iPhone (via the dispatch form on the CRM)
2. Claude extracts pain points, interests, recommended tier, sentiment
3. Generates in parallel:
   - Starter church website (HTML)
   - Personalized proposal PDF
   - Follow-up email draft
4. Updates the church record in the CRM (status, pipeline value, follow-up date)
5. Optional: auto-sends the email via Resend with the proposal attached

**Where it lives**
```
tools/kingdom-reach/
├── index.js           Express mount — call mountKingdomReach(app, db, helpers) from server.js
├── schema.js          churches + kingdom_dispatches SQLite tables
├── seed.js            Seeds 237 Columbia SC churches from Agency/ops/outreach/build-church-list.js
├── processor.js       Anthropic transcript → JSON
├── watcher.js         Optional inbox/ folder watcher (run separately)
├── generators/
│   ├── website.js     Royal blue/white starter church site
│   ├── proposal.js    Faith-forward PDF proposal (pdfkit)
│   └── email.js       Personalized follow-up + Resend send
├── public/
│   ├── dispatch.html        Mobile dispatch form
│   └── kingdom-dashboard.html  237-church table + pipeline stats
├── output/             Generated websites, proposals, emails (gitignored)
├── inbox/              Drop transcript .txt files here (gitignored)
└── logs/               Activity log (gitignored)
```

**Routes the CRM exposes after mount**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/kingdom-reach`                           | session | Mobile dispatch form |
| GET  | `/kingdom-reach/dashboard`                 | session | 237-church table + pipeline value |
| POST | `/api/kingdom-reach/dispatch`              | session | Receive transcript, fire pipeline, return jobId |
| GET  | `/api/kingdom-reach/job/:id`               | session | Poll job status (used by the form) |
| GET  | `/api/kingdom-reach/churches`              | session | List churches (filterable by status, tier, no_website) |
| PATCH| `/api/kingdom-reach/churches/:id`          | session | Update status / notes / tier / etc. |
| GET  | `/api/kingdom-reach/dispatches`            | session | Recent dispatches (last 50) |
| POST | `/api/kingdom-reach/dispatches/:id/send`   | session | Send the follow-up email via Resend |
| GET  | `/kingdom-reach/output/:slug/website`      | session | Preview the generated starter site |
| GET  | `/kingdom-reach/output/:slug/proposal`     | session | Inline PDF preview |
| GET  | `/kingdom-reach/output/:slug/email`        | session | Plain-text email draft |
| GET  | `/api/kingdom-reach/health`                | open    | { churches, dispatches, resend, anthropic } |

**Environment variables** (set in `.env` — already wired via the existing CRM `.env` loader)
- `ANTHROPIC_API_KEY`     — required (Claude transcript extraction)
- `RESEND_API_KEY`        — required for `send_now`
- `KINGDOM_REACH_FROM`    — defaults to `king@crownmediagroup.co`
- `KINGDOM_REACH_MODEL`   — defaults to `claude-sonnet-4-5-20250929` (auto-falls back if not available)

**How King uses it from his phone**
1. Open Otter.ai → tap Share → Copy Transcript
2. On iPhone, open `https://crm.crownmediagroup.co/kingdom-reach` (already logged in via Cloudflare)
3. Fill: church name, pastor, phone, address, has-website toggle
4. Paste transcript → tap **DISPATCH**
5. Wait 25–45 seconds — page polls automatically and shows links to the deliverables
6. Review the email draft → tap **Send** (Resend fires from `king@crownmediagroup.co` with proposal attached)

**Inbox watcher (optional)** — drop a transcript file from the desktop:
```
node tools/kingdom-reach/watcher.js
```
Drop `tools/kingdom-reach/inbox/GraceLife_2026-05-01.txt`. Optional first line:
```
pastor=Pastor Brad | phone=(803) 419-3833 | email=admin@gracelife.church | address=501 Clemson Rd
```

**No ngrok needed** — the dispatch form is served by the CRM on `crm.crownmediagroup.co`, which already runs through Cloudflare. Phone-accessible from anywhere with a single login.
