# Crown Media Group — Full Tool Inventory
## Claude Code Complete Arsenal | 2026-03-17
## CC Reference Document — Do not modify manually

---

## VS Code Extensions (24 installed)

| Extension ID | Name | Purpose |
|---|---|---|
| anthropic.claude-code | Claude Code | Core AI coding assistant — the brain |
| christian-kohler.path-intellisense | Path IntelliSense | File path autocomplete in code |
| donjayamanne.githistory | Git History | Full git log browser |
| eamodio.gitlens | GitLens | Git blame, history, and insights inline |
| esbenp.prettier-vscode | Prettier | Auto-format on save |
| formulahendry.auto-rename-tag | Auto Rename Tag | Sync opening/closing HTML tags |
| github.copilot-chat | GitHub Copilot Chat | Secondary AI for quick Q&A |
| gruntfuggly.todo-tree | Todo Tree | All TODO comments in one panel |
| humao.rest-client | REST Client | HTTP request testing inside VS Code |
| mechatroner.rainbow-csv | Rainbow CSV | Color-coded CSV viewing |
| mikestead.dotenv | DotENV | .env file syntax highlighting |
| ms-azuretools.vscode-containers | Docker | Container management |
| ms-edgedevtools.vscode-edge-devtools | Edge DevTools | Browser devtools in VS Code |
| ms-mssql.data-workspace-vscode | SQL Data Workspace | Multi-database workspace |
| ms-mssql.mssql | SQL Server | SQL Server query tool |
| ms-mssql.sql-bindings-vscode | SQL Bindings | Azure SQL function bindings |
| ms-mssql.sql-database-projects-vscode | SQL Database Projects | SQL project management |
| ms-vscode-remote.remote-containers | Remote Containers | Dev inside Docker containers |
| mtxr.sqltools | SQLTools | Query Supabase/Postgres inside VS Code |
| pkief.material-icon-theme | Material Icons | File icon theme for navigation |
| rangav.vscode-thunder-client | Thunder Client | API testing GUI — no Postman needed |
| ritwickdey.liveserver | Live Server | Live preview of HTML pages |
| streetsidesoftware.code-spell-checker | Code Spell Checker | Typo detection in code and copy |
| usernamehw.errorlens | Error Lens | Inline error display — no hover needed |

---

## MCP Servers (4 configured in .mcp.json)

| Server | npm Package | Version | Enables |
|---|---|---|---|
| filesystem | @modelcontextprotocol/server-filesystem | 2026.1.14 | Read/write all AllGloryAgency files |
| memory | @modelcontextprotocol/server-memory | 2026.1.26 | Persistent memory across sessions |
| sequential-thinking | @modelcontextprotocol/server-sequential-thinking | 2025.12.18 | Multi-step deep reasoning |
| puppeteer | @modelcontextprotocol/server-puppeteer | 2025.5.12 | Browser automation, scraping, screenshots |

**Note:** Brave Search MCP not installed — needs BRAVE_API_KEY. Get free key at brave.com/search/api/

---

## Slash Commands (11 in .claude/commands/)

| Command | Trigger | Output |
|---|---|---|
| /save-state | Manual | Full session state → SESSION-NOTES-DATE.md |
| /restore-session | Manual | Load last session → sprint day + next action |
| /research [topic] | Manual | Web search → RESEARCH-DATE.md |
| /content-batch [topic] | Manual | 5 content formats → BATCH-DATE.md |
| /sprint-check | Manual | Sprint day, done, blocked, today's top 3 |
| /client-prep [name] | Manual | Discovery call prep → CALL-PREP-DATE.md |
| /ad-copy | Manual | Ad copy from client intake data |
| /automation-workflow | Manual | Design or troubleshoot any automation |
| /client-outreach | Manual | Cold/warm/onboarding outreach messages |
| /social-content | Manual | Social media captions for content calendar |
| /video-script | Manual | 60-sec video script with hook + CTA |

---

## Agents (8 in .claude/agents/)

| Agent | Model | Role |
|---|---|---|
| coordinator | — | Routes tasks to all agents, unified output |
| content-marketer | sonnet | Calendars, captions, Reels, email sequences |
| sales-automator | sonnet | Cold email, pitches, proposals, close scripts |
| social-media-copywriter | sonnet | Platform-native copy (IG, FB, LinkedIn, X) |
| competitive-analyst | haiku | Columbia SC competitor intel, differentiation |
| workflow-orchestrator | opus | n8n flows, automation design, system architecture |
| trend-analyst | haiku | Emerging marketing trends, AI tools, formats |
| multi-agent-coordinator | opus | Parallel multi-agent task execution |

---

## npm Global Packages (13 installed)

| Package | Version | Purpose |
|---|---|---|
| @anthropic-ai/claude-code | 2.1.74 | Core CLI — Claude Code itself |
| @modelcontextprotocol/server-filesystem | 2026.1.14 | MCP filesystem server |
| @modelcontextprotocol/server-memory | 2026.1.26 | MCP memory server |
| @modelcontextprotocol/server-puppeteer | 2025.5.12 | MCP browser server |
| @modelcontextprotocol/server-sequential-thinking | 2025.12.18 | MCP reasoning server |
| @railway/cli | 4.31.0 | Deploy/manage Railway apps from terminal |
| n8n | 2.11.4 | Local automation engine (start: n8n) |
| netlify-cli | 24.2.0 | Deploy to Netlify from terminal |
| ngrok | 5.0.0-beta.2 | Expose localhost for webhook testing |
| playwright | 1.58.2 | Browser automation and E2E testing |
| pnpm | 10.32.1 | Fast package manager |
| posthog-node | 5.28.2 | Analytics event tracking |
| resend | 6.9.3 | Transactional email from terminal |
| stripe | 20.4.1 | Payment and billing CLI |

---

## Active Hooks (.claude/settings.json)

| Hook Type | Matcher | Action | Script |
|---|---|---|---|
| PostToolUse | Write\|Edit | Log file change to AUTO-LOG.md | tools/hooks/post-file-change.py |
| Stop | (all) | Log response complete to AUTO-LOG.md | tools/hooks/session-stop.py |

**Hook types NOT available in Claude Code** (covered by CLAUDE.md instruction instead):
- PreCompact → Memory system + CLAUDE.md Session Start Protocol handles context persistence
- SessionStart → CLAUDE.md Section 10 (Session Start Protocol) fires via instruction on every session
- PostMessage → CLAUDE.md Auto-Routing Rules handle smart triggering via keyword detection

---

## Node / Runtime Environment

| Tool | Version |
|---|---|
| Node.js | v24.14.0 |
| npm | 11.9.0 |
| pnpm | 10.32.1 |
| Claude Code | 2.1.74 |
| Shell | bash / xterm-256color |
| Platform | Windows 11 Home 10.0.26200 |

---

## Tools CLI Scripts (tools/)

Run from terminal in AllGloryAgency root.

| Script | Command | Purpose |
|---|---|---|
| Screenshot | (tools/screenshot.js) | Capture page screenshots via Puppeteer |
| Transcribe | (tools/transcribe.js) | Audio transcription |
| Compress | (tools/compress.js) | Asset compression |

---

## Deployed Infrastructure

| Service | URL / ID | Status |
|---|---|---|
| Railway server | https://allglory-onboarding-production.up.railway.app | LIVE |
| Netlify site | https://crown-media-group.netlify.app | LIVE |
| GitHub repo | github.com/musickingdavidking/crown-media-group-landing-page | PRIVATE |
| Supabase | pcikjtzvruvavaduawes.supabase.co | CONFIGURED — SQL not yet run |
| Domain | crownmediagroup.co (Namecheap) | DNS not yet switched |
| n8n | localhost:5678 | LOCAL — start with: n8n |

---

## Skills Auto-Loaded via CLAUDE.md (global + project)

| Trigger Category | Skills Applied |
|---|---|
| Sales / Prospecting | sales + sales-prospect + sales-outreach + sales-qualify + draft-outreach + account-research |
| Content / Social | social-content + copywriting + content-marketer + canva-automation + instagram |
| Shatiea Client | social-content + content-marketer + canva-automation + paid-ads + copywriting |
| Paid Ads | paid-ads + ad-copy + executing-marketing-campaigns + analytics-tracking |
| Video / Scripts | video-script + content-creator + copywriting |
| Automation | automation-workflow + n8n-workflow-patterns + n8n-code-javascript + workflow-automation |
| Email | email-sequence + copywriting + content-marketer |
| Strategy / CEO | ceo-advisor + strategy-advisor + business-analyst + monetization + pricing-strategy |
| Web / Landing Pages | webflow-automation + wordpress + shopify-development + frontend-design |
| Competitive Intel | competitive-analysis + competitive-intelligence + competitive-landscape |
| Research | deep-research + account-research + market-research-reports |
| Proposals | sales-proposal + copywriting + professional-proofreader + doc-coauthoring |
