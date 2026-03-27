#!/bin/bash
# CRM Railway Deploy Script
# Run this AFTER: railway login
# Usage: bash tools/crm/deploy.sh

set -e
cd "$(dirname "$0")"

echo "[Deploy] Initializing Railway project for CRM..."
railway init --name "crown-media-crm"

echo "[Deploy] Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set DATA_DIR=/data
railway variables set PUBLIC_URL=https://crm.crownmediagroup.co

# Load from root .env
source ../../.env
railway variables set GMAIL_USER="$GMAIL_USER"
railway variables set GMAIL_APP_PASSWORD="$GMAIL_APP_PASSWORD"
railway variables set TWILIO_ACCOUNT_SID="$TWILIO_ACCOUNT_SID"
railway variables set TWILIO_AUTH_TOKEN="$TWILIO_AUTH_TOKEN"
railway variables set TWILIO_FROM_NUMBER="$TWILIO_FROM_NUMBER"
railway variables set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"

echo "[Deploy] Deploying to Railway..."
railway up --detach

echo ""
echo "✓ Deploy initiated. Run: railway status"
echo "✓ Next: Go to Railway dashboard → Service → Storage → Add Volume → Mount at /data"
echo "✓ Then: Add Cloudflare CNAME crm.crownmediagroup.co → your-service.railway.app"
