// description-gen.js — Claude AI Platform Caption Generator
// Crown Media Group | All Glory to Jesus Global LLC
// ESM module — imported by CRM server.js for /api/video-service/generate-descriptions
//
// Generates platform-optimized captions for: Instagram, TikTok, Facebook, YouTube, X, Threads
// Model: claude-sonnet-4-6 | Philippians 4:8 filter applied

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

// ── Supabase REST helper ──────────────────────────────────────
async function supabaseInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase insert failed: ${err}`);
  }
  return res.json();
}

async function supabaseQuery(table, filters = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
  return res.json();
}

async function supabaseDelete(table, eq) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${eq}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=minimal',
    },
  });
  return res.ok;
}

// ── Philippians 4:8 content filter ──────────────────────────
const PHIL_4_8_FILTER = `
Every caption must pass the Philippians 4:8 content filter:
- TRUE: No false claims, inflated stats, deceptive marketing
- HONORABLE: No clickbait, no shame-based marketing, no degrading language
- RIGHT: Would Jesus approve? Aligns with God's standards
- PURE: No sexual innuendo, crude humor, or worldly manipulation
- LOVELY: Builds people up, brings hope and genuine value
- REPUTABLE: Would the CEO be proud showing this to his pastor?
- EXCELLENT: Best quality possible — not mediocre or rushed
- PRAISEWORTHY: Can the team say "All glory to Jesus" about this?`;

// ── Platform prompt specs ─────────────────────────────────────
const PLATFORM_SPECS = `
PLATFORM REQUIREMENTS (return exact JSON keys shown):

instagram:
- caption: 2-3 punchy sentences, warm + bold tone, ends with CTA
- hashtags: 20 targeted hashtags as a single string (space-separated, each starting with #)
- cta: specific CTA text (e.g. "Link in bio to order now")
- platform_title: null

tiktok:
- caption: First 5 words must hook immediately (curiosity or bold claim). 2-3 short sentences total.
- hashtags: 5 trending hashtags as string
- cta: short punchy CTA
- platform_title: Hook-first TikTok title (under 60 chars)

facebook:
- caption: Warm, community-centered, 2-3 paragraphs. End with a question to drive comments.
- hashtags: 5-8 hashtags as string
- cta: conversational CTA
- platform_title: null

youtube:
- caption: SEO-optimized description, 3-4 sentences with keywords naturally woven in. Include channel CTA.
- hashtags: 15 tags as comma-separated string (no # symbol)
- cta: Subscribe/comment CTA
- platform_title: SEO-optimized title, under 60 characters

x:
- caption: Under 240 characters. Punchy, opinionated, scroll-stopping first line.
- hashtags: 2-3 hashtags as string
- cta: Short direct CTA or question
- platform_title: null

threads:
- caption: Conversational, behind-the-scenes feel, 2-3 short sentences. Authentic, not polished.
- hashtags: 3-5 hashtags as string
- cta: soft CTA or question
- platform_title: null`;

// ── Main export ───────────────────────────────────────────────
/**
 * Generate platform captions and save to video_platform_posts
 * @param {string} projectId - UUID of video_projects row
 * @returns {object[]} - inserted video_platform_posts rows
 */
export async function generateDescriptions(projectId) {
  // Fetch project details
  const [project] = await supabaseQuery('video_projects', `id=eq.${projectId}&select=*`);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const platforms = project.target_platforms?.length > 0
    ? project.target_platforms
    : ['instagram', 'tiktok', 'facebook'];

  // Delete any existing posts for this project (regeneration)
  await supabaseDelete('video_platform_posts', `project_id=eq.${projectId}`);

  // Build prompt
  const systemPrompt = `You are a faith-driven social media strategist for Crown Media Group,
an AI-powered marketing agency in Columbia, SC. You write platform-native content that
drives real engagement. Your tone is bold, direct, warm, and authentic — never corporate.

${PHIL_4_8_FILTER}

Return ONLY valid JSON. No markdown, no explanation, no code blocks. Just the JSON object.`;

  const userPrompt = `Create platform-optimized social media captions for:

Business: ${project.business_name}
Client: ${project.client_name}
Video Type: ${project.video_type || 'short-form video'}
Video Title/Topic: ${project.project_title || 'not specified'}
Notes: ${project.notes || 'none'}
Platforms needed: ${platforms.join(', ')}

${PLATFORM_SPECS}

Return a JSON object with one key per platform. Example structure:
{
  "instagram": { "caption": "...", "hashtags": "#tag1 #tag2 ...", "cta": "...", "platform_title": null },
  "tiktok": { "caption": "...", "hashtags": "#tag1 #tag2", "cta": "...", "platform_title": "..." },
  ...
}

Only include keys for these platforms: ${platforms.join(', ')}`;

  // Call Claude
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const rawText = response.content[0].text.trim();

  // Parse JSON — handle edge case where Claude wraps in ```json
  let captionData;
  try {
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    captionData = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new Error(`Claude returned invalid JSON: ${rawText.substring(0, 200)}`);
  }

  // Build rows to insert
  const rows = platforms
    .filter(platform => captionData[platform])
    .map(platform => {
      const data = captionData[platform];
      return {
        project_id: projectId,
        platform,
        caption: data.caption || '',
        hashtags: data.hashtags || null,
        platform_title: data.platform_title || null,
        cta_text: data.cta || null,
        status: 'draft',
        ai_model: 'claude-sonnet-4-6',
        generation_prompt: `Business: ${project.business_name}, Type: ${project.video_type}`,
      };
    });

  if (rows.length === 0) throw new Error('No valid platform captions generated');

  // Insert into Supabase
  const inserted = await supabaseInsert('video_platform_posts', rows);

  // Update project status to 'approved' if it was in ready_review
  if (project.status === 'ready_review' || project.status === 'uploaded') {
    await fetch(`${SUPABASE_URL}/rest/v1/video_projects?id=eq.${projectId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'approved', approved_at: new Date().toISOString() }),
    });
  }

  console.log(`[VIDEO] Generated ${rows.length} captions for project ${projectId} (${project.client_name})`);
  return inserted;
}

// ── CLI usage: node description-gen.js <project_id> ──────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('Usage: node description-gen.js <project_id>');
    process.exit(1);
  }
  generateDescriptions(projectId)
    .then(rows => {
      console.log(`Generated ${rows.length} captions:`);
      rows.forEach(r => console.log(`  [${r.platform}] ${r.caption?.substring(0, 60)}...`));
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
