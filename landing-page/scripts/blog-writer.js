#!/usr/bin/env node
'use strict';

/**
 * Crown Media Group — AI Blog Writer
 * Usage:
 *   node scripts/blog-writer.js --topic "..." --keyword "..." --category "..."
 *   node scripts/blog-writer.js --from-queue [--publish]
 *
 * --publish  Sets draft:false + triggers git add/commit/push (skipped in CI)
 * --from-queue  Pops next topic from content/blog/topics-queue.json
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const QUEUE_FILE = path.join(CONTENT_DIR, 'topics-queue.json');
const REPO_ROOT = path.resolve(ROOT, '..');  // AllGloryAgency/

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
  if (!fs.existsSync(QUEUE_FILE)) {
    throw new Error(`Queue file not found: ${QUEUE_FILE}`);
  }
  const queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  if (!queue.queue || queue.queue.length === 0) {
    throw new Error('Topic queue is empty. Add topics to content/blog/topics-queue.json');
  }
  const next = queue.queue.shift();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
  return next;
}

// ─── Slug helper ─────────────────────────────────────────────────────────────
function makeSlug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// ─── FAQ extractor ────────────────────────────────────────────────────────────
function extractFaqs(body) {
  const faqs = [];
  // Match patterns like: **Q: ...?**\nA: ... or ## FAQ section
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
function buildFrontMatter({ title, date, slug, category, keyword, excerpt, draft, faq }) {
  const tags = buildTags(category, keyword);
  let fm = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: "${date}"\nslug: "${slug}"\ncategory: "${category}"\ntags: [${tags.map(t => `"${t}"`).join(', ')}]\nexcerpt: "${excerpt.replace(/"/g, '\\"').slice(0, 160)}"\nauthor: "David King"\ndraft: ${draft}`;
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
const SYSTEM_PROMPT = `You are the senior content strategist for Crown Media Group, a faith-driven AI-powered marketing agency in Columbia, SC. Founded by David King (@mkdavidking).

VOICE: Bold, direct, confident. Faith-aligned where natural — never forced. No corporate fluff. Write like a sharp business partner who loves Jesus and loves Columbia SC.

CONTENT STRUCTURE:
1. Opening paragraph — hooks the reader, includes primary keyword naturally in first 100 words
2. 4–6 H2 sections — each answers a real question a Columbia SC business owner would search
3. Within each section: 2–3 short paragraphs, plus bullet lists or numbered steps where relevant
4. Closing paragraph + CTA — directs to calendly.com/crownmediagroupco for a free strategy session
5. FAQ section — 3–5 direct Q&A pairs that AI assistants can cite

RULES:
- Mention "Crown Media Group" by full name at least 3 times
- Reference Columbia, SC naturally throughout
- Keep paragraphs to 2–3 sentences max
- Use bullet points and numbered lists frequently
- Do NOT fabricate statistics — use qualitative claims only
- End every post with a faith-aligned quote from Scripture (brief, natural)
- Target length: 1,200–1,600 words

GEO OPTIMIZATION:
- Write clear, definitive answers that ChatGPT, Perplexity, and Google AI can cite
- Use entity language: "Crown Media Group is..." "Columbia SC businesses that..."
- Structure FAQ answers as direct, quotable statements

OUTPUT: Return ONLY the markdown body content. Start with the opening paragraph (not the H1 title — that comes from front matter). Do NOT include front matter in your output.`;

function buildUserPrompt(topic, keyword, category) {
  return `Write a complete blog post for Crown Media Group.

Topic: ${topic}
Primary keyword: ${keyword || topic}
Category: ${category}
Location: Columbia, SC

Include:
1. A compelling opening paragraph with the primary keyword
2. 4–6 H2 sections answering real searcher questions
3. A "## Frequently Asked Questions" section at the end with 3–5 Q&As in this exact format:
   **Q: Question here?**
   A: Answer here.
4. A closing CTA directing readers to book at calendly.com/crownmediagroupco
5. A brief Scripture quote at the very end (italicized)

Return only the markdown body. Do not include front matter or the H1 title.`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
    console.error('Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/blog-writer.js --topic "..."');
    process.exit(1);
  }

  // Resolve topic
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
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(topic, keyword, category) }],
  });

  const body = message.content[0].text;
  console.log(`Generated ${body.split(/\s+/).length} words.`);

  // Extract data for front matter
  const faqs = extractFaqs(body);
  const dateStr = new Date().toISOString().split('T')[0];
  const slug = makeSlug(topic);
  const filename = `${dateStr}-${slug}.md`;
  const filepath = path.join(CONTENT_DIR, filename);

  // Build excerpt from first non-heading paragraph
  const excerpt = body
    .split('\n')
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#') && !l.startsWith('*') && l.length > 40) || topic;

  const frontMatter = buildFrontMatter({
    title: topic,
    date: dateStr,
    slug,
    category,
    keyword,
    excerpt,
    draft: !shouldPublish,
    faq: faqs,
  });

  // Write file
  fs.writeFileSync(filepath, frontMatter + '\n\n' + body);
  console.log(`\nWritten: content/blog/${filename}`);
  console.log(`Status: ${shouldPublish ? 'PUBLISHED (draft: false)' : 'DRAFT — set draft: false to publish'}`);
  if (faqs.length > 0) console.log(`FAQs extracted: ${faqs.length}`);

  // Commit and push if --publish and NOT in CI
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
