Generate a client proposal from discovery call notes or lead data.

Run: `node Agency/tools/proposal-generator.js` with the provided flags.

If King hasn't provided these, ask:
1. Business name
2. Discovery notes (pain points, goals, current situation — even a sentence is enough)
3. Recommended tier (starter|growth|premium) — default to growth unless client has tight budget

Commands:
- From notes: `node Agency/tools/proposal-generator.js --business "Business Name" --tier growth --notes "No social media, wants more walk-ins"`
- From lead ID: `node Agency/tools/proposal-generator.js --lead-id <id> --tier growth`
- Starter: `node Agency/tools/proposal-generator.js --business "Business Name" --tier starter`

Output: Agency/clients/proposals/PROPOSAL-[BUSINESS]-[DATE].md
To convert to PDF: `npx md-to-pdf "path/to/proposal.md"`

Pricing (LOCKED):
- Starter: $750/mo + $250 setup
- Growth: $1,200/mo + $400 setup
- Premium: $3,500/mo + $1,000 setup

After generating, report the file path and offer to convert to PDF.
