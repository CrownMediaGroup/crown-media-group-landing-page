# Claude Code Health Check — Run Every Session Start

## Session Start (Do This First)
1. Press Ctrl+Shift+P → "Reload Window" → Enter
   (activates all 4 MCPs: filesystem, memory, sequential-thinking, puppeteer)
2. Run /restore-session
3. Check sprint day

This runs automatically every session. No manual restart needed after today.

## Quick Checks
- [ ] `node --version` (must be 18+)
- [ ] `claude --version` (must be latest)
- [ ] `.mcp.json` exists and valid
- [ ] `/restore-session` loads last state
- [ ] Railway live: https://allglory-onboarding-production.up.railway.app
- [ ] n8n running: localhost:5678

## If Claude Freezes (turns red)
1. Ctrl+C immediately
2. `claude --dangerously-skip-permissions`
3. If still frozen — restart VS Code
4. Run `/restore-session` after restart
5. Paste status to CC for realignment

## If Context Lost Mid-Session
1. Run `/restore-session`
2. Paste output to CC for realignment
3. CC will fire next directive

## Security Checklist
- [ ] No `.env` files committed
- [ ] No personal documents in `assets/brand/` or `assets/personal/`
- [ ] `security/` folder is gitignored
- [ ] `git status` shows no sensitive files untracked

## Current Versions (as of 2026-03-17)
- Node: v24.14.0
- npm: 11.9.0
- Claude Code: 2.1.74
- Shell: bash / xterm-256color
