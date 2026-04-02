"""
SessionStart hook — fires when Claude Code starts a session.
Logs session open to AUTO-LOG.md.
"""
import sys, json, datetime

try:
    data = json.load(sys.stdin)
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_path = "C:/Users/ldavi/Documents/AllGloryAgency/Agency/ops/notes/AUTO-LOG.md"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] SESSION_START\n")
except Exception:
    pass
