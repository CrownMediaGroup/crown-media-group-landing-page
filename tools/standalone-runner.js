/**
 * standalone-runner.js — 24/7 directive queue runner, independent of VS Code
 * Install as Windows Service: node tools/standalone-runner.js --install
 * Remove service:             node tools/standalone-runner.js --uninstall
 * Run directly (no service):  node tools/standalone-runner.js
 *
 * Deps: npm install node-windows (for service install only)
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT      = path.join(__dirname, '..');
const QUEUE     = path.join(ROOT, 'Agency/ops/notes/DIRECTIVE-QUEUE.md');
const DONE      = path.join(ROOT, 'Agency/ops/notes/DIRECTIVE-DONE.md');
const LOG       = path.join(ROOT, 'Agency/ops/notes/CC-LATEST-REPORT.md');
const DAILY     = path.join(ROOT, 'Agency/ops/notes/DAILY-LOG.md');
const SCHEDULER = path.join(ROOT, 'Agency/tools/content-scheduler.js');
const POLL      = 60000; // 60 seconds

let lastProcessed = '';

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(DAILY, line);
}

function writeReport(content) {
  fs.writeFileSync(LOG, content);
}

function execute(directive) {
  const ts = new Date().toISOString();
  const lines = directive.split('\n');
  const commands = lines
    .filter(l => l.trimStart().startsWith('EXEC:'))
    .map(l => l.replace(/^\s*EXEC:\s*/, '').trim());

  if (commands.length === 0) {
    writeReport(`# Runner Report — ${ts}\n\nDirective received. No EXEC: lines found.\n\nDirective:\n\`\`\`\n${directive}\n\`\`\`\n\nAWAITING: NEXT DIRECTIVE FROM CC\n`);
    log(`Directive received — no EXEC lines`);
    return;
  }

  let report = `# Runner Report — ${ts}\n\n${commands.length} command(s) executed.\n\n`;

  for (const cmd of commands) {
    log(`EXEC: ${cmd}`);
    report += `## EXEC: ${cmd}\n\`\`\`\n`;
    try {
      const out = execSync(cmd, {
        cwd: ROOT,
        timeout: 60000,
        encoding: 'utf8'
      });
      report += out || '(no output)\n';
    } catch (e) {
      report += `ERROR: ${e.message}\n${e.stdout || ''}${e.stderr || ''}\n`;
      log(`ERROR in command: ${e.message}`);
    }
    report += '```\n\n';
  }

  report += `AWAITING: NEXT DIRECTIVE FROM CC\n`;
  writeReport(report);
  log(`${commands.length} command(s) complete. Report written.`);
}

function checkQueue() {
  try {
    if (!fs.existsSync(QUEUE)) return;
    const content = fs.readFileSync(QUEUE, 'utf8').trim();
    if (!content || content === lastProcessed) return;

    lastProcessed = content;
    log('New directive detected — executing...');

    const done = fs.existsSync(DONE) ? fs.readFileSync(DONE, 'utf8') + '\n\n---\n\n' : '';
    fs.writeFileSync(DONE, done + content);
    fs.writeFileSync(QUEUE, '');

    execute(content);
  } catch (e) {
    log(`Queue check error: ${e.message}`);
  }
}

// Windows Service install/uninstall
const arg = process.argv[2];

if (arg === '--install') {
  try {
    const Service = require('node-windows').Service;
    const svc = new Service({
      name: 'CrownMediaGroup-StandaloneRunner',
      description: 'Crown Media Group 24/7 directive queue runner',
      script: path.resolve(__filename),
      nodeOptions: []
    });
    svc.on('install', () => { svc.start(); console.log('Service installed + started.'); });
    svc.install();
  } catch (e) {
    console.error('Install failed. Run: npm install node-windows\n', e.message);
  }
  return;
}

if (arg === '--uninstall') {
  try {
    const Service = require('node-windows').Service;
    const svc = new Service({
      name: 'CrownMediaGroup-StandaloneRunner',
      script: path.resolve(__filename)
    });
    svc.on('uninstall', () => console.log('Service removed.'));
    svc.uninstall();
  } catch (e) {
    console.error('Uninstall failed:', e.message);
  }
  return;
}

// ── Content scheduler check ───────────────────────────────────────────────────
const VIDEO_PIPELINE = path.join(ROOT, 'landing-page/scripts/blog-to-video.js');
const VIDEO_LOG      = path.join(ROOT, 'landing-page/content/blog/.video-log.json');

function getProcessedSlugs() {
  try {
    if (!fs.existsSync(VIDEO_LOG)) return new Set();
    return new Set(Object.keys(JSON.parse(fs.readFileSync(VIDEO_LOG, 'utf8'))));
  } catch { return new Set(); }
}

function triggerVideoForNewPosts() {
  try {
    const BLOG_DIR = path.join(ROOT, 'landing-page/content/blog');
    if (!fs.existsSync(BLOG_DIR)) return;
    const processed = getProcessedSlugs();
    const posts = fs.readdirSync(BLOG_DIR)
      .filter(f => f.endsWith('.md') && f !== 'fallback-post.md')
      .map(f => ({ file: f, slug: f.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '') }))
      .filter(({ slug }) => !processed.has(slug));

    for (const { file } of posts) {
      log(`[Video Pipeline] New post detected: ${file} — spawning video pipeline...`);
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, [VIDEO_PIPELINE, '--file', file], {
        cwd: path.join(ROOT, 'landing-page'),
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
  } catch (e) {
    log(`[Video Pipeline] Trigger error: ${e.message}`);
  }
}

function checkScheduler() {
  try {
    if (!fs.existsSync(SCHEDULER)) return;
    execSync(`node "${SCHEDULER}" run`, {
      cwd: ROOT, timeout: 120000, encoding: 'utf8'
    });
  } catch (e) {
    // Suppress — scheduler logs its own output
  }
  // After scheduler runs, check for any new unprocessed blog posts
  triggerVideoForNewPosts();
}

// ── Topical map auto-refresh (daily at 3 AM) ─────────────────────────────────
const TOPICAL_MAP = path.join(ROOT, 'Agency/tools/topical-map.js');
const TOPICAL_LOG = path.join(ROOT, 'Agency/ops/topical-maps/.last-run');

function checkTopicalMap() {
  try {
    if (!fs.existsSync(TOPICAL_MAP)) return;
    const now = new Date();
    if (now.getHours() !== 3) return; // only at 3 AM
    const today = now.toISOString().slice(0, 10);
    const lastRun = fs.existsSync(TOPICAL_LOG) ? fs.readFileSync(TOPICAL_LOG, 'utf8').trim() : '';
    if (lastRun === today) return; // already ran today
    fs.writeFileSync(TOPICAL_LOG, today);
    log('[TopicalMap] Daily refresh starting...');
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [
      TOPICAL_MAP,
      '--topic', 'AI marketing agency Columbia SC small business',
      '--client', 'Crown Media Group',
      '--research'
    ], { cwd: ROOT, detached: true, stdio: 'ignore' });
    child.unref();
    log('[TopicalMap] Refresh spawned — map will appear in Agency/ops/topical-maps/');
  } catch (e) {
    log(`[TopicalMap] Error: ${e.message}`);
  }
}

// ── Video service auto-poster check (every 15 min = every 15th tick) ──────────
const VIDEO_POSTER = path.join(__dirname, '../tools/video-service/automation/auto-poster.js');
let videoPollTick = 0;
function checkVideoPoster() {
  videoPollTick++;
  if (videoPollTick % 15 !== 0) return; // every 15 minutes (15 × 60s ticks)
  if (!fs.existsSync(VIDEO_POSTER)) return;
  try {
    execSync(`node "${VIDEO_POSTER}" --check`, {
      cwd: ROOT, shell: 'bash', timeout: 120000, encoding: 'utf8'
    });
  } catch (e) {
    const detail = (e.stderr || e.stdout || e.message || '').toString().replace(/\n/g, ' ').substring(0, 200);
    log(`[VIDEO-POSTER] ERROR: ${detail}`);
  }
}

// Normal run
log('Standalone runner started — polling every 60s (directives + content scheduler)');
setInterval(() => { checkQueue(); checkScheduler(); checkTopicalMap(); /* checkVideoPoster() — DISABLED: WSL error */ }, POLL);
checkQueue();
checkScheduler();
// Video poster disabled — WSL environment error on this machine
// Re-enable when video-service is fixed: uncomment checkVideoPoster() above + setTimeout block below
// setTimeout(() => {
//   if (fs.existsSync(VIDEO_POSTER)) {
//     try {
//       execSync(`node "${VIDEO_POSTER}" --check`, { cwd: ROOT, shell: 'bash', timeout: 120000 });
//     } catch (e) { /* silent */ }
//   }
// }, 5000);
