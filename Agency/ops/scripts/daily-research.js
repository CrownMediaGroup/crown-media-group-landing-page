// daily-research.js — Crown Media Group
// Runs every weekday at 6AM EST via GitHub Actions
// 1. EXA search for AI marketing news
// 2. Gemini summarizes into 5 bullets
// 3. Writes to Agency/ops/daily-research/YYYY-MM-DD.md
// 4. Texts King the summary via Twilio

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '../../../..');
const TODAY     = new Date().toISOString().split('T')[0];

// ── EXA Search ────────────────────────────────────────────────────────────────

async function exaSearch(query, numResults = 5) {
  const key = process.env.EXA_API_KEY;
  if (!key) { console.warn('[Research] EXA_API_KEY not set — skipping web search'); return []; }

  const res = await fetch('https://api.exa.ai/search', {
    method:  'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      numResults,
      contents: { text: { maxCharacters: 800 } },
      useAutoprompt: true,
      type: 'neural',
      startPublishedDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });

  if (!res.ok) { console.warn('[Research] EXA error:', res.status, await res.text()); return []; }
  const data = await res.json();
  return (data.results || []).map(r => ({ title: r.title, url: r.url, snippet: r.text?.substring(0, 400) || '' }));
}

// ── Gemini Summarize ──────────────────────────────────────────────────────────

async function geminiSummarize(articles) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const articleText = articles.map((a, i) =>
    `${i + 1}. ${a.title}\n${a.snippet}\nURL: ${a.url}`
  ).join('\n\n');

  const prompt = `You are the research arm of Crown Media Group, a faith-driven AI marketing agency in Columbia SC.

Today is ${TODAY}. You found these articles about AI marketing trends:

${articleText}

Give me exactly 5 bullet points — one sentence each — covering:
1. Most important new AI tool or feature for marketing agencies
2. Key platform change (Instagram, Meta, YouTube, TikTok, Google) that affects our clients
3. Local/small business marketing insight
4. Something that gives Crown Media Group a competitive edge if we act now
5. One thing to AVOID or watch out for

Format: Start each bullet with "• " and keep it under 20 words. No preamble. No explanations. Just the 5 bullets.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'No summary generated.';
}

// ── Twilio SMS ────────────────────────────────────────────────────────────────

async function sendSMS(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from || !to) { console.warn('[Research] Twilio not configured — skipping SMS'); return; }

  const creds = Buffer.from(`${sid}:${token}`).toString('base64');
  const res   = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  });

  if (!res.ok) console.warn('[Research] SMS send error:', res.status, await res.text());
  else console.log('[Research] SMS sent to', to);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[Research] Starting daily research — ${TODAY}`);

  const queries = [
    'AI marketing tools for small businesses 2025 new features',
    'GoHighLevel competitors CRM marketing agency 2025',
    'Instagram Reels Facebook algorithm update 2025',
    'Columbia SC local business marketing trends',
  ];

  const allArticles = [];
  for (const q of queries) {
    const results = await exaSearch(q, 3);
    allArticles.push(...results);
    console.log(`[Research] "${q}" → ${results.length} results`);
  }

  const unique = [...new Map(allArticles.map(a => [a.url, a])).values()].slice(0, 12);
  console.log(`[Research] ${unique.length} unique articles found`);

  let summary = '';
  try {
    summary = await geminiSummarize(unique);
    console.log('[Research] Summary generated');
  } catch (e) {
    summary = `Error generating summary: ${e.message}`;
    console.error('[Research]', e.message);
  }

  // Write markdown file
  const dir = join(ROOT, 'Agency/ops/daily-research');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sources = unique.map(a => `- [${a.title}](${a.url})`).join('\n');
  const md = `# Daily Research — ${TODAY}

## AI Marketing Intelligence Brief

${summary}

---

## Sources (${unique.length} articles)

${sources}

---
*Generated by Crown Media Group auto-research system at 6AM EST*
*Queries: ${queries.map(q => `"${q}"`).join(', ')}*
`;

  const filePath = join(dir, `${TODAY}.md`);
  writeFileSync(filePath, md, 'utf8');
  console.log(`[Research] Written to ${filePath}`);

  // SMS King the summary
  const smsBody = `Crown Media Daily Intel — ${TODAY}\n\n${summary}\n\nFull report: Agency/ops/daily-research/${TODAY}.md`;
  await sendSMS(process.env.KING_PHONE, smsBody.substring(0, 1600));

  console.log('[Research] Done.');
}

run().catch(e => { console.error('[Research] FATAL:', e.message); process.exit(1); });
