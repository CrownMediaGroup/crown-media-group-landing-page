Send LinkedIn outreach via Playwright automation.

Run: `node Agency/tools/linkedin-outreach.js` with the provided flags.

Always --dry-run first to preview message. King approves before live send.

Actions: connect | message
Templates: connection_request | follow_up | columbia_owner | faith_aligned
Rate limit: 15 connections/day max (LinkedIn bans at 25+)

Example usage:
- Connect: `node Agency/tools/linkedin-outreach.js --action connect --user <profile-url> --template connection_request`
- Message: `node Agency/tools/linkedin-outreach.js --action message --user <profile-url> --template follow_up`
- Dry run: `node Agency/tools/linkedin-outreach.js --dry-run --action connect --user <url> --template columbia_owner`
- Batch: `node Agency/tools/linkedin-outreach.js --batch Agency/tools/li-queue.json`

Requires LI_USERNAME and LI_PASSWORD in .env.
Results logged to Supabase leads table with platform: linkedin.
