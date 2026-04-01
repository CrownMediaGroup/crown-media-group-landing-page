#!/usr/bin/env node
/**
 * Crown Media Group — Auto-Blogger Service
 * Client Blog Writer — parameterized from client config JSON
 *
 * Usage:
 *   CLIENT_CONFIG=client-slug node blog-writer-client.js --topic "..." --keyword "..." --category "..."
 *   CLIENT_CONFIG=client-slug node blog-writer-client.js --from-queue [--publish]
 *   CLIENT_CONFIG_PATH=/abs/path/to/config.json node blog-writer-client.js --from-queue
 *
 * Env vars:
 *   CLIENT_CONFIG       — slug matching clients/[slug]/config.json (relative to this script)
 *   CLIENT_CONFIG_PATH  — absolute path to config.json (overrides CLIENT_CONFIG)
 *   ANTHROPIC_API_KEY   — Claude API key
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Config loader ─────────────────────────────────────────────────────────────
function loadConfig() {
  let configPath = process.env.CLIENT_CONFIG_PATH;

  if (!configPath) {
    const slug = process.env.CLIENT_CONFIG;
    if (!slug) {
      console.error('Error: Set CLIENT_CONFIG=<slug> or CLIENT_CONFIG_PATH=<abs-path>');
      process.exit(1);
    }
    configPath = join(__dirname, 'clients', slug, 'config.json');
  }

  if (!existsSync(configPath)) {
    console.error(`Error: Config not found at ${configPath}`);
    process.exit(1);
  }

  // Load .env from config directory, then fallback to repo root
  const configDir = dirname(configPath);
  for (const envDir of [configDir, join(__dirname, '..', '..', '..')]) {
    const envFile = join(envDir, '.env');
    if (existsSync(envFile)) {
      readFileSync(envFile, 'utf8').split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0 && !line.trim().startsWith('#')) {
          const k = line.slice(0, eq).trim();
          const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          if (k && !process.env[k]) process.env[k] = v;
        }
      });
      break;
    }
  }

  try {
    return JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error(`Error: Could not parse config at ${configPath}: ${err.message}`);
    process.exit(1);
  }
}

// ─── Slug helper ──────────────────────────────────────────────────────────────
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
function buildFrontMatter({ title, date, publishTime, slug, category, keyword, excerpt, draft, faq, author }) {
  const tags = buildTags(category, keyword);
  let fm = `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: "${date}"\npublishTime: "${publishTime}"\nslug: "${slug}"\ncategory: "${category}"\ntags: [${tags.map(t => `"${t}"`).join(', ')}]\nexcerpt: "${excerpt.replace(/"/g, '\\"').slice(0, 160)}"\nauthor: "${author}"\ndraft: ${draft}`;
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
  const tags = new Set([category]);
  if (keyword) {
    keyword.split(/\s+/).filter(w => w.length > 4).slice(0, 3).forEach(w => {
      const word = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      tags.add(word);
    });
  }
  return [...tags].slice(0, 6);
}

// ─── Dynamic system prompt from client config ─────────────────────────────────
function buildSystemPrompt(config) {
  const { client, brand, content } = config;
  const services = Array.isArray(brand.services) ? brand.services.join(', ') : brand.services;
  const pillars  = Array.isArray(content.contentPillars) ? content.contentPillars.map((p, i) => `${i + 1}. ${p}`).join('\n') : '';
  const categories = Array.isArray(content.categories) ? content.categories.join(', ') : '';

  return `You are the senior content strategist for ${client.businessName}, ${brand.niche ? `a ${brand.niche}` : `a ${brand.industry} business`} based in ${brand.city}. Your job is to write blog posts that rank on Google, get cited by AI assistants, and bring new customers to ${client.businessName}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUSINESS IDENTITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Business: ${client.businessName}
Website: ${client.website}
Location: ${brand.city}${brand.state ? ', ' + brand.state : ''}
Industry: ${brand.industry}
${brand.niche ? `Niche: ${brand.niche}` : ''}

SERVICES / OFFERINGS (weave these naturally into posts):
${services}

TARGET AUDIENCE:
${brand.targetAudience}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VOICE & TONE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${brand.voiceTone}
${Array.isArray(brand.voiceWords) ? `Voice words: ${brand.voiceWords.join(', ')}` : ''}

Writing rules:
- Speak directly to ${brand.targetAudience}
- Local and specific — mention ${brand.city} and local context naturally 5–8 times throughout
- Practical over theoretical — every paragraph has something actionable
- Paragraphs: 2–3 sentences max. No walls of text.
- Reading level: 8th grade. Clear, direct, accessible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT PILLARS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${pillars}

BLOG CATEGORIES: ${categories}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTENT STRUCTURE (follow exactly)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. OPENING HOOK (first 100 words): grab the reader, include primary keyword, speak directly to the target audience's pain or desire. No fluff.
2. 4–6 H2 SECTIONS: each answers a real search question. Within each: 2–3 short paragraphs + bullet list or numbered steps.
3. BUSINESS MENTION: mention "${client.businessName}" naturally at least 3 times. At least once reference a specific offering.
4. CLOSING + CTA: strong close, direct readers to ${brand.ctaUrl} — "${brand.ctaText}".
5. FAQ SECTION (## Frequently Asked Questions): 3–5 Q&A pairs in this exact format:
   **Q: Question here?**
   A: Direct, definitive answer.
6. Use ## H2 headers that are real Google searches for this industry in ${brand.city}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WRITING RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Target length: 1,500–2,000 words
- Use bullet points and numbered steps liberally
- Do NOT fabricate statistics — use qualitative claims and logical reasoning
- Make every H2 a real question the target audience would search on Google
- DEPTH: Go deep. Each section should actually teach something useful
- SPECIFICITY: Use specific numbers, timelines, examples
- STORYTELLING: Use one real-world scenario or mini story per post (composite/hypothetical, labeled as such)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AI SEARCH OPTIMIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Write posts that AI assistants (ChatGPT, Perplexity, Google AI Overviews) will cite directly.
- Use entity language: "${client.businessName} is..." / "${brand.city} customers can..."
- FAQ answers must be direct, quotable, and self-contained
- H2 headers should read like featured snippet questions
- Define terms where useful

OUTPUT: Return ONLY the markdown body. Start with the opening paragraph. NO front matter. NO H1 title.`;
}

function buildUserPrompt(config, topic, keyword, category) {
  const { client, brand } = config;
  return `Write the BEST blog post on the internet on this topic for ${client.businessName}.

Topic: ${topic}
Primary keyword: ${keyword || topic}
Category: ${category}
Location: ${brand.city}

This post needs to rank on Google AND get cited by AI assistants. Make it the most useful, specific, and actionable post a ${brand.targetAudience} has ever read on this topic.

Structure (follow exactly):
1. HOOK opening paragraph — pain point or bold statement. Contains the primary keyword in the first 2 sentences.
2. 5–6 ## H2 sections, each answering a real Google search question on this topic. Within each section: 2–3 paragraphs + a bullet list or numbered steps.
3. Use ### H3 subheadings inside longer sections when helpful.
4. One real-world scenario or mini case study embedded naturally (composite — do not attribute to a real person).
5. ## Frequently Asked Questions — 4–5 Q&As in this exact format:
   **Q: [Real question the target audience asks]?**
   A: [Direct, definitive, self-contained answer — 2–3 sentences max.]
6. Closing CTA — strong, direct. Send readers to: ${brand.ctaUrl} — "${brand.ctaText}"

Rules:
- 1,500–2,000 words total
- ${client.businessName} mentioned at least 3 times naturally
- ${brand.city} or local references mentioned 5–8 times
- Every section must teach something specific and actionable — no filler
- Return only the markdown body. No front matter. No H1 title.`;
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

const fromQueue    = args.includes('--from-queue');
const shouldPublish = args.includes('--publish');
const inCI         = !!process.env.CI;

let topic    = getArg('--topic');
let keyword  = getArg('--keyword');
let category = getArg('--category');

// ─── Queue management ─────────────────────────────────────────────────────────
function popFromQueue(queueFile) {
  if (!existsSync(queueFile)) {
    throw new Error(`Queue file not found: ${queueFile}`);
  }
  const queue = JSON.parse(readFileSync(queueFile, 'utf8'));
  if (!queue.queue || queue.queue.length === 0) {
    throw new Error('Topic queue is empty. Run blog-researcher-client.js to refill it.');
  }
  const next = queue.queue.shift();
  writeFileSync(queueFile, JSON.stringify(queue, null, 2));
  return next;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const config = loadConfig();
  const { client, brand, content, github } = config;

  // Resolve content dir relative to the clients/[slug]/ folder
  const slug = client.slug || process.env.CLIENT_CONFIG || 'client';
  const clientDir  = process.env.CLIENT_CONFIG_PATH
    ? dirname(process.env.CLIENT_CONFIG_PATH)
    : join(__dirname, 'clients', slug);

  const contentDir = join(clientDir, github.blogContentPath || 'content/blog');
  const queueFile  = join(clientDir, github.queuePath || 'content/blog/topics-queue.json');

  if (!existsSync(contentDir)) {
    mkdirSync(contentDir, { recursive: true });
    console.log(`Created content directory: ${contentDir}`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
    process.exit(1);
  }

  if (fromQueue) {
    const queued = popFromQueue(queueFile);
    topic    = queued.topic;
    keyword  = queued.keyword || queued.topic;
    category = queued.category || (content.categories?.[0] || 'General');
    console.log(`Popped from queue: "${topic}"`);
  }

  if (!topic) {
    console.error('Error: --topic "..." is required (or use --from-queue)');
    process.exit(1);
  }

  if (!keyword)  keyword  = topic;
  if (!category) category = content.categories?.[0] || 'General';

  console.log(`\nClient: ${client.businessName}`);
  console.log(`Generating post: "${topic}"`);
  console.log(`Keyword: ${keyword} | Category: ${category}\n`);

  const anthropicClient = new Anthropic({ apiKey });

  const message = await anthropicClient.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 8000,
    system: buildSystemPrompt(config),
    messages: [{ role: 'user', content: buildUserPrompt(config, topic, keyword, category) }],
  });

  const body = message.content[0].text;
  console.log(`Generated ${body.split(/\s+/).length} words.`);

  const faqs = extractFaqs(body);
  const now  = new Date();
  const dateStr     = now.toISOString().split('T')[0];
  const publishTime = now.toTimeString().slice(0, 5);
  const postSlug    = makeSlug(topic);
  const filename    = `${dateStr}-${postSlug}.md`;
  const filepath    = join(contentDir, filename);

  const excerpt = body
    .split('\n')
    .map(l => l.trim())
    .find(l => l && !l.startsWith('#') && !l.startsWith('*') && l.length > 40) || topic;

  const authorName = brand.authorName || client.businessName;

  const frontMatter = buildFrontMatter({
    title: topic,
    date: dateStr,
    publishTime,
    slug: postSlug,
    category,
    keyword,
    excerpt,
    draft: !shouldPublish,
    faq: faqs,
    author: authorName,
  });

  writeFileSync(filepath, frontMatter + '\n\n' + body);
  console.log(`\nWritten: ${filepath}`);
  console.log(`Status: ${shouldPublish ? 'PUBLISHED (draft: false)' : 'DRAFT'}`);
  if (faqs.length > 0) console.log(`FAQs extracted: ${faqs.length}`);

  if (shouldPublish && !inCI && github.repo) {
    console.log('\nPushing to GitHub...');
    try {
      const repoRoot = join(clientDir, '..', '..', '..'); // adjust if needed
      const commitMsg = `auto-blog [${slug}]: ${topic.slice(0, 60)}`;
      execSync(
        `git add "${filepath}" && git commit -m "${commitMsg.replace(/"/g, "'")}" && git push`,
        { cwd: repoRoot, stdio: 'inherit' }
      );
      console.log('Pushed.');
    } catch {
      console.error('Git push failed — post saved locally. Push manually.');
    }
  }

  console.log(`\nDone. Post: ${filename}`);
}

main().catch(err => {
  console.error('blog-writer-client error:', err.message);
  process.exit(1);
});
