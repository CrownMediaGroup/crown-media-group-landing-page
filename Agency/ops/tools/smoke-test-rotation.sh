#!/usr/bin/env bash
# smoke-test-rotation.sh — verify the post-2026-05-16 security rotation is healthy.
#
# Usage:
#   bash Agency/ops/tools/smoke-test-rotation.sh <NEW_SEED_TOKEN> [EDGE_INTERNAL_SECRET]
#
# What it checks:
#   1. Old `KingdomSeed2026` token returns 401 (proves the env var was rotated)
#   2. New SEED_TOKEN returns 200 on /api/kingdom-reach/churches
#   3. Edge bot runner refuses to run without the secret (401)
#   4. /privacy.html, /terms.html, /unsubscribe.html all return 200
#   5. Stripe webhook endpoint accepts POST (signature verification path)
#
# Exit 0 = all pass. Exit 1 = at least one issue.

set -u

NEW_TOKEN="${1:-}"
EDGE_SECRET="${2:-}"

CRM='https://crm.crownmediagroup.co'
SITE='https://crownmediagroup.co'

green() { printf '\033[32m✓\033[0m %s\n' "$1"; }
red()   { printf '\033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
yellow(){ printf '\033[33m!\033[0m %s\n' "$1"; }
FAIL=0

echo "=== Crown Media Group — Post-rotation Smoke Test ==="
echo

# 1. Old token should be DEAD
code=$(curl -s -o /dev/null -w '%{http_code}' "$CRM/api/kingdom-reach/churches?token=KingdomSeed2026&limit=1")
if [ "$code" = "401" ]; then
  green "Old KingdomSeed2026 token returns 401 — env var rotated"
else
  red   "Old KingdomSeed2026 token returned $code (expected 401) — rotation incomplete"
fi

# 2. New token should work
if [ -z "$NEW_TOKEN" ]; then
  yellow "No NEW_TOKEN passed as arg 1 — skipping new-token health check. Pass it like: bash smoke-test-rotation.sh <newtoken>"
else
  body=$(curl -s "$CRM/api/kingdom-reach/churches?token=${NEW_TOKEN}&limit=1")
  if echo "$body" | grep -q '"churches"\|"data"\|"id"'; then
    green "New SEED_TOKEN works — CRM returned church data"
  else
    red   "New SEED_TOKEN did NOT return data. Response: $(echo "$body" | head -c 200)"
  fi
fi

# 3. Edge bot runner should refuse without the secret
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE/api/edge-bot-runner" \
  -H 'Content-Type: application/json' -d '{}')
case "$code" in
  401|503) green "Edge bot runner gates correctly (got $code)";;
  *)       red   "Edge bot runner returned $code (expected 401 or 503)";;
esac

# 3b. If EDGE_SECRET passed, verify it works
if [ -n "$EDGE_SECRET" ]; then
  body=$(curl -s -X POST "$SITE/api/edge-bot-runner" -H 'Content-Type: application/json' -d "{\"secret\":\"${EDGE_SECRET}\"}")
  if echo "$body" | grep -q '"ok":true\|"ran"'; then
    green "Edge bot runner accepts the new EDGE_INTERNAL_SECRET"
  else
    yellow "Edge bot runner with secret returned: $(echo "$body" | head -c 200) — may be valid (no active strategies) or may be wrong secret"
  fi
fi

# 4. Legal pages
for path in /privacy.html /terms.html /unsubscribe.html; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -L "${SITE}${path}")
  if [ "$code" = "200" ]; then
    green "${path} returns 200"
  else
    red   "${path} returned $code"
  fi
done

# 5. Stripe webhook endpoint
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SITE/api/stripe-webhook" \
  -H 'Content-Type: application/json' -d '{}')
case "$code" in
  400) green "Stripe webhook signature verification active (400 on unsigned body)";;
  401) green "Stripe webhook rejects unsigned (401)";;
  *)   yellow "Stripe webhook returned $code (expected 400 — invalid signature). Check stripe-webhook.mjs:53";;
esac

echo
if [ "$FAIL" = "0" ]; then
  echo "=== All smoke checks passed ==="
else
  echo "=== One or more smoke checks FAILED — see red lines above ==="
  exit 1
fi
