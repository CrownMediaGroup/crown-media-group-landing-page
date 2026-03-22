View and manage the Crown Media Group lead pipeline.

Run: `node Agency/tools/lead-tracker.js` with the provided subcommand.

Commands:
- Add lead: `node Agency/tools/lead-tracker.js add "Business Name" --contact @handle --method dm|in_person|referral|call`
- List all: `node Agency/tools/lead-tracker.js list`
- Filter: `node Agency/tools/lead-tracker.js list --status contacted`
- Update: `node Agency/tools/lead-tracker.js update <id> --status call_booked --notes "text" --followup YYYY-MM-DD`
- Follow-ups due: `node Agency/tools/lead-tracker.js followup`
- Stats: `node Agency/tools/lead-tracker.js stats`
- View detail: `node Agency/tools/lead-tracker.js view <id>`

Statuses: new → contacted → call_booked → proposal_sent → closed_won | closed_lost
Data stored in Supabase leads table with local cache fallback at Agency/ops/leads-cache.json.

If King says "check pipeline" or "what leads do I have" — run: node Agency/tools/lead-tracker.js stats then list
