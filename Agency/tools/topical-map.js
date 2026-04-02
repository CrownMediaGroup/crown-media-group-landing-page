#!/usr/bin/env node
/**
 * topical-map.js — AI Topical Authority Builder
 * Inspired by Kasra Dash's Claude keyword clustering workflow
 * Crown Media Group — use for own blog AND as client deliverable
 *
 * Usage:
 *   node Agency/tools/topical-map.js --topic "Columbia SC marketing agency"
 *   node Agency/tools/topical-map.js --client "Shatiea" --topic "faith-based juice business"
 *   node Agency/tools/topical-map.js --csv path/to/keywords.csv
 *   node Agency/tools/topical-map.js --topic "..." --research  (uses EXA to find competitor keywords first)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const EXA_KEY = process.env.EXA_API_KEY;

// ─── Parse args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const topic    = getArg('--topic') || 'Columbia SC social media marketing agency';
const client   = getArg('--client') || 'Crown Media Group';
const csvFile  = getArg('--csv');
const doResearch = args.includes('--research');
const outputDir = path.join(__dirname, '../ops/topical-maps');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// ─── Claude API ───────────────────────────────────────────────────────────────
function callClaude(prompt, maxTokens = 4000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.content?.[0]?.text || '');
        } catch (e) { reject(new Error('Parse error: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── EXA research: find competitor keywords ───────────────────────────────────
function exaSearch(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      query,
      numResults: 10,
      useAutoprompt: true,
      contents: { text: { maxCharacters: 3000 } }
    });

    const req = https.request({
      hostname: 'api.exa.ai',
      path: '/search',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': EXA_KEY,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ results: [] }); }
      });
    });
    req.on('error', () => resolve({ results: [] }));
    req.write(body);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[Topical Map] Building authority map for: ${client} — "${topic}"`);
  if (!ANTHROPIC_KEY) { console.error('  ERROR: ANTHROPIC_API_KEY missing from .env'); process.exit(1); }

  let keywords = '';

  // Load from CSV if provided
  if (csvFile && fs.existsSync(csvFile)) {
    keywords = fs.readFileSync(csvFile, 'utf8');
    console.log(`  Loaded CSV: ${keywords.split('\n').length} rows`);
  } else if (doResearch && EXA_KEY) {
    // Research competitor content to extract keyword universe
    console.log('  [EXA] Researching competitor content...');
    const [r1, r2, r3] = await Promise.all([
      exaSearch(`${topic} guide tips strategies`),
      exaSearch(`best ${topic} advice 2026`),
      exaSearch(`${topic} FAQ questions`),
    ]);
    const titles = [...(r1.results || []), ...(r2.results || []), ...(r3.results || [])]
      .map(r => r.title || '').filter(Boolean);
    const texts = [...(r1.results || []), ...(r2.results || []), ...(r3.results || [])]
      .map(r => r.text || '').filter(Boolean).join('\n');
    keywords = `COMPETITOR TITLES:\n${titles.join('\n')}\n\nCOMPETITOR CONTENT EXCERPTS:\n${texts.slice(0, 5000)}`;
    console.log(`  [EXA] Found ${titles.length} competitor pieces`);
  }

  // Build topical map using Claude
  console.log('  [Claude] Building topical authority map...');
  const prompt = `You are an expert content strategist building a topical authority map for a business.

CLIENT: ${client}
TOPIC/NICHE: ${topic}
${keywords ? `\nCOMPETITOR RESEARCH / KEYWORDS:\n${keywords.slice(0, 8000)}` : ''}

Build a complete topical authority map. Structure it as follows:

TOPICAL MAP for "${topic}"

OVERVIEW:
- Total content pieces needed: [number]
- Estimated months to full authority: [number]

SILOS (4-6 main topic clusters):
For each silo:
  SILO [N]: [Silo Name]
  Pillar Page: [Title] | URL: /[slug]/ | Intent: [informational/commercial/transactional]
  LSI Keywords: [comma-separated related keywords to include]

  Supporting Cluster Pages (3-5 each):
  - [Title] | URL: /[slug]/ | Funnel: [top/mid/bottom]
  - [Title] | URL: /[slug]/ | Funnel: [top/mid/bottom]

  Quick Wins (low competition, high value):
  - [Title] | Priority: HIGH

CANNIBALIZATION WARNINGS:
List any overlapping topics that should NOT be separate pages.

RECOMMENDED PUBLISHING ORDER (first 10 pieces):
1. [Title] — [reason it should be first]
2. [Title] — [reason]
...

INTERNAL LINKING MAP:
Describe which pages should link to which.

Be specific to the business. Use real keyword phrases people search. Columbia SC local business context where relevant.`;

  const map = await callClaude(prompt, 4000);

  // Save output
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${date}-${slug}.md`;
  const outPath = path.join(outputDir, filename);

  const content = `# Topical Authority Map
**Client:** ${client}
**Topic:** ${topic}
**Generated:** ${date}
**Tool:** topical-map.js (Crown Media Group)

---

${map}

---
*Generated with Claude Haiku + EXA research. Use this as your content roadmap.*
`;

  fs.writeFileSync(outPath, content);
  console.log(`\n  [DONE] Topical map saved: Agency/ops/topical-maps/${filename}`);
  console.log('\n' + '─'.repeat(60));
  console.log(map);
  console.log('─'.repeat(60));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
