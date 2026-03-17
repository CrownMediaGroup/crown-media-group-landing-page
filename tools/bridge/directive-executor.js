const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const QUEUE = path.join(__dirname, '../../Agency/ops/notes/DIRECTIVE-QUEUE.md');
const DONE  = path.join(__dirname, '../../Agency/ops/notes/DIRECTIVE-DONE.md');
const LOG   = path.join(__dirname, '../../Agency/ops/notes/CC-LATEST-REPORT.md');

let lastProcessed = '';

function writeReport(content) {
  fs.writeFileSync(LOG, content);
}

function execute(directive) {
  const timestamp = new Date().toISOString();
  const lines = directive.split('\n');
  const commands = lines
    .filter(l => l.trimStart().startsWith('EXEC:'))
    .map(l => l.replace(/^\s*EXEC:\s*/, '').trim());

  if (commands.length === 0) {
    writeReport(`# CC Report — ${timestamp}\n\nDirective received but no EXEC: lines found.\n\nFull directive:\n\`\`\`\n${directive}\n\`\`\`\n`);
    return;
  }

  let report = `# CC Report — ${timestamp}\n\nDirective executed. ${commands.length} command(s).\n\n`;

  for (const cmd of commands) {
    report += `## EXEC: ${cmd}\n\`\`\`\n`;
    try {
      const out = execSync(cmd, {
        cwd: path.join(__dirname, '../..'),
        shell: 'bash',
        timeout: 30000,
        encoding: 'utf8'
      });
      report += out || '(no output)\n';
    } catch (e) {
      report += `ERROR: ${e.message}\nSTDOUT: ${e.stdout || ''}\nSTDERR: ${e.stderr || ''}\n`;
    }
    report += '```\n\n';
  }

  report += `AWAITING: NEXT DIRECTIVE FROM CC\n`;
  writeReport(report);
  console.log(`[EXECUTOR] ${commands.length} command(s) executed. Report written.`);
}

function checkQueue() {
  try {
    if (!fs.existsSync(QUEUE)) return;
    const content = fs.readFileSync(QUEUE, 'utf8').trim();
    if (!content || content === lastProcessed) return;

    lastProcessed = content;
    console.log('[EXECUTOR] New directive — executing...');

    // Archive
    fs.writeFileSync(DONE, content);
    fs.writeFileSync(QUEUE, '');

    execute(content);
  } catch (e) {
    console.error('[EXECUTOR] Error:', e.message);
  }
}

console.log('[EXECUTOR] Started — polling every 5 seconds');
setInterval(checkQueue, 5000);
checkQueue();
