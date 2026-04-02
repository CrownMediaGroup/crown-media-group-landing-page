/**
 * update-youtube-descriptions.js
 * Bulk-updates all existing YouTube video descriptions to the new optimized format.
 * Run: node scripts/video/update-youtube-descriptions.js
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../../');

// Load .env
const envPath = join(ROOT, '../.env');
try {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && v.length && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
    }
  }
} catch {}

// Video log
const videoLog = JSON.parse(
  readFileSync(join(ROOT, 'content/blog/.video-log.json'), 'utf8')
);

// Parse frontmatter from markdown
function parseFrontmatter(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return {};
    const fm = {};
    for (const line of match[1].split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      // Parse arrays
      if (val.startsWith('[')) {
        try { val = JSON.parse(val.replace(/'/g, '"')); } catch {}
      }
      fm[key] = val;
    }
    return fm;
  } catch {
    return {};
  }
}

// Find markdown file by slug
function findMarkdown(slug) {
  const files = readdirSync(join(ROOT, 'content/blog')).filter(f => f.endsWith('.md'));
  return files.find(f => f.includes(slug)) || null;
}

import { readdirSync } from 'fs';

// Build optimized description
function buildDescription(title, excerpt, slug, tags = []) {
  const hook = excerpt && excerpt.length > 10
    ? (excerpt.length > 200 ? excerpt.slice(0, 197) + '...' : excerpt)
    : `${title} — here's everything you need to know.`;

  const chapters = [
    '0:00 — Introduction',
    '0:30 — Why this matters for your business',
    '1:30 — The core strategy explained',
    '3:00 — Real-world examples',
    '4:30 — Step-by-step breakdown',
    '6:00 — Common mistakes to avoid',
    '7:30 — Action steps + next moves',
  ].join('\n');

  const evergreen = ['small business marketing', 'marketing strategy', 'grow your business online', 'digital marketing tips', 'AI marketing tools'];
  const allKeywords = [...new Set([
    ...(Array.isArray(tags) ? tags.map(t => t.toLowerCase()) : []),
    ...evergreen
  ])].slice(0, 8);

  const hashtagBase = Array.isArray(tags)
    ? tags.slice(0, 5).map(t => '#' + t.replace(/[\s\-]/g, '')).join(' ')
    : '';

  return `${hook}
📖 Read the full article → https://crownmediagroup.co/blog/${slug}/

⏱ CHAPTERS
${chapters}

━━━━━━━━━━━━━━━━━━━━━━━━

WHAT YOU'LL LEARN:
• Why most small businesses are losing customers to competitors who use AI
• The exact systems Crown Media Group uses to get results in 30 days
• How to apply this to your business — starting today

━━━━━━━━━━━━━━━━━━━━━━━━
🚀 WORK WITH CROWN MEDIA GROUP
We build AI-powered marketing systems for business owners who are done wasting time on marketing that doesn't convert.

✅ Social media content — done for you
✅ Paid ads that actually generate ROI
✅ AI video content — like this video
✅ Full brand strategy + execution

📅 Book your FREE strategy session → https://calendly.com/crownmediagroupco
🌐 Website → https://crownmediagroup.co
📧 Email → king@crownmediagroup.co

━━━━━━━━━━━━━━━━━━━━━━━━
🔔 SUBSCRIBE for weekly videos on AI marketing, business growth, and building an agency from scratch — faith-driven, results-focused.

KEYWORDS: ${allKeywords.join(' | ')}

${hashtagBase} #Marketing #AIMarketing #SmallBusiness #Entrepreneur #DigitalMarketing #BusinessGrowth #ContentMarketing #LocalBusiness`;
}

// YouTube auth
function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    'http://localhost:3001/callback'
  );
  oauth2.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return oauth2;
}

async function main() {
  const youtube = google.youtube({ version: 'v3', auth: getAuth() });
  const mdFiles = readdirSync(join(ROOT, 'content/blog')).filter(f => f.endsWith('.md'));

  let updated = 0;
  let skipped = 0;

  for (const [slug, entry] of Object.entries(videoLog)) {
    if (!entry.youtube) {
      console.log(`  SKIP ${slug} — no YouTube URL`);
      skipped++;
      continue;
    }

    const videoId = entry.youtube.split('v=')[1];
    const title = entry.title;

    // Find matching markdown
    const mdFile = mdFiles.find(f => f.includes(slug.slice(0, 30)));
    let excerpt = '';
    let tags = [];

    if (mdFile) {
      const fm = parseFrontmatter(join(ROOT, 'content/blog', mdFile));
      excerpt = fm.excerpt || fm.description || '';
      tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
    }

    const description = buildDescription(title, excerpt, slug, tags);

    try {
      // Get current snippet first (need categoryId etc)
      const current = await youtube.videos.list({
        part: ['snippet'],
        id: [videoId],
      });

      const snippet = current.data.items?.[0]?.snippet;
      if (!snippet) {
        console.log(`  SKIP ${slug} — video not found on channel`);
        skipped++;
        continue;
      }

      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: videoId,
          snippet: {
            title: snippet.title,
            description: description.slice(0, 5000),
            tags: [
              ...(Array.isArray(tags) ? tags : []),
              'small business', 'marketing', 'AI marketing', 'Crown Media Group',
              'digital marketing', 'entrepreneur', 'business growth',
            ].slice(0, 30),
            categoryId: snippet.categoryId,
            defaultLanguage: 'en',
          },
        },
      });

      console.log(`  ✓ Updated: ${title}`);
      console.log(`    → https://www.youtube.com/watch?v=${videoId}`);
      updated++;
    } catch (err) {
      console.error(`  ✗ Failed ${slug}: ${err.message}`);
    }
  }

  console.log(`\nDone. Updated: ${updated} | Skipped: ${skipped}`);
}

main().catch(console.error);
