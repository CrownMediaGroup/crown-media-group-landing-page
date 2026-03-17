# Capability Report — Crown Media Group
## Claude Code Full System Status | 2026-03-17

---

## VS Code Extensions (All Active)

| Extension | Purpose |
|---|---|
| anthropic.claude-code | Core — Claude lives in VS Code |
| github.copilot-chat | Second AI brain for quick questions |
| github.copilot | Inline completions (installed this session) |
| formulahendry.auto-rename-tag | Rename opening tag = closing tag updates |
| PKief.material-icon-theme | File icons — visual file navigation |
| rangav.vscode-thunder-client | API testing without leaving VS Code |
| streetsidesoftware.code-spell-checker | Catches typos in copy, proposals |
| eamodio.gitlens | Full git history and blame |
| usernamehw.errorlens | Inline error display |
| christian-kohler.path-intellisense | File path autocomplete |
| mikestead.dotenv | .env syntax highlighting |
| gruntfuggly.todo-tree | All TODOs in one panel |
| esbenp.prettier-vscode | Auto-format on save |
| ritwickdey.liveserver | Live preview of pitch deck / landing page |
| humao.rest-client | Test Railway webhooks inside VS Code |
| mtxr.sqltools | Query Supabase inside VS Code |

---

## MCP Servers (Active after restart)

| Server | Purpose |
|---|---|
| filesystem | Read/write all AllGloryAgency files |
| memory | Persistent memory across sessions |
| sequential-thinking | Deep multi-step reasoning |
| puppeteer | Browser automation, scraping, screenshots |

**Note:** `brave-search` MCP was NOT added — requires a BRAVE_API_KEY. Add when King gets a Brave Search API key.

---

## Slash Commands Available

| Command | What It Does |
|---|---|
| `/save-state` | Saves full session state to SESSION-NOTES |
| `/restore-session` | Loads last session, reports what's done/blocked/next |
| `/research [topic]` | Web search → saves to RESEARCH-DATE.md |
| `/content-batch [topic]` | Generates 5 content formats from one input |
| `/sprint-check` | Reports sprint day, done, not done, today's top 3 |
| `/client-prep [name]` | Discovery call prep → CALL-PREP-DATE.md |

---

## Agents Available (.claude/agents/)

| Agent | Role |
|---|---|
| coordinator | Delegates to all other agents, unified output |
| content-marketer | Captions, calendars, email sequences |
| sales-automator | Pitches, DMs, close scripts, proposals |
| social-media-copywriter | Platform-specific copy (IG, FB, LinkedIn, X) |
| competitive-analyst | Market research, competitor intel |
| workflow-orchestrator | n8n flows, system design |
| trend-analyst | What's working now in marketing |
| multi-agent-coordinator | Runs multiple agents in parallel |

---

## What Claude Code Can Do Autonomously

- Read, write, and edit any file in AllGloryAgency
- Run git commands and track all changes
- Search codebase for anything
- Execute bash commands
- Test Railway webhooks via REST Client
- Generate content via sub-agents in parallel
- Create and update session notes automatically
- Monitor errors inline via Error Lens
- Browse via Puppeteer MCP (after restart)

---

## What Still Requires King's Input

- Approving git pushes to GitHub (PUBLIC repo — confirm before every push)
- Running Supabase SQL (`Agency/ops/supabase-tables.sql`)
- Namecheap DNS unlock + nameserver switch
- Google Ads billing verification ($0.01–$1.00 deposit check)
- Claiming social handles (@crownmediaco or @crownmediagroup)
- Any real money movement (ads spend, invoices)

---

## Top 3 Things to Add Next Session

1. **Brave Search MCP** — Gets King a live web search inside Claude Code. Get a free Brave Search API key at brave.com/search/api/ and add as BRAVE_API_KEY env var.
2. **Supabase MCP** — Direct Claude Code ↔ Supabase connection. One command to query, insert, or update client data without leaving VS Code.
3. **Make repo PRIVATE** — The GitHub repo is currently PUBLIC. Before pushing any code files, run: `gh repo edit --visibility private`. This is a critical security step.
