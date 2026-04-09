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

// In-memory guard — tracks slugs already spawned this session to prevent re-firing
// even if the video pipeline crashes before writing to video-log.json
const _spawnedThisSession = new Set();

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
      .filter(({ slug }) => !processed.has(slug) && !_spawnedThisSession.has(slug));

    for (const { file, slug } of posts) {
      _spawnedThisSession.add(slug); // guard — never spawn this slug again this session
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

// ── Thor: Maintenance alert watchdog (every 30 min) ──────────────────────────
const CRM_DB_PATH = path.join(ROOT, 'tools/crm/crm.db');

function checkMaintenanceAlerts() {
  try {
    if (!fs.existsSync(CRM_DB_PATH)) return;
    // Use node:sqlite to query maintenance_requests
    let db;
    try {
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(CRM_DB_PATH);
    } catch { return; } // node:sqlite not available

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const oneDayAgo   = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const redTickets    = db.prepare("SELECT * FROM maintenance_requests WHERE traffic_light='red' AND created_at > ?").all(twoHoursAgo);
    const orangeTickets = db.prepare("SELECT * FROM maintenance_requests WHERE traffic_light='orange' AND created_at < ?").all(oneDayAgo);
    db.close();

    if (redTickets.length > 0) {
      log(`[Thor] 🔴 ${redTickets.length} RED maintenance ticket(s) need urgent attention`);
      const details = redTickets.map(r => `- ${r.client_name}: ${r.description.substring(0, 80)}`).join('\n');

      // Email via Resend
      const RESEND_KEY = process.env.RESEND_API_KEY;
      if (RESEND_KEY) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
          body: JSON.stringify({
            from: 'Crown Media Group <king@crownmediagroup.co>',
            to: 'king@crownmediagroup.co',
            subject: `🔴 RED ALERT: ${redTickets.length} urgent maintenance ticket(s) need you NOW`,
            html: `<p>🔴 <strong>URGENT: ${redTickets.length} maintenance request(s) need your immediate attention.</strong></p><ul>${redTickets.map(r => `<li><strong>${r.client_name}</strong>: ${r.description}</li>`).join('')}</ul><p><a href="https://crm.crownmediagroup.co/admin">View in CRM →</a></p>`,
            text: `RED ALERT\n\n${details}\n\nView: https://crm.crownmediagroup.co/admin`,
          }),
        }).catch(() => {});
      }

      // SMS via Twilio REST API (no package needed — direct HTTP)
      const SID  = process.env.TWILIO_ACCOUNT_SID;
      const AUTH = process.env.TWILIO_AUTH_TOKEN;
      const FROM = process.env.TWILIO_FROM_NUMBER;
      const TO   = process.env.TWILIO_ALERT_TO || process.env.KING_PHONE;
      if (SID && AUTH && FROM && TO) {
        const smsBody = `🔴 RED ALERT (Thor)\n${redTickets.length} urgent maintenance ticket(s):\n${redTickets.map(r => `${r.client_name}: ${r.description.substring(0,60)}`).join('\n')}\ncrm.crownmediagroup.co/admin`;
        fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${SID}:${AUTH}`).toString('base64'),
          },
          body: new URLSearchParams({ From: FROM, To: TO, Body: smsBody }).toString(),
        }).then(r => { if (r.ok) log('[Thor] SMS alert sent'); }).catch(() => {});
      }
    }
    if (orangeTickets.length > 0) {
      log(`[Thor] 🟠 ${orangeTickets.length} ORANGE ticket(s) unresolved for 24h+`);
    }
  } catch (e) { log(`[Thor] Alert check error: ${e.message}`); }
}

let _maintAlertTick = 0;
function checkMaintenanceAlertsThrottled() {
  _maintAlertTick++;
  if (_maintAlertTick % 30 !== 0) return; // every 30 ticks = 30 min
  checkMaintenanceAlerts();
}

// ── Black Widow: Nightly lead gen (midnight) ──────────────────────────────────
const LEAD_GEN       = path.join(ROOT, 'tools/nightly-lead-gen.js');
const LEAD_GEN_LOG   = path.join(ROOT, 'Agency/ops/notes/.lead-gen-last-run');

function checkLeadGen() {
  try {
    if (!fs.existsSync(LEAD_GEN)) return;
    const now = new Date();
    if (now.getHours() !== 0) return;
    const today = now.toISOString().slice(0, 10);
    const lastRun = fs.existsSync(LEAD_GEN_LOG) ? fs.readFileSync(LEAD_GEN_LOG, 'utf8').trim() : '';
    if (lastRun === today) return;
    log('[Black Widow] Nightly lead gen starting — hunting Columbia SC targets...');
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [LEAD_GEN], { cwd: ROOT, detached: true, stdio: 'ignore' });
    child.unref();
    log('[Black Widow] Intel mission deployed.');
  } catch (e) { log(`[Black Widow] Error: ${e.message}`); }
}

// ── Iron Man: Shatiea daily content (6 AM) ────────────────────────────────────
const SHATIEA_CONTENT    = path.join(ROOT, 'tools/shatiea-content.js');
const SHATIEA_CONTENT_LOG = path.join(ROOT, 'Agency/ops/content/.shatiea-last-run');

function checkShatiea() {
  try {
    if (!fs.existsSync(SHATIEA_CONTENT)) return;
    const now = new Date();
    if (now.getHours() !== 6) return;
    const today = now.toISOString().slice(0, 10);
    const lastRun = fs.existsSync(SHATIEA_CONTENT_LOG) ? fs.readFileSync(SHATIEA_CONTENT_LOG, 'utf8').trim() : '';
    if (lastRun === today) return;
    log('[Iron Man] Building Shatiea content suite — 5 pieces incoming...');
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [SHATIEA_CONTENT], { cwd: ROOT, detached: true, stdio: 'ignore' });
    child.unref();
    log('[Iron Man] Content build deployed.');
  } catch (e) { log(`[Iron Man] Error: ${e.message}`); }
}

// ── Iron Man Post: Fire Shatiea content to IG + FB (7 AM) ────────────────────
const SHATIEA_CONTENT_DIR = path.join(ROOT, 'Agency/ops/content');
const SOCIAL_POST_SCRIPT  = path.join(ROOT, 'Agency/tools/social-post.js');
const IRON_MAN_POST_LOG   = path.join(ROOT, 'Agency/ops/content/.iron-man-post-last-run');

function checkIronManPost() {
  try {
    if (!fs.existsSync(SOCIAL_POST_SCRIPT)) return;
    const now = new Date();
    if (now.getHours() !== 7) return;
    const today = now.toISOString().slice(0, 10);
    const lastRun = fs.existsSync(IRON_MAN_POST_LOG) ? fs.readFileSync(IRON_MAN_POST_LOG, 'utf8').trim() : '';
    if (lastRun === today) return;

    const contentFile = path.join(SHATIEA_CONTENT_DIR, `shatiea-${today}.md`);
    if (!fs.existsSync(contentFile)) {
      log('[Iron Man] Content file not ready yet — skipping social post (will retry)');
      return;
    }

    const md = fs.readFileSync(contentFile, 'utf8');

    // Parse IG caption
    const igMatch = md.match(/## Instagram Caption\s*([\s\S]*?)(?:---|\n## )/);
    const igCaption = igMatch ? igMatch[1].trim() : null;

    // Parse FB caption
    const fbMatch = md.match(/## Facebook Caption\s*([\s\S]*?)(?:---|\n## )/);
    const fbCaption = fbMatch ? fbMatch[1].trim() : null;

    if (!igCaption && !fbCaption) {
      log('[Iron Man] Could not parse captions from content file — skipping');
      return;
    }

    fs.writeFileSync(IRON_MAN_POST_LOG, today);
    log('[Iron Man] Firing Shatiea content to social platforms...');

    const { spawn } = require('child_process');

    if (igCaption) {
      const igChild = spawn(process.execPath, [
        SOCIAL_POST_SCRIPT,
        '--platform', 'instagram',
        '--caption', igCaption,
      ], { cwd: ROOT, detached: true, stdio: 'ignore' });
      igChild.unref();
      log('[Iron Man] Instagram post queued.');
    }

    if (fbCaption) {
      const fbChild = spawn(process.execPath, [
        SOCIAL_POST_SCRIPT,
        '--platform', 'facebook',
        '--caption', fbCaption,
      ], { cwd: ROOT, detached: true, stdio: 'ignore' });
      fbChild.unref();
      log('[Iron Man] Facebook post queued.');
    }

    log('[Iron Man] Content live — Shatiea is on the feed.');
  } catch (e) { log(`[Iron Man Post] Error: ${e.message}`); }
}

// ── Hawkeye: Cold outreach sequences (9 AM) ───────────────────────────────────
const OUTREACH     = path.join(ROOT, 'tools/outreach-sequence.js');
const OUTREACH_LOG = path.join(ROOT, 'Agency/ops/notes/.outreach-last-run');

function checkOutreach() {
  try {
    if (!fs.existsSync(OUTREACH)) return;
    const now = new Date();
    if (now.getHours() !== 9) return;
    const today = now.toISOString().slice(0, 10);
    const lastRun = fs.existsSync(OUTREACH_LOG) ? fs.readFileSync(OUTREACH_LOG, 'utf8').trim() : '';
    if (lastRun === today) return;
    log('[Hawkeye] Cold outreach sequencer — taking aim at today\'s targets...');
    const { spawn } = require('child_process');
    const child = spawn(process.execPath, [OUTREACH], { cwd: ROOT, detached: true, stdio: 'ignore' });
    child.unref();
    log('[Hawkeye] Shots fired.');
  } catch (e) { log(`[Hawkeye] Error: ${e.message}`); }
}

// ── Vision: LinkedIn personal brand post (11 AM) ─────────────────────────────
const LINKEDIN_CONTENT_DIR = path.join(ROOT, 'Agency/ops/content');
const VISION_LOG           = path.join(ROOT, 'Agency/ops/content/.vision-last-run');
const ANTHROPIC_KEY_VISION = process.env.ANTHROPIC_API_KEY;

async function generateLinkedInPost(today) {
  const key = ANTHROPIC_KEY_VISION || (() => {
    try {
      const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
      const m = env.match(/ANTHROPIC_API_KEY=(.+)/);
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
    } catch { return null; }
  })();
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const dayOfWeek = new Date(today).toLocaleDateString('en-US', { weekday: 'long' });

  // Try to pull Shatiea's content theme for today as inspiration
  let shatiea = '';
  const sFile = path.join(SHATIEA_CONTENT_DIR, `shatiea-${today}.md`);
  if (fs.existsSync(sFile)) {
    const raw = fs.readFileSync(sFile, 'utf8');
    const m = raw.match(/## Instagram Caption\s*([\s\S]*?)---/);
    if (m) shatiea = `\nContent theme from today's client work: ${m[1].trim().slice(0, 200)}`;
  }

  const prompt = `You are writing a LinkedIn post for David King (@mkdavidking), CEO of Crown Media Group — a faith-driven AI marketing agency in Columbia, SC.

Today is ${dayOfWeek}.${shatiea}

Write a single LinkedIn thought leadership post (150-250 words) that:
- Opens with a scroll-stopping insight or observation (no "I" as first word)
- Tells a micro-story OR shares a lesson from agency/AI marketing work
- Positions Crown Media Group as the go-to AI agency in Columbia SC
- Has a subtle faith undertone (never preachy)
- Ends with a direct question to drive comments
- Includes 3-5 relevant hashtags at the bottom

Return only the post text, no preamble.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.content?.[0]?.text || '').trim();
}

function checkVision() {
  try {
    const now = new Date();
    if (now.getHours() !== 11) return;
    const today = now.toISOString().slice(0, 10);
    const lastRun = fs.existsSync(VISION_LOG) ? fs.readFileSync(VISION_LOG, 'utf8').trim() : '';
    if (lastRun === today) return;
    fs.writeFileSync(VISION_LOG, today);
    log('[Vision] Generating King\'s LinkedIn post for today...');

    generateLinkedInPost(today).then(post => {
      const outFile = path.join(LINKEDIN_CONTENT_DIR, `linkedin-${today}.md`);
      const md = `# LinkedIn Post — ${today}\n\n${post}\n\n---\n_Generated by Vision agent — ${new Date().toISOString()}_\n`;
      fs.writeFileSync(outFile, md);
      log(`[Vision] LinkedIn post saved → Agency/ops/content/linkedin-${today}.md`);
      log('[Vision] Post ready — King can copy-paste or /screen to review.');
    }).catch(e => {
      log(`[Vision] Generation failed: ${e.message}`);
    });
  } catch (e) { log(`[Vision] Error: ${e.message}`); }
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

// ── Amplify Engine — content distribution queue check (8 AM) ─────────────────
const AMPLIFY_ENGINE = path.join(__dirname, 'amplify-engine.js');
const AMPLIFY_QUEUE  = path.join(ROOT, 'Agency/ops/amplify-queue.json');
const AMPLIFY_LOG    = path.join(ROOT, '.amplify-last-run');

function checkAmplify() {
  try {
    if (!fs.existsSync(AMPLIFY_ENGINE)) return;
    const now = new Date();
    if (now.getHours() !== 8) return; // only at 8 AM
    const today = now.toISOString().slice(0, 10);
    const lastRun = fs.existsSync(AMPLIFY_LOG) ? fs.readFileSync(AMPLIFY_LOG, 'utf8').trim() : '';
    if (lastRun === today) return;
    fs.writeFileSync(AMPLIFY_LOG, today);

    if (!fs.existsSync(AMPLIFY_QUEUE)) return;
    let queue = [];
    try { queue = JSON.parse(fs.readFileSync(AMPLIFY_QUEUE, 'utf8')); } catch { return; }
    const pending = queue.filter(j => j.status === 'pending' && j.date === today);
    if (!pending.length) { log('[Amplify] No pending jobs for today'); return; }

    log(`[Amplify] Processing ${pending.length} job(s) for today...`);
    const { spawn } = require('child_process');
    pending.forEach(job => {
      const child = spawn(process.execPath, [AMPLIFY_ENGINE, '--file', job.variantsFile], {
        cwd: ROOT, detached: true, stdio: 'ignore'
      });
      child.unref();
    });
    log('[Amplify] Jobs dispatched — variants will appear in Agency/ops/content/');
  } catch (e) { log(`[Amplify] Error: ${e.message}`); }
}

// Normal run
log('Standalone runner started — polling every 60s | Team: Black Widow (0AM) · Iron Man (6AM) · Iron Man Post (7AM) · Hawkeye (9AM) · Vision (11AM) · TopMap (3AM) · Thor (30min maintenance watch) · Amplify (8AM)');
setInterval(() => {
  checkQueue();
  checkScheduler();
  checkTopicalMap();
  checkLeadGen();                    // Black Widow — midnight
  checkShatiea();                    // Iron Man — 6 AM
  checkIronManPost();                // Iron Man Post — 7 AM (fire generated content to IG + FB)
  checkAmplify();                    // Amplify — 8 AM (content distribution queue)
  checkOutreach();                   // Hawkeye — 9 AM
  checkVision();                     // Vision — 11 AM (LinkedIn personal brand post)
  checkMaintenanceAlertsThrottled(); // Thor — every 30 min
  /* checkVideoPoster() — DISABLED: WSL error */
}, POLL);
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
