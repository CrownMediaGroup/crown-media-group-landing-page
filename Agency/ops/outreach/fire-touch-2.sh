#!/usr/bin/env bash
# fire-touch-2.sh — fire Touch-2 follow-up campaign
# Run on 2026-05-15 (or any time after) to follow up with the 30 openers
# from the 2026-05-08 send. The cold cohort (75 records) was already fired
# on 2026-05-13.
#
# This script:
#   1. Dry-runs both filters to confirm counts
#   2. Fires the OPENER cohort (proof-led template)
#   3. Pauses 60 seconds for Resend rate-limit safety
#   4. Fires the COLD cohort if any new cold records have aged into eligibility
#
# Usage: bash Agency/ops/outreach/fire-touch-2.sh

set -e

API="https://crm.crownmediagroup.co/api/kingdom-reach/campaign/send"
TOKEN="KingdomSeed2026"

echo "=== DRY-RUN: follow_up_openers ==="
curl -s -X POST "$API" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_opener\",\"filter\":\"follow_up_openers\",\"dry_run\":true}" \
  | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{const d=JSON.parse(r);console.log('opener count:',d.count||0)})"

echo ""
echo "=== DRY-RUN: follow_up_cold ==="
curl -s -X POST "$API" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_cold\",\"filter\":\"follow_up_cold\",\"dry_run\":true}" \
  | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{const d=JSON.parse(r);console.log('cold count:',d.count||0)})"

echo ""
read -p "Proceed with live fire? [yes/no]: " confirm
if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo ""
echo "=== FIRING: follow_up_openers ==="
curl -s -X POST "$API" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_opener\",\"filter\":\"follow_up_openers\"}" \
  | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{const d=JSON.parse(r);console.log('OPENERS sent:',d.sent,'| failed:',d.failed,'| total:',d.total);if(d.errors&&d.errors.length)d.errors.slice(0,5).forEach(e=>console.log(' err:',e.church,'-',e.error))})"

echo ""
echo "Pausing 60s for Resend rate-limit safety..."
sleep 60

echo ""
echo "=== FIRING: follow_up_cold ==="
curl -s -X POST "$API" -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\",\"template\":\"follow_up_cold\",\"filter\":\"follow_up_cold\"}" \
  | node -e "let r='';process.stdin.on('data',c=>r+=c);process.stdin.on('end',()=>{const d=JSON.parse(r);console.log('COLD sent:',d.sent,'| failed:',d.failed,'| total:',d.total);if(d.errors&&d.errors.length)d.errors.slice(0,5).forEach(e=>console.log(' err:',e.church,'-',e.error))})"

echo ""
echo "=== DONE — check Resend dashboard for delivery, monitor inbox for replies ==="
