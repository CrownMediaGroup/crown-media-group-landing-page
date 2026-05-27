#!/usr/bin/env bash
# fire-touch-2-2026-05-29.sh — Friday 2026-05-29 Touch-2 fire
#
# The May 22 batch ages past 7 days → ~140 records eligible.
# Variant A/B routing already wired (LABS). Proof page link injects into bodies.
#
# Usage:
#   source .env.kingdom-secrets && bash Agency/ops/outreach/fire-touch-2-2026-05-29.sh
#
# Steps:
#   1. Dry-run follow_up_openers   → print eligible count
#   2. Dry-run follow_up_cold      → print eligible count
#   3. Confirmation prompt
#   4. Fire follow_up_openers (proof page link in body, A/B subject variants)
#   5. 60s breather
#   6. Fire follow_up_cold (proof page link in body, A/B subject variants)
#   7. Final HERALD-friendly summary

set -e

API="https://crm.crownmediagroup.co/api/kingdom-reach/campaign/send"
TOKEN="${SEED_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "Error: SEED_TOKEN env var not set."
  echo "Run: source .env.kingdom-secrets && bash $0"
  exit 1
fi

DATE=$(date +'%Y-%m-%d %H:%M:%S %Z')
echo "═══════════════════════════════════════════════════════════════"
echo "  TOUCH-2 FIRE — $DATE"
echo "  May 22 cohort, 7-day window unlocks today"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ── DRY-RUN: openers ─────────────────────────────────────────────────────
echo "[1/4] Dry-run: follow_up_openers..."
OPENER_RESP=$(curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_opener\",\"filter\":\"follow_up_openers\",\"dry_run\":true}")
OPENER_COUNT=$(echo "$OPENER_RESP" | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(r);console.log(d.count||0);}catch{console.log('error');}})")
echo "    Eligible openers: $OPENER_COUNT"
echo ""

# ── DRY-RUN: cold ────────────────────────────────────────────────────────
echo "[2/4] Dry-run: follow_up_cold..."
COLD_RESP=$(curl -s -X POST "$API" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_cold\",\"filter\":\"follow_up_cold\",\"dry_run\":true}")
COLD_COUNT=$(echo "$COLD_RESP" | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{try{const d=JSON.parse(r);console.log(d.count||0);}catch{console.log('error');}})")
echo "    Eligible cold:    $COLD_COUNT"
echo ""

TOTAL=$((OPENER_COUNT + COLD_COUNT))
echo "  TOTAL eligible for Touch-2 fire: $TOTAL"
echo ""

if [ "$TOTAL" -eq 0 ]; then
  echo "Nothing to fire. May 22 batch may already be processed, or 7-day gate not yet unlocked."
  echo "Check current state: curl -s \"https://crm.crownmediagroup.co/api/kingdom-reach/churches?token=\$SEED_TOKEN\" | grep -c follow_up_sent"
  exit 0
fi

# ── CONFIRM ──────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
read -p "  Proceed with LIVE fire? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted by King. No emails sent."
  exit 0
fi
echo ""

# ── LIVE: openers ────────────────────────────────────────────────────────
if [ "$OPENER_COUNT" -gt 0 ]; then
  echo "[3/4] Firing follow_up_openers ($OPENER_COUNT records)..."
  FIRE_OPENERS=$(curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_opener\",\"filter\":\"follow_up_openers\"}")
  echo "    Result: $FIRE_OPENERS"
  echo ""
  echo "    Breathing 60s (Resend rate-limit safety)..."
  sleep 60
fi

# ── LIVE: cold ───────────────────────────────────────────────────────────
if [ "$COLD_COUNT" -gt 0 ]; then
  echo "[4/4] Firing follow_up_cold ($COLD_COUNT records)..."
  FIRE_COLD=$(curl -s -X POST "$API" \
    -H "Content-Type: application/json" \
    -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_cold\",\"filter\":\"follow_up_cold\"}")
  echo "    Result: $FIRE_COLD"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  TOUCH-2 FIRE COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Next actions:"
echo "    • Watch inbox for replies — Hormozi 24-72 hr window opens NOW"
echo "    • Sweep at hour 24: node tools/kingdom-reach/check-replies.mjs --since=$(date +%Y-%m-%d)"
echo "    • Touch-3 (breakup_warm) for this cohort unlocks 2026-06-05"
echo ""
echo "  Funnel dashboard: https://crm.crownmediagroup.co/kingdom-reach/funnel"
echo "  Variant stats:    https://crm.crownmediagroup.co/api/kingdom-reach/variants/stats?token=\$SEED_TOKEN"
echo ""
echo "  All Glory to Jesus."
