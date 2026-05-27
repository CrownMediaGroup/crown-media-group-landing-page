// tools/kingdom-reach/inkwell.js
// INKWELL (Agent 55) — Self-Refine editor (Madaan et al 2023).
// Any copy-producing agent passes output through INKWELL for one critique + rewrite pass.
// Uses Gemini Flash (free tier on this account).
// Cheapest +15% quality lever in the system.

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = 'gemini-flash-latest';

const SYSTEM_PROMPT = `You are INKWELL, the Self-Refine editor for Crown Media Group, a faith-aligned marketing agency.

You apply Self-Refine (Madaan 2023): given a draft, you (1) critique it briefly, (2) rewrite it tighter.

KING'S VOICE RULES (non-negotiable):
- Bold, direct, faith-infused where natural — NEVER church-speak
- No filler, no hedging, no apology language
- Confident CTA at end
- Show don't tell; specific over abstract
- Faith mentioned only when it lands inevitable, never forced
- Short sentences. Active voice. King speaks like a sovereign, not a salesperson.

WHAT TO CHECK:
- Subject lines: under 5 words, lowercase, no punctuation (cold email best practice)
- Body length: cold = <70 words ideal, follow-up = <100 words, breakup = <140 words
- Hormozi check: is the value-stack visible? Risk reversal present? Time delay framed?
- Cialdini check: at least one of reciprocity / social proof / authority / scarcity present
- Voss check: any calibrated questions or labels that invite engagement?
- StoryBrand check: customer is hero, we are guide (never the other way)

OUTPUT FORMAT — return ONLY a JSON object (no prose, no markdown fences):
{
  "critique": "1-2 sentences naming the weakest part of the draft",
  "revised_subject": "the rewritten subject (or null if no change needed)",
  "revised_body": "the full rewritten body",
  "quality_gap_estimate": <number 0-30 — your estimate of % quality improvement>
}`;

/**
 * Refine a draft. Returns { critique, revised_subject, revised_body, quality_gap_estimate }.
 * @param {object} input - { subject, body, context, agent_origin }
 */
export async function refine({ subject = '', body = '', context = '', agent_origin = 'UNKNOWN' }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1500,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const userPrompt = `Draft from ${agent_origin}:

SUBJECT: ${subject}

BODY:
${body}

CONTEXT: ${context}

Critique it, then rewrite. Return the JSON.`;

  // Retry with backoff on rate-limit
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await model.generateContent(userPrompt);
      break;
    } catch (err) {
      const msg = String(err.message || '');
      if (msg.includes('429') && attempt < 2) {
        const match = msg.match(/retry in (\d+(?:\.\d+)?)s/i) || msg.match(/"retryDelay":"(\d+)s"/);
        const waitSec = match ? Math.ceil(parseFloat(match[1])) + 2 : 15;
        await new Promise(r => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }

  const text = (result.response.text() || '').trim();
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      critique: String(parsed.critique || ''),
      revised_subject: parsed.revised_subject || subject,
      revised_body: String(parsed.revised_body || body),
      quality_gap_estimate: typeof parsed.quality_gap_estimate === 'number' ? parsed.quality_gap_estimate : 0,
    };
  } catch (err) {
    return {
      critique: 'Unparseable INKWELL output — returning original',
      revised_subject: subject,
      revised_body: body,
      quality_gap_estimate: 0,
      raw: text,
      parse_error: err.message,
    };
  }
}
