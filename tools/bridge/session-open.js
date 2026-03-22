// Auto-fires CC session opening prompt to bridge on startup
// Retries until bridge is ready, then sends as directive 000

const http = require('http');
const fs = require('fs');
const path = require('path');

const BRIDGE_PORT = 4000;
const PROMPT_FILE = path.join(__dirname, '../../Agency/ops/notes/CC-SESSION-OPEN.md');
const MAX_RETRIES = 20;
const RETRY_DELAY = 1500;

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: BRIDGE_PORT,
      path: '/directive',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function ping() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${BRIDGE_PORT}/ping`, res => {
      res.on('data', () => {});
      res.on('end', resolve);
    }).on('error', reject);
  });
}

async function waitForBridge(retries) {
  for (let i = 0; i < retries; i++) {
    try {
      await ping();
      return true;
    } catch {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }
  return false;
}

async function run() {
  const ready = await waitForBridge(MAX_RETRIES);
  if (!ready) {
    console.error('Bridge did not start — session-open aborted.');
    process.exit(1);
  }

  const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
  await post({ number: '000', directive: prompt });
  console.log('Session opening prompt fired to bridge.');
}

run();
