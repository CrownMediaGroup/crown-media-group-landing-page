"""
PreCompact hook — fires before context compaction.
Saves a compact-warning marker to AUTO-LOG.md so King knows context was compressed.
"""
import sys, json, datetime

try:
    data = json.load(sys.stdin)
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_path = "C:/Users/ldavi/Documents/AllGloryAgency/Agency/ops/notes/AUTO-LOG.md"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] PRE_COMPACT — context compressing, memory files are source of truth\n")
except Exception:
    pass
