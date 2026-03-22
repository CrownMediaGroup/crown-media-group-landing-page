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
        shell: 'bash',
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
function checkScheduler() {
  try {
    if (!fs.existsSync(SCHEDULER)) return;
    execSync(`node "${SCHEDULER}" run`, {
      cwd: ROOT, shell: 'bash', timeout: 120000, encoding: 'utf8'
    });
  } catch (e) {
    // Suppress — scheduler logs its own output
  }
}

// Normal run
log('Standalone runner started — polling every 60s (directives + content scheduler)');
setInterval(() => { checkQueue(); checkScheduler(); }, POLL);
checkQueue();
checkScheduler();
