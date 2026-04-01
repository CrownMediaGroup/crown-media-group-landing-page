/**
 * video/script-generator.js — Generate YouTube voiceover script from blog post
 * Uses claude-opus-4-6 to produce structured narration with visual cues.
 * Crown Media Group
 */

import Anthropic from '@anthropic-ai/sdk';
import { loadEnv } from './utils.js';

loadEnv();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a professional YouTube scriptwriter for Crown Media Group, an AI-powered marketing agency in Columbia, SC. You write scripts for faceless educational videos targeting small business owners.

Your scripts must:
- Open with a specific, relatable pain point (not generic)
- Be conversational and confident — no fluff, no academic tone
- Reference Columbia SC and local businesses where relevant
- Naturally lead viewers to consider professional marketing help
- End with a clear CTA to crownmediagroup.co

Output ONLY valid JSON. No markdown, no code blocks, no commentary.`;

/**
 * Generate a voiceover script from a blog post.
 * @param {string} title - Blog post title
 * @param {string} body - Full blog post markdown body
 * @param {string} category - Post category
 * @returns {Promise<{hook, segments, cta, fullText, estimatedDuration}>}
 */
export async function generateScript(title, body, category) {
  const prompt = `Create a YouTube voiceover script for this blog post. Target duration: 2 minutes 30 seconds.

Blog Title: ${title}
Category: ${category}

Blog Content:
${body.slice(0, 4000)}

Return this exact JSON structure:
{
  "hook": "10-second opening line that hooks viewers with a specific pain point",
  "segments": [
    {
      "id": 1,
      "text": "Spoken narration for this segment (15-25 seconds when read aloud)",
      "visualCue": "What to show on screen — be specific (e.g., 'Google Analytics dashboard showing low traffic', 'Local Columbia SC storefront')",
      "duration": 20
    }
  ],
  "cta": "15-second closing CTA directing viewers to crownmediagroup.co for a free strategy session",
  "fullText": "Complete script from hook through CTA as one continuous piece (no stage directions)",
  "estimatedDuration": 150
}

Requirements:
- 6-8 segments total
- Each segment duration in seconds (15-25)
- estimatedDuration is total seconds (target 140-160)
- fullText is ONLY spoken words — no brackets, no directions
- visualCues should be descriptive and achievable with stock-style imagery`;

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
