import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You are an AI sales intelligence engine for Crown Media Group, a faith-driven marketing agency in Columbia SC. You receive a sales meeting transcript between King (agency owner) and a church leader. Extract ALL structured intelligence below and respond with VALID JSON ONLY — no prose, no markdown fences.

--- EXAMPLE 1 (Warm small church, no website, limited budget → Starter) ---
INPUT SUMMARY: Pastor says "we've been relying on Facebook but families keep telling us they can't find our service times." No website. 120 members. No budget mentioned. Interested in a simple site. Very warm and eager.
OUTPUT:
{
  "church_name": "Cornerstone Community Church",
  "pastor_name": "Pastor Marcus Webb",
  "phone": null,
  "address": null,
  "email": null,
  "pain_points": ["Families can't find service times online", "Facebook posts get buried — no permanent home for info", "New visitors show up at wrong times"],
  "interests": ["basic website", "Google Business Profile"],
  "bant": { "budget": null, "authority": "pastor alone", "need": "online presence so families can find service times and location", "timeline": null },
  "objections": ["not sure we can afford it right now"],
  "buying_signals": ["we've been meaning to do this for two years", "we lost a family who couldn't find us"],
  "tech_stack": "Facebook only",
  "budget_mentioned": null,
  "follow_up_date": null,
  "key_quotes": ["Families keep telling us they can't find our service times", "We lost a whole family because they showed up on the wrong day"],
  "church_dna": "A Spirit-led neighborhood church where every family knows they belong before they walk through the door.",
  "service_times": ["Sundays at 10:30 AM", "Wednesdays at 7:00 PM"],
  "tagline": "Find Your Family. Find Your Faith.",
  "website_needed": true,
  "social_media_needed": false,
  "overall_sentiment": "warm",
  "sentiment_confidence": 0.92,
  "recommended_tier": "Starter $500-800",
  "church_size": 120,
  "notes": "Pastor is the sole decision-maker. Very relational. Open to starting small."
}

--- EXAMPLE 2 (Medium church with bad website, growth mindset → Growth) ---
INPUT SUMMARY: Pastor mentions 400 members, has a Wix site that "looks terrible on phones." Wants social media help too. Budget around $1,200/month. Board approves spending over $1,000. Mentioned wanting to launch a capital campaign.
OUTPUT:
{
  "church_name": "New Life Worship Center",
  "pastor_name": "Dr. Patricia Okafor",
  "phone": "803-555-0192",
  "address": "2210 Broad River Rd, Columbia SC",
  "email": null,
  "pain_points": ["Wix website looks broken on mobile — visitors leave immediately", "No consistent social media presence", "Capital campaign needs a digital home"],
  "interests": ["website redesign", "social media management", "landing page for capital campaign"],
  "bant": { "budget": "$1,200/month", "authority": "board approval needed", "need": "professional digital presence to support growth and capital campaign", "timeline": "before summer kickoff" },
  "objections": ["board has to approve anything over $1,000", "we tried a web company before and they disappeared"],
  "buying_signals": ["we're ready to invest in this", "our members deserve better", "I want to show the board real results"],
  "tech_stack": "Wix website, Facebook page, no CRM",
  "budget_mentioned": "$1,200/month",
  "follow_up_date": "May 15",
  "key_quotes": ["Our members deserve better than what we have", "I want to show the board real results this time"],
  "church_dna": "A bold, multi-generational church pressing into growth with the faith to match their vision.",
  "service_times": ["Sundays at 8:00 AM", "Sundays at 11:00 AM", "Wednesdays at 6:30 PM"],
  "tagline": "Bold Faith. Real Community. New Life.",
  "website_needed": true,
  "social_media_needed": true,
  "overall_sentiment": "warm",
  "sentiment_confidence": 0.88,
  "recommended_tier": "Growth $1000-1500",
  "church_size": 400,
  "notes": "Board meeting is May 12. Proposal must be ready before then. Emphasize ROI and past client results."
}

--- END EXAMPLES ---

Now extract from the real transcript below using the same JSON schema exactly.

Tier logic — apply in order:
1. If budget_mentioned > $2500/mo OR church_size > 1000 → "Premium $2500-5000"
2. If budget_mentioned > $1200/mo OR church_size > 500 → "Growth $1000-1500"
3. Default → "Starter $500-800"

Rules:
- pain_points: SPECIFIC and concrete — what the pastor actually described, not generic agency-speak
- objections: only explicit resistance the pastor voiced — never infer
- buying_signals: only positive intent signals actually spoken or clearly implied
- key_quotes: verbatim or near-verbatim phrases with emotional weight
- church_dna: one sentence max, written from their identity — not a sales pitch
- service_times: array of ALL times mentioned — never guess if not in transcript
- bant.authority: "pastor alone" | "board approval needed" | "unknown"
- sentiment_confidence: float 0.0–1.0 based on buying signal density and tone
- If a field is unknown: string → null or "", array → [], boolean → false, number → null
- NEVER omit keys. Return valid JSON only.`;

export async function extractTranscript({ transcript, churchHint = {} }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  const userMsg = `Existing church metadata (use if useful, defer to transcript):
${JSON.stringify(churchHint, null, 2)}

--- TRANSCRIPT ---
${transcript}
--- END TRANSCRIPT ---

Return JSON only. No prose. No markdown.`;

  const primary  = process.env.KINGDOM_REACH_MODEL || 'claude-sonnet-4-6';
  const fallback = 'claude-haiku-4-5';

  let resp;
  try {
    resp = await client.messages.create({
      model: primary,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
  } catch (e) {
    if (primary === fallback) throw e;
    resp = await client.messages.create({
      model: fallback,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
  }

  const raw = resp?.content?.[0]?.text || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Claude returned non-JSON: ' + cleaned.slice(0, 200));
    parsed = JSON.parse(m[0]);
  }

  return normalizeExtraction(parsed, churchHint);
}

function coerceArray(val, fieldName) {
  if (Array.isArray(val)) return val;
  if (val === null || val === undefined) { console.warn(`[KR] ${fieldName} missing — defaulting to []`); return []; }
  if (typeof val === 'string' && val.length) { console.warn(`[KR] ${fieldName} was string, wrapping in array`); return [val]; }
  console.warn(`[KR] ${fieldName} unexpected type ${typeof val} — defaulting to []`);
  return [];
}

function coerceString(val, fieldName, fallback = '') {
  if (typeof val === 'string') return val;
  if (val === null || val === undefined) return fallback;
  console.warn(`[KR] ${fieldName} was ${typeof val}, coercing to string`);
  return String(val);
}

export function normalizeExtraction(p, hint = {}) {
  const VALID_SENTIMENT = ['warm', 'neutral', 'cold'];
  const VALID_TIERS     = ['Starter $500-800', 'Growth $1000-1500', 'Premium $2500-5000'];
  const VALID_AUTHORITY = ['pastor alone', 'board approval needed', 'unknown'];

  const rawBant = p.bant && typeof p.bant === 'object' ? p.bant : {};

  return {
    church_name:         coerceString(p.church_name, 'church_name', hint.name || 'Unknown Church'),
    pastor_name:         coerceString(p.pastor_name, 'pastor_name', hint.pastor || ''),
    phone:               coerceString(p.phone, 'phone', hint.phone || ''),
    address:             coerceString(p.address, 'address', hint.address || ''),
    email:               coerceString(p.email, 'email', hint.email || ''),
    pain_points:         coerceArray(p.pain_points, 'pain_points'),
    interests:           coerceArray(p.interests, 'interests'),
    bant: {
      budget:    rawBant.budget    ?? null,
      authority: VALID_AUTHORITY.includes(rawBant.authority) ? rawBant.authority : 'unknown',
      need:      coerceString(rawBant.need, 'bant.need'),
      timeline:  rawBant.timeline  ?? null,
    },
    objections:          coerceArray(p.objections, 'objections'),
    buying_signals:      coerceArray(p.buying_signals, 'buying_signals'),
    tech_stack:          coerceString(p.tech_stack, 'tech_stack', ''),
    budget_mentioned:    p.budget_mentioned    ?? null,
    follow_up_date:      p.follow_up_date      ?? null,
    key_quotes:          coerceArray(p.key_quotes, 'key_quotes'),
    church_dna:          coerceString(p.church_dna, 'church_dna'),
    service_times:       coerceArray(p.service_times, 'service_times'),
    tagline:             coerceString(p.tagline, 'tagline', 'A Place to Belong, Believe & Become'),
    website_needed:      Boolean(p.website_needed ?? !hint.website),
    social_media_needed: Boolean(p.social_media_needed ?? false),
    overall_sentiment:   VALID_SENTIMENT.includes(p.overall_sentiment) ? p.overall_sentiment : 'neutral',
    sentiment_confidence: typeof p.sentiment_confidence === 'number'
      ? Math.min(1, Math.max(0, p.sentiment_confidence))
      : 0.5,
    recommended_tier:    VALID_TIERS.includes(p.recommended_tier) ? p.recommended_tier : 'Starter $500-800',
    church_size:         typeof p.church_size === 'number' ? p.church_size : null,
    notes:               coerceString(p.notes, 'notes'),
  };
}

export function tierPrice(tier) {
  return ({
    'Starter $500-800':    { setup: '$150 - $300',   monthly: '$500 - $800' },
    'Growth $1000-1500':   { setup: '$300 - $500',   monthly: '$1,000 - $1,500' },
    'Premium $2500-5000':  { setup: '$500 - $1,000', monthly: '$2,500 - $5,000' },
  })[tier] || { setup: '$150 - $300', monthly: '$500 - $800' };
}

export function pipelineValue(tier) {
  return ({
    'Starter $500-800':   650,
    'Growth $1000-1500':  1250,
    'Premium $2500-5000': 3750,
  })[tier] || 650;
}
