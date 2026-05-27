// tools/kingdom-reach/reply-classifier.js
// Reply intelligence — classifies inbound replies using Gemini Flash (free tier).
// Output drives auto-routing: positive → CLOSER queue, objection → ECHO handler,
// not_interested → suppress, referral → re-target, auto_reply → ignore, bounce → mark.

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = 'gemini-flash-latest';  // Free tier on this account — 5 RPM / 1500 RPD

const SYSTEM_PROMPT = `You classify cold-outreach email replies for Crown Media Group, a faith-aligned marketing agency cold-emailing churches and Christian organizations in South Carolina.

Return ONLY a JSON object (no prose, no markdown fences) with these exact keys:
{
  "category": "<one of: positive_interest | objection | not_interested | referral | auto_reply | bounce | unsubscribe_request | neutral_acknowledgment>",
  "confidence": <0.0-1.0>,
  "intent_summary": "<one short sentence describing what the sender wants>",
  "suggested_action": "<one short sentence on what we should do next>",
  "key_extract": "<the most important verbatim phrase from the reply, max 120 chars>"
}

Definitions:
- positive_interest: sender wants more info, asks a question, agrees to a call, says "tell me more", "interested", "yes", "sounds good", "let's talk", forwards positively, or asks for the next step.
- objection: sender raises a concern (price, timing, fit, decision-maker, "we already have...", "not the right time but...") that signals interest could be unlocked by addressing it.
- not_interested: clear no — "not interested", "no thank you", "we're good", "please stop", "remove me" without explicit unsubscribe verb.
- referral: sender forwards or names another person ("contact our admin", "talk to Pastor X", "I'll pass it along").
- auto_reply: out-of-office, vacation, on-leave, automatic vacation responder. Sender is NOT actually engaging.
- bounce: mailer-daemon, delivery failed, address not found, bounced. Usually sender contains "MAILER-DAEMON" or "postmaster".
- unsubscribe_request: explicit "unsubscribe", "opt out", "stop emailing", "remove from list" verb.
- neutral_acknowledgment: vague "got it", "thanks", "received" with no commitment or question.

Be conservative — when ambiguous between positive_interest and neutral_acknowledgment, choose neutral.
When a reply mixes signals (e.g., "interested but no budget"), pick the dominant category and mention the secondary in intent_summary.`;

/**
 * Classify a single email reply.
 * @param {object} input - { subject, body, sender, recipient }
 * @returns {Promise<object>} - { category, confidence, intent_summary, suggested_action, key_extract }
 */
export async function classifyReply({ subject = '', body = '', sender = '', recipient = '' }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1200,  // larger budget — 2.5-flash thinking consumes output tokens
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },  // disable thinking — direct response
    },
  });

  const userPrompt = `From: ${sender}
To: ${recipient}
Subject: ${subject}

Body:
${String(body).slice(0, 4000)}`;

  // Retry-with-backoff for 429 rate-limit errors (free-tier quota)
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

  // Strip code fences if model added them despite instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    // Fallback — bad JSON returned
    return {
      category: 'neutral_acknowledgment',
      confidence: 0.0,
      intent_summary: 'Unparseable classifier output — manual review needed',
      suggested_action: 'Review manually in Gmail',
      key_extract: cleaned.slice(0, 120),
      raw: text,
      parse_error: err.message,
    };
  }

  // Normalize
  return {
    category: String(parsed.category || 'neutral_acknowledgment').toLowerCase(),
    confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    intent_summary: String(parsed.intent_summary || ''),
    suggested_action: String(parsed.suggested_action || ''),
    key_extract: String(parsed.key_extract || '').slice(0, 120),
  };
}

/**
 * Map classification to CRM action — returns the PATCH body to send to
 * `PATCH /api/kingdom-reach/churches/:id` along with the routing destination.
 */
export function classificationToCrmAction(classification, currentNotes = '') {
  const c = classification.category;
  const timestamp = new Date().toISOString();
  const trailer = `\n[${timestamp}] [${c.toUpperCase()}] ${classification.intent_summary} | ${classification.suggested_action}`;
  const notes = (currentNotes || '') + trailer;

  switch (c) {
    case 'positive_interest':
      return {
        crm_patch: { replied: 1, replied_at: timestamp, status: 'Hot Lead', notes },
        route: 'CLOSER_QUEUE',
        alert_king: true,
      };
    case 'objection':
      return {
        crm_patch: { replied: 1, replied_at: timestamp, status: 'Objection', notes },
        route: 'ECHO_OBJECTION_HANDLER',
        alert_king: true,
      };
    case 'referral':
      return {
        crm_patch: { replied: 1, replied_at: timestamp, status: 'Referral', notes },
        route: 'WORDSMITH_REFERRAL_RETARGET',
        alert_king: true,
      };
    case 'not_interested':
      return {
        crm_patch: { replied: 1, replied_at: timestamp, status: 'Not Interested', notes },
        route: 'SUPPRESS',
        alert_king: false,
      };
    case 'unsubscribe_request':
      return {
        crm_patch: { unsubscribed: 1, unsubscribed_at: timestamp, status: 'Unsubscribed', notes },
        route: 'SUPPRESS',
        alert_king: false,
      };
    case 'bounce':
      return {
        crm_patch: { email_bounced: 1, email_bounced_at: timestamp, notes },
        route: 'BOUNCE_HANDLER',
        alert_king: false,
      };
    case 'auto_reply':
      // Do NOT mark as replied — auto-responders aren't real engagement
      return {
        crm_patch: { notes },
        route: 'IGNORE',
        alert_king: false,
      };
    case 'neutral_acknowledgment':
    default:
      return {
        crm_patch: { replied: 1, replied_at: timestamp, status: 'Acknowledged', notes },
        route: 'WORDSMITH_NUDGE',
        alert_king: false,
      };
  }
}
