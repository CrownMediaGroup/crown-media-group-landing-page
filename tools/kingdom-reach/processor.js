// processor.js — Claude-powered transcript extraction
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM = `You are an AI assistant for Crown Media Group, a faith-driven AI marketing agency in Columbia SC. You have just received a transcript of a sales meeting between King (the agency owner) and a church. Extract the structured intelligence below and respond with VALID JSON ONLY — no prose, no markdown, no code fences.

Schema:
{
  "church_name": string,
  "pastor_name": string,
  "phone": string,
  "address": string,
  "pain_points": string[],
  "interests": string[],
  "budget_mentioned": string|null,
  "follow_up_date": string|null,
  "key_quotes": string[],
  "website_needed": boolean,
  "social_media_needed": boolean,
  "overall_sentiment": "warm"|"neutral"|"cold",
  "recommended_tier": "Starter"|"Growth"|"Premium",
  "tagline": string,
  "service_times": string,
  "notes": string
}

Rules:
- recommended_tier: "Starter" ($500-800/mo) for small/no digital presence; "Growth" ($1000-1500/mo) for warm engaged mid-size; "Premium" ($2500-5000/mo) for large or high-budget signals.
- tagline: a short brand line (≤10 words) for their starter website hero.
- service_times: extract Sunday/Wednesday service times if mentioned, else "Sundays at 10:30 AM".
- key_quotes: 1-3 powerful direct phrases the pastor/leader said.
- Always return valid JSON. If a field is unknown, use empty string, empty array, or null — never omit keys.`;

export async function extractTranscript({ transcript, churchHint = {} }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const client = new Anthropic({ apiKey });

  const userMsg = `Transcript follows. Existing church metadata (use if useful):
${JSON.stringify(churchHint, null, 2)}

--- TRANSCRIPT ---
${transcript}
--- END TRANSCRIPT ---

Return JSON only.`;

  const primary  = process.env.KINGDOM_REACH_MODEL || 'claude-sonnet-4-6';
  const fallback = 'claude-sonnet-4-20250514';

  let resp;
  try {
    resp = await client.messages.create({
      model: primary,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
  } catch (e) {
    if (primary === fallback) throw e;
    resp = await client.messages.create({
      model: fallback,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    });
  }

  const raw = resp?.content?.[0]?.text || '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Claude returned non-JSON output: ' + cleaned.slice(0, 200));
    parsed = JSON.parse(m[0]);
  }

  return normalizeExtraction(parsed, churchHint);
}

function normalizeExtraction(p, hint = {}) {
  return {
    church_name:         p.church_name        || hint.name        || 'Unknown Church',
    pastor_name:         p.pastor_name        || hint.pastor      || '',
    phone:               p.phone              || hint.phone       || '',
    address:             p.address            || hint.address     || '',
    pain_points:         Array.isArray(p.pain_points) ? p.pain_points : [],
    interests:           Array.isArray(p.interests)   ? p.interests   : [],
    budget_mentioned:    p.budget_mentioned   ?? null,
    follow_up_date:      p.follow_up_date     ?? null,
    key_quotes:          Array.isArray(p.key_quotes)  ? p.key_quotes  : [],
    website_needed:      Boolean(p.website_needed ?? !hint.website),
    social_media_needed: Boolean(p.social_media_needed ?? true),
    overall_sentiment:   ['warm','neutral','cold'].includes(p.overall_sentiment) ? p.overall_sentiment : 'warm',
    recommended_tier:    ['Starter','Growth','Premium'].includes(p.recommended_tier) ? p.recommended_tier : 'Starter',
    tagline:             p.tagline            || 'A Place to Belong, Believe & Become',
    service_times:       p.service_times      || 'Sundays at 10:30 AM',
    notes:               p.notes              || '',
  };
}

export function tierPrice(tier) {
  return ({
    Starter: { setup: '$150 - $300', monthly: '$500 - $800' },
    Growth:  { setup: '$300 - $500', monthly: '$1,000 - $1,500' },
    Premium: { setup: '$500 - $1,000', monthly: '$2,500 - $5,000' },
  })[tier] || { setup: '$150 - $300', monthly: '$500 - $800' };
}

export function pipelineValue(tier) {
  return ({ Starter: 650, Growth: 1250, Premium: 3750 })[tier] || 650;
}
