#!/bin/bash
# Crown Media Group — Pre-commit security check
# Run before every git add . or git commit

echo "Running security audit..."

BLOCKED=0

# Check for sensitive patterns in staged file names
SENSITIVE_FILES=$(git diff --cached --name-only | grep -E "security/|assets/personal/|\.csv$|recovery|api_key|apikey|vault" 2>/dev/null)
if [ -n "$SENSITIVE_FILES" ]; then
  echo "BLOCKED: Sensitive file detected in staged area:"
  echo "$SENSITIVE_FILES"
  BLOCKED=1
fi

# Check for API keys / credentials in staged content
SENSITIVE_CONTENT=$(git diff --cached | grep -v "^-" | grep -E "sk-[a-zA-Z0-9]{20,}|api_key\s*=\s*['\"][^'\"]+|API_KEY\s*=\s*['\"][^'\"]+|password\s*=\s*['\"][^'\"]+|Bearer [a-zA-Z0-9\-_.]+|eyJ[a-zA-Z0-9_-]+" 2>/dev/null)
if [ -n "$SENSITIVE_CONTENT" ]; then
  echo "WARNING: Possible credential detected in staged changes"
  echo "$SENSITIVE_CONTENT" | head -5
  BLOCKED=1
fi

# Check settings.local.json is not staged
if git diff --cached --name-only | grep -q "settings.local.json"; then
  echo "BLOCKED: settings.local.json contains personal data — must not be committed"
  BLOCKED=1
fi

# Check client-onboarding-system is not staged (separate Railway repo)
if git diff --cached --name-only | grep -q "client-onboarding-system/"; then
  echo "WARNING: client-onboarding-system/ detected — this is a separate Railway repo"
  BLOCKED=1
fi

if [ $BLOCKED -eq 0 ]; then
  echo "CLEAR: Safe to commit"
  echo "Staged files:"
  git diff --cached --name-only
else
  echo ""
  echo "STOP: Review flagged items before committing"
  echo "Report to CC before proceeding"
  exit 1
fi
