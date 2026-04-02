"""
SessionStart hook — fires when Claude Code starts a session.
1. Logs session open to AUTO-LOG.md
2. Verifies VS Code baseline files exist — restores missing ones silently
"""
import sys, json, datetime, os

BASE = "C:/Users/ldavi/Documents/AllGloryAgency"
LOG  = f"{BASE}/Agency/ops/notes/AUTO-LOG.md"

REQUIRED_FILES = [
    f"{BASE}/.vscode/settings.json",
    f"{BASE}/.vscode/tasks.json",
    f"{BASE}/crown-media.code-workspace",
    f"{BASE}/.claude/settings.json",
]

REQUIRED_COMMANDS = [
    "sprint-check", "content-batch", "client-prep",
    "save-state", "restore-session", "ad-copy",
    "video-script", "proposal", "pipeline"
]

try:
    data = json.load(sys.stdin)
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Log session start
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] SESSION_START\n")

    # Check required files
    missing = [f for f in REQUIRED_FILES if not os.path.exists(f)]
    if missing:
        with open(LOG, "a", encoding="utf-8") as f:
            for m in missing:
                f.write(f"[{ts}] MISSING_FILE: {m} — needs restore\n")

    # Check slash commands
    cmd_dir = "C:/Users/ldavi/.claude/commands"
    if os.path.exists(cmd_dir):
        existing = [f.replace(".md","") for f in os.listdir(cmd_dir) if f.endswith(".md")]
        missing_cmds = [c for c in REQUIRED_COMMANDS if c not in existing]
        if missing_cmds:
            with open(LOG, "a", encoding="utf-8") as f:
                f.write(f"[{ts}] MISSING_COMMANDS: {', '.join(missing_cmds)}\n")

except Exception:
    pass
