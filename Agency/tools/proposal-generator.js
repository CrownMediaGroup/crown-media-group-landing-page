/**
 * proposal-generator.js — Auto-generate client proposals
 * Crown Media Group | Markdown → ready to send or print
 *
 * Usage:
 *   node Agency/tools/proposal-generator.js --business "Anointed Cuts" --tier growth --notes "No social media, wants more walk-ins"
 *   node Agency/tools/proposal-generator.js --business "Fade Factory" --tier starter
 *   node Agency/tools/proposal-generator.js --lead-id 3 --tier growth  ← pulls from Supabase leads table
 *
 * Output: Agency/clients/proposals/PROPOSAL-[BUSINESS]-[DATE].md
 *
 * Tiers: starter | growth | premium
 * Pricing: LOCKED — Starter $750/$250 | Growth $1200/$400 | Premium $3500/$1000
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path = require('path');
const fs   = require('fs');

const OUTPUT_DIR = path.join(__dirname, '../clients/proposals');

// ── LOCKED PRICING (never change without King approval) ───────────────────────
const TIERS = {
  starter: {
    name:     'Starter',
    monthly:  750,
    setup:    250,
    tagline:  'Perfect for businesses ready to establish their digital presence.',
    deliverables: [
      '8 custom social media posts/month (Instagram + Facebook)',
      'Basic brand voice guide',
      'Monthly performance report',
      'Content calendar',
      'Caption copywriting',
      'Hashtag strategy',
      'One platform focus (Instagram OR Facebook)',
    ],
    timeline: '48-hour content turnaround',
    ideal:    'Small businesses just starting with social media',
  },
  growth: {
    name:     'Growth',
    monthly:  1200,
    setup:    400,
    tagline:  'For businesses ready to grow fast and dominate their local market.',
    deliverables: [
      '16 custom social media posts/month (Instagram + Facebook + X)',
      'AI-generated video content (2 Reels/month)',
      'Paid ads management (Meta) — ad spend billed separately',
      'Full brand strategy session',
      'Monthly analytics report with recommendations',
      'Content calendar (30 days out)',
      'Story/Reel creation',
      'Competitor analysis',
      'Direct access to David King',
    ],
    timeline: '48-hour content turnaround, ads live within 72 hours',
    ideal:    'Growing businesses wanting real results in 30 days',
  },
  premium: {
    name:     'Premium',
    monthly:  3500,
    setup:    1000,
    tagline:  'Full-service AI-powered marketing for businesses serious about dominating their market.',
    deliverables: [
      '30+ custom posts/month across all platforms',
      'AI video production (4+ Reels/month)',
      'Full paid ads management (Meta + Google) — ad spend billed separately',
      'Landing page design + build (Lovable)',
      'Email marketing sequence (up to 5 emails)',
      'Full brand identity package',
      'Weekly strategy calls',
      'Priority 24-hour turnaround on all requests',
      'Monthly growth report + strategy session',
      'E-commerce setup (if applicable)',
    ],
    timeline: '24-hour priority turnaround on all deliverables',
    ideal:    'Established businesses ready to scale aggressively',
  },
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function slug(name) {
  return name.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
}

function today() {
  return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function todaySlug() {
  return new Date().toISOString().slice(0, 10);
}

// ── Pain point → ROI argument ─────────────────────────────────────────────────
function buildROI(notes, tier) {
  if (!notes) return `Every month without marketing is revenue left on the table. At $${TIERS[tier].monthly}/month, Crown Media Group pays for itself with just 1-2 new clients.`;

  const n = notes.toLowerCase();
  if (n.includes('walk-in') || n.includes('foot traffic'))
    return `At $${TIERS[tier].monthly}/month, landing just 2-3 new walk-in customers covers your investment — and we typically see results in the first 30 days.`;
  if (n.includes('instagram') || n.includes('social'))
    return `Your competitors are posting consistently. We'll get you ahead of them in 30 days. At $${TIERS[tier].monthly}/month, one new client makes this pay for itself.`;
  if (n.includes('website') || n.includes('online'))
    return `Most customers check Instagram or Google before they walk in. We'll make sure they find you first — and we deliver in 48 hours.`;
  if (n.includes('ad') || n.includes('paid'))
    return `The right ad targeting in Columbia, SC can bring immediate results. We've seen local businesses get booked out within the first week of running campaigns.`;

  return `At $${TIERS[tier].monthly}/month, you need just 1 new client per month for this to pay for itself. Our average client sees results within the first 30 days.`;
}

// ── Build pain point section ──────────────────────────────────────────────────
function buildPainPoints(notes) {
  if (!notes) return `- Needs stronger digital presence to attract new customers\n- Currently underutilizing social media and AI-powered tools\n- Wants consistent, professional content without doing it themselves`;

  const lines = [];
  const n = notes.toLowerCase();
  if (n.includes('instagram') || n.includes('social') || n.includes('post'))
    lines.push('- Inconsistent or nonexistent social media presence');
  if (n.includes('walk-in') || n.includes('customer') || n.includes('traffic'))
    lines.push('- Wants more walk-in customers and local visibility');
  if (n.includes('website') || n.includes('online'))
    lines.push('- Needs stronger online presence / website');
  if (n.includes('ad') || n.includes('paid') || n.includes('reach'))
    lines.push('- Wants to expand reach through paid advertising');
  if (n.includes('brand') || n.includes('professional') || n.includes('image'))
    lines.push('- Needs professional brand image to compete locally');
  if (!lines.length)
    lines.push(`- ${notes}`);

  return lines.join('\n');
}

// ── Generate proposal markdown ────────────────────────────────────────────────
function generateProposal(business, tier, notes) {
  const t    = TIERS[tier];
  const roi  = buildROI(notes, tier);
  const pain = buildPainPoints(notes);
  const date = today();

  return `# Marketing Proposal for ${business}
### Prepared by Crown Media Group | ${date}

---

> *"Write the vision and make it plain, so he may run who reads it." — Habakkuk 2:2*

---

## About Crown Media Group

Crown Media Group is a faith-driven, AI-powered marketing agency based in Columbia, SC. Founded by David King, we serve local businesses with enterprise-level marketing — content creation, paid ads, AI video, and brand strategy — at prices that make sense for small businesses.

**Website:** crownmediagroup.co
**Email:** king@crownmediagroup.co
**Phone:** Available upon request
**Location:** Columbia, SC 29229

We don't hand you off to an intern. You get David King, real AI tools, and real results — delivered in 48 hours.

---

## What We Heard From You

Based on our conversation, here's what ${business} is working through:

${pain}

We hear this from Columbia businesses every week. The good news: this is exactly what Crown Media Group was built to solve.

---

## Our Recommendation: ${t.name} Package

**${t.tagline}**

${business} is a great fit for our **${t.name} Package** — here's what you get:

${t.deliverables.map(d => `- ${d}`).join('\n')}

**Turnaround:** ${t.timeline}
**Ideal for:** ${t.ideal}

---

## Investment

| | ${t.name} Package |
|---|---|
| Monthly retainer | $${t.monthly.toLocaleString()}/month |
| One-time setup fee | $${t.setup.toLocaleString()} |
| **First month total** | **$${(t.monthly + t.setup).toLocaleString()}** |
| Ongoing monthly | $${t.monthly.toLocaleString()}/month |

> Setup fee is due before work begins. Monthly retainer billed on the 1st of each month.
> Ad spend (if applicable) is billed separately — you control the budget.

---

## The ROI Case

${roi}

**What it costs you to NOT have marketing:**
Every week without consistent content is visibility your competitors are taking. In Columbia, SC, local businesses that show up online consistently win — full stop.

---

## What Happens Next

1. **You say yes** — we send a simple 1-page contract
2. **Setup fee collected** — work begins immediately
3. **Onboarding call** — 30 minutes to gather assets and align on goals
4. **First content delivered within 48 hours**
5. **First results visible within 30 days**

---

## Ready to Start?

Book a call or reply directly:

**Book:** [calendly.com/davidkinghub](https://calendly.com/davidkinghub)
**Email:** king@crownmediagroup.co

We only take clients we know we can deliver results for. ${business} is one of them.

---

*All Glory to Jesus. — David King, CEO & Founder, Crown Media Group*

---
*© ${new Date().getFullYear()} Crown Media Group | All Glory to Jesus Global LLC | Columbia, SC*
`;
}

// ── Supabase lead fetch ───────────────────────────────────────────────────────
async function fetchLead(leadId) {
  let createClient;
  try {
    ({ createClient } = require('@supabase/supabase-js'));
  } catch {
    ({ createClient } = require(
      path.join(__dirname, '../../tools/calls/node_modules/@supabase/supabase-js')
    ));
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { data, error } = await supabase.from('leads').select('*').eq('id', leadId).single();
  if (error) throw new Error(`Lead ${leadId} not found: ${error.message}`);
  return data;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key  = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    }
  }

  let business = flags['business'];
  let notes    = flags['notes'] || null;
  const tier   = (flags['tier'] || 'growth').toLowerCase();
  const leadId = flags['lead-id'];

  if (!TIERS[tier]) {
    console.error(`ERROR: Invalid tier "${tier}". Options: starter, growth, premium`);
    process.exit(1);
  }

  // Pull from Supabase lead if --lead-id provided
  if (leadId && !business) {
    const lead = await fetchLead(leadId);
    business = lead.business_name || lead.name;
    notes    = notes || lead.notes;
    console.log(`[LEAD] Pulled: ${business}`);
  }

  if (!business) {
    console.error('ERROR: Provide --business "Name" or --lead-id <id>');
    process.exit(1);
  }

  const markdown = generateProposal(business, tier, notes);
  const filename = `PROPOSAL-${slug(business)}-${todaySlug()}.md`;
  const filepath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(filepath, markdown);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`[PROPOSAL] Generated for: ${business}`);
  console.log(`[TIER]     ${TIERS[tier].name} — $${TIERS[tier].monthly}/mo + $${TIERS[tier].setup} setup`);
  console.log(`[OUTPUT]   ${filepath}`);
  console.log('═'.repeat(60));
  console.log('\nReady to send. Convert to PDF with:');
  console.log(`  npx md-to-pdf "${filepath}"`);
  console.log('Or paste into Google Docs for polished formatting.\n');
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
