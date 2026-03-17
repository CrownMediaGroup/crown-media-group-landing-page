const fs = require('fs');
const path = require('path');

const QUEUE = path.join(__dirname, '../../Agency/ops/notes/DIRECTIVE-QUEUE.md');
const DONE = path.join(__dirname, '../../Agency/ops/notes/DIRECTIVE-DONE.md');
const LOG = path.join(__dirname, '../../Agency/ops/notes/CC-LATEST-REPORT.md');

let lastProcessed = '';

function checkQueue() {
  try {
    if (!fs.existsSync(QUEUE)) return;
    const content = fs.readFileSync(QUEUE, 'utf8');
    if (content === lastProcessed || content.trim() === '') return;
    lastProcessed = content;
    console.log('[WATCHER] New directive detected — executing...');
    const timestamp = new Date().toISOString();
    fs.writeFileSync(LOG, `# Report\nDirective received: ${timestamp}\n\nExecuting...\n`);
    fs.writeFileSync(DONE, content);
    fs.writeFileSync(QUEUE, '');
    console.log('[WATCHER] Directive logged. Claude Code will now execute it.');
  } catch(e) {
    console.error('[WATCHER] Error:', e.message);
  }
}

console.log('[WATCHER] Started — polling every 10 seconds for CC directives');
setInterval(checkQueue, 10000);
checkQueue();
