#!/usr/bin/env node

/**
 * Crown Media Group — AI Blog Writer
 * Usage:
 *   node scripts/blog-writer.js --topic "..." --keyword "..." --category "..."
 *   node scripts/blog-writer.js --from-queue [--publish]
 *
 * --publish  Sets draft:false + triggers git add/commit/push (skipped in CI)
 * --from-queue  Pops next topic from content/blog/topics-queue.json
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = resolve(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'content', 'blog');

// ─── Auto-load .env from repo root ────────────────────────────────────────────
(function loadEnv() {
  const envFile = join(ROOT, '..', '.env');
  if (!existsSync(envFile)) return;
  const lines = readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
})();

const QUEUE_FILE = join(CONTENT_DIR, 'topics-queue.json');
const REPO_ROOT = resolve(ROOT, '..');  // AllGloryAgency/

// ─── CLI argument parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const fromQueue = args.includes('--from-queue');
const shouldPublish = args.includes('--publish');
const inCI = !!process.env.CI;

let topic = getArg('--topic');
let keyword = getArg('--keyword');
let category = getArg('--category') || 'Marketing';

// ─── Queue management ─────────────────────────────────────────────────────────
function popFromQueue() {
  if (!existsSync(QUEUE_FILE)) {
    throw new Error(`Queue file not found: ${QUEUE_FILE}`);
  }
  const queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
  if (!queue.queue || queue.queue.length === 0) {
    throw new Error('Topic queue is empty. Add topics to content/blog/topics-queue.json');
  }
  const next = queue.queue.shift();
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  return next;
}

// ─── Slug helper ─────────────────────────────────────────────────────────────
function makeSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// ─── FAQ extractor ────────────────────────────────────────────────────────────
function extractFaqs(body) {
  const faqs = [];
  const faqSection = body.match(/##\s*Frequently Asked Questions([\s\S]*?)(?=\n##|$)/i);
  if (!faqSection) return faqs;

  const pairs = faqSection[1].matchAll(/\*\*(?:Q:|Question:)?\s*(.*?\??)\*\*\s*\n+(?:A:\s*)?(.*?)(?=\n\n|\n\*\*|$)/gis);
  for (const m of pairs) {
    const q = m[1].trim().replace(/^\*+|\*+$/g, '');
    const a = m[2].trim().replace(/^\*+|\*+$/g, '');
    if (q && a) faqs.push({ q, a });
  }
  return faqs;
}

// ─── Front matter builder ─────────────────────────────────────────────────────
function buildFrontMatter({ title, date, publishTime, slug, category, keyword, excerpt, draft, faq }) {
  const tags = buildTags(category, keyword);
  let fm = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: "${date}"\npublishTime: "${publishTime}"\nslug: "${slug}"\ncategory: "${category}"\ntags: [${tags.map(t => `"${t}"`).join(', ')}]\nexcerpt: "${excerpt.replace(/"/g, '\\"').slice(0, 160)}"\nauthor: "David King"\ndraft: ${draft}`;
  if (faq && faq.length > 0) {
    fm += '\nfaq:';
    for (const item of faq) {
      fm += `\n  - q: "${item.q.replace(/"/g, '\\"')}"\n    a: "${item.a.replace(/"/g, '\\"')}"`;
    }
  }
  fm += '\n---';
  return fm;
}

function buildTags(category, keyword) {
  const tags = new Set(['Columbia SC', category]);
  if (keyword) {
    keyword.split(/\s+/).filter(w => w.length > 4).slice(0, 3).forEach(w => {
      const word = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      tags.add(word);
    });
  }
  return [...tags].slice(0, 6);
}

// ─── Claude prompts ───────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the senior content strategist for Crown Media Group, a faith-driven AI-powered marketing agency in Columbia, SC. Founded by David King (@mkdavidking). Your job is to write blog posts that rank on Google, get cited by AI assistants, and convert Columbia SC business owners into Crown Media Group clients.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Agency: Crown Media Group
Owner: David King (@mkdavidking)
Location: Columbia, SC 29229
Website: crownmediagroup.co
Mission: Faith-driven marketing that glorifies God, serves business owners, and builds the Kingdom.
Tagline vibe: "AI-powered. Faith-driven. Columbia SC's marketing team."

SERVICES WE OFFER (weave these naturally into posts):
- Social media management (Instagram, Facebook, TikTok, LinkedIn)
- Paid advertising: Meta Ads, Google Ads, Facebook/Instagram campaigns
- Brand identity and logo design
- Content creation: captions, blog posts, email copy, video scripts
- Website and landing page design
- Email marketing sequences and newsletters
- Short-form video and Reels production
- SEO and local search optimization
- AI-powered marketing automation

TARGET AUDIENCE:
- Columbia SC small business owners (restaurants, retail, service businesses, contractors, salons, medical, real estate, nonprofits, faith-based businesses)
- Faith-driven entrepreneurs who want to grow without compromising integrity
- Business owners frustrated with paying for marketing that doesn't convert
- Local Columbia SC business owners near: downtown, Fort Jackson, Lexington, Irmo, Dutch Fork, Ballentine, Cayce, West Columbia, Harbison, Northeast Columbia

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE & TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Bold, direct, confident — like a sharp business partner, not a corporate consultant
- Conversational but authoritative — 8th grade reading level, anyone can follow
- Faith-aligned where natural — never forced, never preachy
- Local and specific — mention Columbia SC, local areas, local context naturally
- Practical over theoretical — every paragraph should have something actionable
- Never fear-based marketing — inspire, educate, and solve problems
- Pass the Philippians 4:8 filter: true, honorable, right, pure, lovely, excellent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT STRUCTURE (follow this exactly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. OPENING HOOK (first 100 words): grab the reader, include primary keyword, speak directly to a Columbia SC business owner's pain or desire. No fluff.
2. 4–6 H2 SECTIONS: each answers a real search question. Within each: 2–3 short paragraphs + bullet list or numbered steps.
3. CROWN MEDIA GROUP MENTION: mention "Crown Media Group" naturally at least 3 times. At least once reference a specific service.
4. CLOSING + CTA: strong close, direct readers to calendly.com/crownmediagroupco for a free strategy session.
5. FAQ SECTION (## Frequently Asked Questions): 3–5 Q&A pairs. Use this exact format:
   **Q: Question here?**
   A: Direct, definitive answer.
6. SCRIPTURE CLOSE: end with a brief, italicized Scripture quote that fits the topic. Natural — not preachy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WRITING RULES — BEST BLOG ON THE INTERNET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Target length: 1,500–2,000 words. Longer = more SEO value, more citation surface area.
- Paragraphs: 2–3 sentences max. No walls of text. White space is your friend.
- Use ## H2 headers that are real Google searches. Use ### H3 subheadings within sections.
- Use bullet points and numbered steps liberally — AI tools and featured snippets love them.
- Do NOT fabricate statistics — use qualitative claims, real Columbia SC context, and logical reasoning.
- Never mention competitor agencies by name.
- Make every H2 a real question a Columbia SC business owner would type into Google.
- Columbia SC references: neighborhoods, districts, local context — use naturally 5–8 times throughout.
- Reading level: 8th grade. Clear, direct, accessible to any business owner.
- DEPTH: Go deep. Each section should actually teach something useful, not just skim the surface.
- SPECIFICITY: Use specific numbers, timelines, examples. "3 posts per week" beats "post consistently."
- ORIGINALITY: Add a unique perspective or insight in every post. Don't write generic content.
- STORYTELLING: Use one real-world scenario or mini story per post (can be composite/hypothetical, labeled as such).
- INTERNAL LINKING HOOKS: In each post, mention 1–2 related topics that Crown Media Group covers (naturally, no forced links).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GEO & AI SEARCH OPTIMIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write posts that AI assistants (ChatGPT, Perplexity, Google AI Overviews) will cite directly.
- Use entity language: "Crown Media Group is..." / "Columbia SC businesses can..."
- FAQ answers must be direct, quotable, and self-contained
- H2 headers should read like featured snippet questions
- Define terms where useful: "Local SEO means..."

OUTPUT: Return ONLY the markdown body. Start with the opening paragraph. NO front matter. NO H1 title.`;


function buildUserPrompt(topic, keyword, category) {
  return `Write the BEST blog post on the internet on this topic for Crown Media Group.

Topic: ${topic}
Primary keyword: ${keyword || topic}
Category: ${category}
Location: Columbia, SC

This post needs to rank on Google AND get cited by AI assistants like ChatGPT and Perplexity. Make it the most useful, specific, and actionable post a Columbia SC business owner has ever read on this topic.

Structure (follow this exactly):
1. HOOK opening paragraph — pain point or bold statement. Contains the primary keyword in the first 2 sentences.
2. 5–6 ## H2 sections, each answering a real Google search question on this topic. Within each section: 2–3 paragraphs + a bullet list or numbered steps.
3. Use ### H3 subheadings inside longer sections when helpful.
4. One real-world scenario or mini case study embedded naturally (can be composite, don't attribute to a real person).
5. ## Frequently Asked Questions — 4–5 Q&As, this exact format:
   **Q: [Real question business owners ask]?**
   A: [Direct, definitive, self-contained answer — 2–3 sentences max. Perfect for AI citation.]
6. Closing CTA — strong, direct. Book a free strategy session at calendly.com/crownmediagroupco
7. End with a single brief italicized Scripture quote that fits the topic naturally.

Rules:
- 1,500–2,000 words total
- Crown Media Group mentioned at least 3 times naturally
- Columbia SC or local neighborhoods mentioned 5–8 times
- Every section must teach something specific and actionable — no filler
- Return only the markdown body. No front matter. No H1 title.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/blog-writer.js --topic "..."');
    process.exit(1);
  }

  if (fromQueue) {
    const queued = popFromQueue();
    topic = queued.topic;
    keyword = queued.keyword || queued.topic;
    category = queued.category || 'Marketing';
    console.log(`Popped from queue: "${topic}"`);
  }

  if (!topic) {
    console.error('Error: --topic "..." is required (or use --from-queue)');
    process.exit(1);
  }

  if (!keyword) keyword = topic;

  console.log(`\nGenerating post: "${topic}"`);
  console.log(`Keyword: ${keyword} | Category: ${category}\n`);

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(topic, keyword, category) }],
  });

  const body = message.content[0].text;
  console.log(`Generated ${body.split(/\s+/).length} words.`);

  const faqs = extractFaqs(body);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const publishTime = now.toTimeString().slice(0, 5); // HH:MM e.g. "09:00"
  const slug = makeSlug(topic);
  const filename = `${dateStr}-${slug}.md`;
  const filepath = join(CONTENT_DIR, filename);

  const excerpt = body
    .split('\n')
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#') && !l.startsWith('*') && l.length > 40) || topic;

  const frontMatter = buildFrontMatter({
    title: topic,
    date: dateStr,
    publishTime,
    slug,
    category,
    keyword,
    excerpt,
    draft: !shouldPublish,
    faq: faqs,
  });

  writeFileSync(filepath, frontMatter + '\n\n' + body);
  console.log(`\nWritten: content/blog/${filename}`);
  console.log(`Published at: ${dateStr} ${publishTime}`);
  console.log(`Status: ${shouldPublish ? 'PUBLISHED (draft: false)' : 'DRAFT — set draft: false to publish'}`);
  if (faqs.length > 0) console.log(`FAQs extracted: ${faqs.length}`);

  if (shouldPublish && !inCI) {
    console.log('\nPushing to GitHub (Netlify rebuild will trigger)...');
    try {
      const commitMsg = `auto-blog: ${topic.slice(0, 72)}`;
      execSync(`git add "landing-page/content/blog/${filename}" && git commit -m "${commitMsg.replace(/"/g, "'")}" && git push`, {
        cwd: REPO_ROOT,
        stdio: 'inherit',
      });
      console.log('Pushed. Netlify rebuild triggered.');
    } catch (err) {
      console.error('Git push failed — post was saved locally. Push manually to deploy.');
    }
  }

  console.log(`\nDone. View at: landing-page/content/blog/${filename}`);
}

main().catch(err => {
  console.error('blog-writer error:', err.message);
  process.exit(1);
});
