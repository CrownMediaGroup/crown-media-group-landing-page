Generate ad copy for a client using their intake data.

Ask the user for the following if not already provided:
- Business name
- Industry
- Brand tone
- Target audience
- Primary offer
- Platform (Meta, Google, or both)
- Words to always use / never use
- Landing page URL

Then generate ad copy following these rules:
- Never use manipulative tactics, false urgency, or deceptive claims
- Reflect Christian values — honest, warm, benefit-focused
- For Meta: produce 3 variations using these hook angles: benefit-led, pain point, social proof
  - Primary text: 125 chars max
  - Headline: 40 chars max
  - Description: 30 chars max
  - Include a CTA and image concept for each
- For Google: produce 1 RSA with 10 headlines (30 chars max) and 4 descriptions (90 chars max)
  - Distribute headlines across: keyword-rich, offer, trust/local, benefit, CTA angles
  - Include display path suggestions
- Use the prompt structure in /templates/meta-ad-prompt.md and /templates/google-ad-prompt.md
- Output results in clearly labeled sections ready to copy into Airtable or the ad platform
