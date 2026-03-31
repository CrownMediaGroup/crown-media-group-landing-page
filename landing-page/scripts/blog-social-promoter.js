/**
 * blog-social-promoter.js
 * Crown Media Group — Auto-promote blog posts to social media
 *
 * Usage:
 *   node blog-social-promoter.js              — promote any unqueued posts
 *   node blog-social-promoter.js --dry-run    — preview without writing
 *   node blog-social-promoter.js --force      — re-queue all posts (ignore log)
 *
 * After node build-blog.cjs, run: node blog-social-promoter.js
 */

const fs   = require('fs');
const path = require('path');
const matter = require('gray-matter');

// ── Config ────────────────────────────────────────────────────────────────────
const CONTENT_DIR   = path.join(__dirname, '../content/blog');
const QUEUE_FILE    = path.join(__dirname, '../../Agency/ops/content-queue.json');
const LOG_FILE      = path.join(__dirname, '../../Agency/ops/blog-promotion-log.json');
const SITE_URL      = 'https://crownmediagroup.co/blog';

const DRY_RUN       = process.argv.includes('--dry-run');
const FORCE         = process.argv.includes('--force');

// Best posting times (24h format, day agnostic — picks next available slot)
const BEST_TIMES    = ['09:00', '11:00', '17:00'];
const PLATFORMS     = ['x', 'facebook', 'instagram', 'linkedin'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadJson(file, fallback) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  }
  return fallback;
}

function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nextPostTime(existingQueue) {
  const now = new Date();
  const usedTimes = new Set(existingQueue.map(e => e.scheduledFor));

  // Find next available slot starting from tomorrow morning
  for (let dayOffset = 1; dayOffset <= 14; dayOffset++) {
    for (const t of BEST_TIMES) {
      const [h, m] = t.split(':').map(Number);
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + dayOffset);
      candidate.setHours(h, m, 0, 0);
      const iso = candidate.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
      if (!usedTimes.has(iso)) return iso;
    }
  }
  return null;
}

// ── Platform copy generators ──────────────────────────────────────────────────
function generateCopy(post, platform, url) {
  const title   = post.title;
  const excerpt = (post.excerpt || '').slice(0, 120).replace(/\s\S*$/, '') + '...';
  const tags    = (post.tags || []).slice(0, 4).map(t => '#' + t.replace(/\s+/g, '')).join(' ');
  const cat     = (post.category || '').toUpperCase();

  switch (platform) {
    case 'x':
      return `${title}\n\n${excerpt}\n\n${url}\n\n${tags} #ColumbiaScBusiness #CrownMediaGroup`.slice(0, 280);

    case 'facebook':
      return `${title}\n\n${post.excerpt || excerpt}\n\nRead the full article: ${url}\n\n${tags}`;

    case 'instagram':
      return `${title}\n\n${excerpt}\n\nFull article — link in bio.\n\n${tags} #ColumbiaScBusiness #AIMarketing #CrownMediaGroup #FaithAndBusiness`;

    case 'linkedin':
      return `New on the Crown Media Group blog:\n\n${title}\n\n${post.excerpt || excerpt}\n\nRead it here: ${url}\n\n${tags} #Marketing #SmallBusiness #ColumbiaScBusiness`;

    default:
      return `${title} — ${url}`;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
function run() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('No content/blog directory found.');
    return;
  }

  const log   = FORCE ? {} : loadJson(LOG_FILE, {});
  const queue = loadJson(QUEUE_FILE, []);
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));

  let added = 0;

  for (const file of files) {
    const raw  = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { data } = matter(raw);
    if (data.draft) continue;

    const slug = data.slug || file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const url  = `${SITE_URL}/${slug}/`;

    for (const platform of PLATFORMS) {
      const logKey = `${slug}::${platform}`;
      if (log[logKey] && !FORCE) continue;

      const scheduledFor = nextPostTime(queue);
      if (!scheduledFor) {
        console.log('Queue full for next 14 days — stopping.');
        break;
      }

      const caption = generateCopy(data, platform, url);
      const entry = {
        id: `blog-${slug}-${platform}-${Date.now()}`,
        platform,
        caption,
        scheduledFor,
        status: 'queued',
        source: 'blog-promoter',
        postSlug: slug,
        createdAt: new Date().toISOString(),
      };

      if (DRY_RUN) {
        console.log(`\n[DRY RUN] ${platform.toUpperCase()} @ ${scheduledFor}`);
        console.log(caption.slice(0, 120) + (caption.length > 120 ? '...' : ''));
      } else {
        queue.push(entry);
        log[logKey] = { scheduledFor, queuedAt: new Date().toISOString() };
      }
      added++;
    }
  }

  if (!DRY_RUN) {
    saveJson(QUEUE_FILE, queue);
    saveJson(LOG_FILE, log);
    console.log(`blog-social-promoter: ${added} posts queued across ${PLATFORMS.join(', ')}.`);
    console.log(`Queue: ${QUEUE_FILE}`);
  } else {
    console.log(`\n[DRY RUN] Would queue ${added} posts. Run without --dry-run to commit.`);
  }
}

run();
