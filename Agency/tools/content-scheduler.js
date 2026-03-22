/**
 * content-scheduler.js — Schedule social posts for autonomous publishing
 * Crown Media Group | Works with standalone-runner.js for 24/7 execution
 *
 * Usage:
 *   node Agency/tools/content-scheduler.js add --platform instagram --caption "text" --time "2026-03-22 09:00" [--image path]
 *   node Agency/tools/content-scheduler.js list         ← show queued posts
 *   node Agency/tools/content-scheduler.js cancel <id>
 *   node Agency/tools/content-scheduler.js history      ← sent posts
 *   node Agency/tools/content-scheduler.js run          ← manually trigger due posts (standalone-runner calls this)
 *
 * Queue file: Agency/ops/content-queue.json
 * Executed by: standalone-runner.js every 60s (add "check-schedule" to its poll)
 *
 * Platforms: instagram | facebook | x | tiktok | all
 */

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const ROOT       = path.join(__dirname, '../..');
const QUEUE_FILE = path.join(__dirname, '../ops/content-queue.json');
const SOCIAL_POST = path.join(__dirname, 'social-post.js');

// ── Queue helpers ─────────────────────────────────────────────────────────────
function loadQueue() {
  if (fs.existsSync(QUEUE_FILE)) {
    try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch {}
  }
  return [];
}

function saveQueue(queue) {
  const dir = path.dirname(QUEUE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function nextId(queue) {
  if (!queue.length) return 'post_001';
  const nums = queue.map(p => parseInt((p.id || '0').replace(/\D/g, '')) || 0);
  return `post_${String(Math.max(...nums) + 1).padStart(3, '0')}`;
}

function parseTime(timeStr) {
  // Accept: "2026-03-22 09:00", "2026-03-22T09:00", "2026-03-22 09:00:00"
  const normalized = timeStr.replace(' ', 'T');
  const d = new Date(normalized);
  if (isNaN(d.getTime())) throw new Error(`Invalid time format: "${timeStr}". Use "YYYY-MM-DD HH:MM"`);
  return d.toISOString();
}

// ── Format helpers ────────────────────────────────────────────────────────────
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const GRAY  = '\x1b[90m';

function pad(str, len) {
  const s = String(str || '');
  return s.length >= len ? s.slice(0, len - 1) + '…' : s + ' '.repeat(len - s.length);
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function printQueue(posts, title = 'SCHEDULED POSTS') {
  if (!posts.length) { console.log(`\nNo ${title.toLowerCase()} found.\n`); return; }
  console.log(`\n${BOLD}${title} (${posts.length})${RESET}`);
  console.log('─'.repeat(90));
  console.log(BOLD + pad('ID', 12) + pad('PLATFORM', 14) + pad('SCHEDULED', 22) + pad('STATUS', 12) + 'CAPTION' + RESET);
  console.log('─'.repeat(90));
  for (const p of posts) {
    const statusColor = p.status === 'sent' ? GREEN : p.status === 'failed' ? '\x1b[31m' : YELLOW;
    console.log(
      pad(p.id, 12) +
      pad(p.platform, 14) +
      pad(formatTime(p.scheduled_at), 22) +
      statusColor + pad(p.status, 12) + RESET +
      (p.caption || '').slice(0, 40)
    );
  }
  console.log('');
}

// ── Commands ──────────────────────────────────────────────────────────────────
function cmdAdd(flags) {
  const platform = flags['platform'];
  const caption  = flags['caption'];
  const time     = flags['time'];
  const image    = flags['image'] || null;
  const video    = flags['video'] || null;

  if (!platform) { console.error('ERROR: --platform required'); process.exit(1); }
  if (!caption)  { console.error('ERROR: --caption required');  process.exit(1); }
  if (!time)     { console.error('ERROR: --time required (e.g. "2026-03-22 09:00")'); process.exit(1); }

  let scheduledAt;
  try { scheduledAt = parseTime(time); }
  catch (e) { console.error(e.message); process.exit(1); }

  const queue = loadQueue();
  const post = {
    id:           nextId(queue),
    platform,
    caption,
    image,
    video,
    scheduled_at: scheduledAt,
    status:       'queued',
    created_at:   new Date().toISOString(),
  };

  queue.push(post);
  saveQueue(queue);

  console.log(`\n${GREEN}Scheduled!${RESET}`);
  console.log(`  ID:        ${post.id}`);
  console.log(`  Platform:  ${post.platform}`);
  console.log(`  Time:      ${formatTime(post.scheduled_at)}`);
  console.log(`  Caption:   ${post.caption.slice(0, 60)}${post.caption.length > 60 ? '...' : ''}\n`);
  console.log(`${GRAY}standalone-runner.js will fire this automatically when the time comes.${RESET}\n`);
}

function cmdList() {
  const queue = loadQueue();
  const pending = queue.filter(p => p.status === 'queued');
  printQueue(pending, 'SCHEDULED POSTS');
}

function cmdHistory() {
  const queue = loadQueue();
  const done = queue.filter(p => p.status === 'sent' || p.status === 'failed');
  printQueue(done.reverse(), 'POST HISTORY');
}

function cmdCancel(args) {
  const id = args[0];
  if (!id) { console.error('ERROR: Provide post ID to cancel'); process.exit(1); }

  const queue = loadQueue();
  const idx = queue.findIndex(p => p.id === id);
  if (idx === -1) { console.error(`Post ${id} not found`); process.exit(1); }

  const post = queue[idx];
  if (post.status !== 'queued') {
    console.error(`Cannot cancel — post is already "${post.status}"`);
    process.exit(1);
  }

  queue[idx].status = 'cancelled';
  queue[idx].updated_at = new Date().toISOString();
  saveQueue(queue);
  console.log(`\nPost ${id} cancelled.\n`);
}

function cmdRun(dryRun = false) {
  const queue = loadQueue();
  const now   = new Date();
  const due   = queue.filter(p => p.status === 'queued' && new Date(p.scheduled_at) <= now);

  if (!due.length) {
    console.log(`[SCHEDULER] No posts due at ${now.toISOString()}`);
    return;
  }

  console.log(`[SCHEDULER] ${due.length} post(s) due — firing...`);

  for (const post of due) {
    const idx = queue.findIndex(p => p.id === post.id);
    const args = [
      `node "${SOCIAL_POST}"`,
      `--platform ${post.platform}`,
      `--caption "${post.caption.replace(/"/g, '\\"')}"`,
    ];
    if (post.image) args.push(`--image "${post.image}"`);
    if (post.video) args.push(`--video "${post.video}"`);
    if (dryRun)     args.push('--dry-run');

    const cmd = args.join(' ');
    console.log(`[SCHEDULER] Firing: ${post.id} → ${post.platform}`);

    try {
      const out = execSync(cmd, { cwd: ROOT, shell: 'bash', timeout: 120000, encoding: 'utf8' });
      console.log(out);
      queue[idx].status     = dryRun ? 'dry_run' : 'sent';
      queue[idx].sent_at    = new Date().toISOString();
    } catch (e) {
      console.error(`[SCHEDULER] Failed: ${post.id} — ${e.message}`);
      queue[idx].status     = 'failed';
      queue[idx].error      = e.message;
      queue[idx].failed_at  = new Date().toISOString();
    }
  }

  saveQueue(queue);
  console.log(`[SCHEDULER] Done. ${due.length} post(s) processed.`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  const cmd  = argv[0];
  const args = [];
  const flags = {};

  for (let i = 1; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    } else {
      args.push(argv[i]);
    }
  }

  const dryRun = process.argv.includes('--dry-run') || flags['dry-run'] === true;

  if (!cmd) {
    console.log('Usage: node content-scheduler.js <add|list|cancel|history|run> [options]');
    console.log('\nCommands:');
    console.log('  add       --platform <platform> --caption "text" --time "YYYY-MM-DD HH:MM" [--image path]');
    console.log('  list      Show all queued posts');
    console.log('  cancel    <id>');
    console.log('  history   Show sent/failed posts');
    console.log('  run       Fire all due posts now (called by standalone-runner.js)');
    console.log('\nPlatforms: instagram | facebook | x | tiktok | all');
    process.exit(0);
  }

  switch (cmd) {
    case 'add':     cmdAdd(flags); break;
    case 'list':    cmdList(); break;
    case 'cancel':  cmdCancel(args); break;
    case 'history': cmdHistory(); break;
    case 'run':     cmdRun(dryRun); break;
    default:
      console.error(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

main();
