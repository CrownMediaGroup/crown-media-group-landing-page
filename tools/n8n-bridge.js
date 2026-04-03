/**
 * n8n-bridge.js — HTTP bridge between n8n workflows and local CLI tools
 * Exposes Crown Media automation scripts as HTTP endpoints
 * Run: node tools/n8n-bridge.js
 * Listens: http://localhost:3456
 */

const http = require('http');
const { execSync } = require('child_process');
const path = require('path');

const PORT = 3456;
const ROOT = path.join(__dirname, '..');
const AGENCY = path.join(ROOT, 'Agency', 'tools');
const REPORTING = path.join(ROOT, 'tools', 'video-service', 'reporting');

function run(cmd) {
  try {
    const output = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000,
      env: { ...process.env }
    });
    return { ok: true, output: output.trim() };
  } catch (err) {
    return { ok: false, output: (err.stdout || '') + (err.stderr || '') + err.message };
  }
}

const ROUTES = {
  'GET /health': () => ({ status: 'ok', version: '1.0', time: new Date().toISOString() }),

  'GET /run-posts': () => run(`node "${path.join(AGENCY, 'content-scheduler.js')}" run`),

  'GET /followup': () => run(`node "${path.join(AGENCY, 'lead-tracker.js')}" followup`),

  'GET /stats': () => run(`node "${path.join(AGENCY, 'lead-tracker.js')}" stats`),

  'GET /monthly-report': () => run(`node "${path.join(REPORTING, 'monthly-report.js')}"`),

  'POST /schedule-post': (body) => {
    const { platform = 'all', caption, time, image } = body;
    if (!caption) return { ok: false, output: 'caption required' };
    const t = time || (() => {
      const d = new Date();
      d.setHours(10, 0, 0, 0);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} 10:00`;
    })();
    const safeCaption = caption.replace(/"/g, '\\"');
    const imageArg = image ? ` --image "${image}"` : '';
    return run(`node "${path.join(AGENCY, 'content-scheduler.js')}" add --platform ${platform} --caption "${safeCaption}" --time "${t}"${imageArg}`);
  }
};

const server = http.createServer((req, res) => {
  const routeKey = `${req.method} ${req.url.split('?')[0]}`;
  const handler = ROUTES[routeKey];

  res.setHeader('Content-Type', 'application/json');

  if (!handler) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', route: routeKey }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const result = handler(parsed);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
  } else {
    const result = handler();
    res.writeHead(200);
    res.end(JSON.stringify(result));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`n8n bridge running at http://localhost:${PORT}`);
  console.log('Routes:');
  Object.keys(ROUTES).forEach(r => console.log(' ', r));
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} already in use. Bridge may already be running.`);
  } else {
    console.error('Bridge error:', err.message);
  }
  process.exit(1);
});
