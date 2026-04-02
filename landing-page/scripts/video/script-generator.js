/**
 * video/script-generator.js — Generate YouTube voiceover script from blog post
 * Uses claude-opus-4-6 to produce structured narration with visual cues.
 * Crown Media Group
 */

import Anthropic from '@anthropic-ai/sdk';
import { loadEnv } from './utils.js';

loadEnv();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a top YouTube scriptwriter for Crown Media Group, an AI-powered marketing agency. You write high-retention faceless educational videos for entrepreneurs and small business owners.

CRITICAL: You do NOT read blog posts aloud. You extract the core insight and rebuild it as a YouTube-native script. The blog is source material only.

FAITH FOUNDATION — REQUIRED in every script:
- Ground 1-2 key points in biblical truth. Weave it naturally, not preachy.
- When quoting Scripture, use the AMP (Amplified) or NLT (New Living Translation) version only.
- Examples: "Proverbs 21:5 in the Amplified says, 'The plans of the diligent lead surely to abundance...'" or "Proverbs 22:29 NLT — 'Do you see any truly competent workers? They will serve kings rather than working for ordinary people.'"
- Faith should feel natural and empowering — like a mentor who happens to love God.

YouTube optimization rules you always follow:
- Hook (first 5-8 seconds): pattern interrupt — ask a question, make a bold claim, or show the pain. Never start with "In this video..."
- Retention: each segment must end with an implied reason to keep watching (open loop, curiosity gap, "but here's the thing...")
- Pacing: short punchy sentences. No paragraph dumps. Speak like you're talking to one person.
- Story > lecture: use a quick real-world scenario or before/after example in the middle
- Audience scope: US and global small business owners. Do NOT mention Columbia SC. Talk to entrepreneurs everywhere.
- CTA: earn it — summarize the value delivered, THEN ask them to visit crownmediagroup.co
- Faith-aligned tone: confident, bold, servant-hearted. Never manipulative.

Voice: David King — direct, no filler, faith-infused, speaks with authority and conviction.

Output ONLY valid JSON. No markdown, no code blocks, no commentary.`;

/**
 * Generate a voiceover script from a blog post.
 * @param {string} title - Blog post title
 * @param {string} body - Full blog post markdown body
 * @param {string} category - Post category
 * @returns {Promise<{hook, segments, cta, fullText, estimatedDuration}>}
 */
export async function generateScript(title, body, category) {
  const prompt = `Turn this blog post into a YouTube video script. Do NOT recite the blog — extract the core value and rebuild it as a high-retention YouTube video.

Blog Title: ${title}
Category: ${category}

Blog Content (source material only — do not copy):
${body.slice(0, 4000)}

Think about what small business owners and entrepreneurs globally or across the US would SEARCH for related to this topic. Use that search intent to frame the video. Make the title-worthy angle something people are actively looking for. Do NOT localize to Columbia SC — this is a global YouTube audience.

Return this exact JSON structure:
{
  "searchAngle": "The search query or trending topic this video is optimized for (e.g. 'how to get more customers on Facebook 2026')",
  "hook": "First 8 seconds — bold statement, painful question, or pattern interrupt. Never 'In this video...'",
  "segments": [
    {
      "id": 1,
      "text": "Spoken narration — punchy, conversational, 15-25 seconds when read aloud. End with an open loop or curiosity gap to retain viewers.",
      "visualCue": "Specific visual for this segment (e.g., 'Split screen: empty restaurant vs packed one', 'Facebook Ads Manager dashboard')",
      "duration": 20
    }
  ],
  "cta": "15-second closing CTA — summarize value delivered, then direct to crownmediagroup.co for a free strategy session",
  "fullText": "Complete spoken script from hook through CTA — no brackets, no stage directions, spoken words only",
  "estimatedDuration": 150,
  "suggestedTitle": "YouTube-optimized video title (search-friendly, under 70 chars)",
  "suggestedTags": ["tag1", "tag2", "tag3", "columbia sc", "small business marketing"]
}

Requirements:
- 6-8 segments
- Each segment 15-25 seconds
- estimatedDuration target: 140-160 seconds
- fullText = only spoken words
- Script tone: David King — direct, bold, confident, faith-infused
- At least 1 Bible verse woven in naturally (AMP or NLT version, full quote)
- Geography: US/global audience. No Columbia SC unless it's a local promo video.`;

  const message = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 3000,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0]?.text?.trim() || '';
  // Strip any accidental markdown code fences
  const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let script;
  try {
    script = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Claude returned invalid JSON for script: ${e.message}\nRaw: ${raw.slice(0, 200)}`);
  }

  if (!script.fullText || !script.segments) {
    throw new Error('Script is missing required fields (fullText or segments)');
  }

  return script;
}
