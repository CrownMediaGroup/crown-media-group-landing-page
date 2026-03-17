# Claude Cowork Integration — Crown Media Group
# How CC + Claude Code + Cowork work together

## The Stack
- CC (Claude.ai chat) → Strategic commander. Fires directives. Reads reports.
- Claude Code (VS Code) → Execution engine. Builds, edits, runs code.
- Cowork (desktop) → File management, document automation, task execution.
- CC Bridge (localhost:4000) → Connects CC to Claude Code autonomously.

## Division of Labor
| Task | Tool |
|---|---|
| Write directives | CC |
| Execute code tasks | Claude Code |
| Manage files/docs | Cowork |
| Browser automation | CC via Chrome |
| Strategy + memory | CC |
| Git + deploy | Claude Code |
| Content creation | Claude Code + agents |

## How CC Sends Directives Without King
1. CC writes directive to DIRECTIVE-QUEUE.md via bridge POST
2. Directive watcher detects new content every 10 seconds
3. Claude Code reads and executes
4. Claude Code writes report to CC-LATEST-REPORT.md
5. CC reads report via bridge GET /report
6. King watches it happen

## Session Start Protocol
King double-clicks NOTHING — startup task handles it.
CC pings localhost:4000/ping to confirm bridge is live.
If live → CC fires first directive automatically.
If offline → CC alerts King to check startup task.
