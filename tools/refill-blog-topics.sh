#!/usr/bin/env bash
# refill-blog-topics.sh — top off the auto-blog topics queue
#
# Per Sprint Law W21 Rule 21-6: prevent 5/25-style blackouts by keeping
# the queue stocked. If under 20 topics, run blog-researcher to add 25.
#
# Usage: GEMINI_API_KEY=... bash tools/refill-blog-topics.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE="$ROOT/landing-page/content/blog/topics-queue.json"

if [ ! -f "$QUEUE" ]; then
  echo "Topics queue not found at $QUEUE — creating empty seed."
  mkdir -p "$(dirname "$QUEUE")"
  echo '[]' > "$QUEUE"
fi

COUNT=$(node -e "
const f = require('fs');
try {
  const d = JSON.parse(f.readFileSync('$QUEUE', 'utf8'));
  const q = Array.isArray(d) ? d : (d.queue || []);
  console.log(q.length);
} catch { console.log('0'); }
")

echo "Current topics queue size: $COUNT"

if [ "$COUNT" -ge 20 ]; then
  echo "Queue is healthy (≥ 20). No refill needed."
  exit 0
fi

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY not set. Source .env first."
  exit 1
fi

echo "Queue low — running blog-researcher.js to add 25 fresh topics..."
cd "$ROOT/landing-page"
node scripts/blog-researcher.js --count 25 || {
  echo "Researcher failed — queue stays as-is. Auto-blog will fall back to evergreen topics + static fallback-post.md."
  exit 1
}

NEW_COUNT=$(node -e "
const f = require('fs');
try {
  const d = JSON.parse(f.readFileSync('$QUEUE', 'utf8'));
  const q = Array.isArray(d) ? d : (d.queue || []);
  console.log(q.length);
} catch { console.log('0'); }
")

echo "Refilled: $COUNT → $NEW_COUNT topics."
echo "Auto-blog cron will use these on next run."
