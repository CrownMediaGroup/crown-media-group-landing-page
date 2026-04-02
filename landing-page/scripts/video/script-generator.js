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
- Faith should feel natural and empowering — like a mentor who happens to love God.
- CRITICAL: NEVER use the same verse twice across videos. Rotate widely through Scripture. Draw from ALL of these categories:

  BUSINESS & DILIGENCE: Proverbs 21:5, Proverbs 22:29, Proverbs 10:4, Proverbs 13:4, Proverbs 14:23, Ecclesiastes 9:10, Colossians 3:23, 2 Thessalonians 3:10
  WISDOM & STRATEGY: Proverbs 15:22, Proverbs 11:14, Proverbs 16:3, Proverbs 3:5-6, James 1:5, Proverbs 19:20, Isaiah 46:10
  FAITH & ABUNDANCE: Matthew 6:33, Luke 6:38, Malachi 3:10, Deuteronomy 8:18, Philippians 4:19, 3 John 1:2, Genesis 12:2
  COURAGE & BOLDNESS: Joshua 1:9, Isaiah 41:10, Philippians 4:13, 2 Timothy 1:7, Romans 8:31, Deuteronomy 31:6
  GROWTH & FRUIT: John 15:5, Galatians 6:9, John 15:8, Matthew 25:21, Luke 19:17, 1 Corinthians 3:6-7
  PURPOSE & CALLING: Jeremiah 29:11, Romans 8:28, Ephesians 2:10, Proverbs 20:5, Habakkuk 2:2, Isaiah 43:19
  EXCELLENCE & REPUTATION: Proverbs 22:1, Daniel 6:3, Proverbs 31:10, Matthew 5:16, 1 Peter 2:12
  PERSEVERANCE: Hebrews 12:1-2, Galatians 6:9, James 1:2-4, Romans 5:3-4, Philippians 1:6, 2 Corinthians 4:17

- Pick the verse that fits the video topic most naturally — do NOT default to the same 2-3 verses every time.
- Quote the FULL verse text (not just the reference). Example: "Proverbs 22:29 NLT says — 'Do you see any truly competent workers? They will serve kings rather than working for ordinary people.'"

YouTube optimization rules you always follow:
- Hook (first 5-8 seconds): pattern interrupt — ask a question, make a bold claim, or show the pain. Never start with "In this video..."
- Retention: each segment must end with an implied reason to keep watching (open loop, curiosity gap, "but here's the thing...")
- Pacing: short punchy sentences. No paragraph dumps. Speak like you're talking to one person.
- Story > lecture: EVERY script must include at least one of these:
    * A parable-style story ("There was a restaurant owner in Atlanta who...") — simple, relatable, reveals the truth
    * An analogy that makes the concept click instantly ("It's like trying to fill a bucket with holes in it...")
    * A before/after scenario ("Six months ago she had 12 followers. Today she has 4,200 and a waitlist...")
    * A character the audience sees themselves in — average person, not an expert
  The story should make the ordinary person say "that's me" and feel like the solution is within reach.
- Peaceful urgency tone: confident and calm — like someone who KNOWS the answer and wants you to have it. Not hype, not panic. Like a trusted mentor who says "this matters and now is the time." Think: the Good Shepherd calling the sheep by name. Grounded. Sure. Moved by love, not fear.
- Crown Media Group is the clear and obvious next step — not pushy, just inevitable. By the end they should feel: "I've been waiting for this."
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
      "visualCue": "Cinematic heavenly visual for this segment. Think ethereal, divine light, aspirational. Examples: 'Entrepreneur silhouetted against golden god rays breaking through storm clouds', 'Hands typing on laptop bathed in warm heavenly light with soft bokeh', 'Aerial view of city at golden hour with divine light rays', 'Business owner standing tall, upward camera angle, radiant background glow'. Match the emotional tone of the narration. No generic stock photo descriptions.",
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
