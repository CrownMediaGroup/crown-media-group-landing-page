// ad-copy-generator.js — Crown Media Group
// Generates 20 Meta/Facebook ad copy variations using Gemini (free tier)
// Output: Agency/ops/ads/YYYY-MM-DD-batch.md
// Usage: node landing-page/scripts/ad-copy-generator.js [--service <service>]
//        node landing-page/scripts/ad-copy-generator.js --service "social media management"

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env ─────────────────────────────────────────────────────────────────
const rootEnv = join(__dirname, '../../.env');
if (existsSync(rootEnv)) {
  const lines = (await import('fs')).readFileSync(rootEnv, 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const TODAY   = new Date().toISOString().split('T')[0];
const ROOT    = join(__dirname, '../..');
const SERVICE = process.argv.indexOf('--service') !== -1
  ? process.argv[process.argv.indexOf('--service') + 1]
  : 'social media marketing';

// ── Gemini ────────────────────────────────────────────────────────────────────

async function gemini(prompt) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 2500, temperature: 0.85 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`[AdCopy] Generating 20 ad variations for: "${SERVICE}"`);

  const prompt = `You are a Meta/Facebook ads expert for Crown Media Group, a faith-driven AI marketing agency in Columbia SC.

Service: ${SERVICE}
Target: Columbia SC small business owners (restaurants, salons, bakeries, churches, health businesses, event planners)
Tone: Direct, confident, professional with optional faith undertone where natural
Brand: Crown Media Group | crownmediagroup.co

Generate 20 unique Facebook/Instagram ad copy variations. Each variation should have:
- PRIMARY TEXT (1-3 short sentences, max 125 chars for mobile) — the hook + value prop
- HEADLINE (max 40 chars) — the scroll-stopping line for the image card
- CTA (one of: Learn More, Get Quote, Book Now, Sign Up, Message Us)

Follow 2025 Meta best practices:
- Creative does the targeting — each variation targets a DIFFERENT pain point or audience type
- Variation types: pain-point, social proof, curiosity, fear-of-missing-out, faith/values, results-driven, question, comparison, urgency, founder story
- NO generic agency clichés ("take your business to the next level", "cutting-edge")
- Write like a real Columbia SC person talking to another Columbia SC person

Format EXACTLY like this, 20 times:
---
VARIATION 1 — [TYPE]
Primary: [text]
Headline: [text]
CTA: [button text]
---

No extra commentary. Just the 20 variations.`;

  const output = await gemini(prompt);

  const dir = join(ROOT, 'Agency/ops/ads');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filePath = join(dir, `${TODAY}-${SERVICE.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`);

  const md = `# Ad Copy Batch — ${TODAY}
**Service:** ${SERVICE}
**Platform:** Meta (Facebook + Instagram)
**Generated:** ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST
**Count:** 20 variations

---

${output}

---
*Crown Media Group | crownmediagroup.co*
*Add to Canva: Use these as text layers on branded creatives*
*Best practice: Test 4-6 at a time in Advantage+ campaigns with $5/day*
`;

  writeFileSync(filePath, md, 'utf8');
  console.log(`[AdCopy] Written to: ${filePath}`);
  console.log('[AdCopy] Done. Open the file or paste variations into Canva/Ads Manager.');
}

run().catch(e => { console.error('[AdCopy] FATAL:', e.message); process.exit(1); });
