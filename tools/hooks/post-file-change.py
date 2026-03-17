"""
PostToolUse hook — fires after every Write or Edit tool call.
Appends a timestamped entry to AUTO-LOG.md.
"""
import sys, json, datetime, os

try:
    data = json.load(sys.stdin)
    tool = data.get("tool_name", "unknown")
    inp = data.get("tool_input", {})
    path = inp.get("file_path", inp.get("path", "unknown"))
    name = os.path.basename(path) if path != "unknown" else "unknown"
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_path = "C:/Users/ldavi/Documents/AllGloryAgency/Agency/ops/notes/AUTO-LOG.md"
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"[{ts}] {tool}: {name}\n")
except Exception:
    pass
