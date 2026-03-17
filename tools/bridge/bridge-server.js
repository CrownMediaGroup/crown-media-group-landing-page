const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', '*');
  next();
});

const LOG = path.join(__dirname, '../../Agency/ops/notes/CC-LATEST-REPORT.md');
const QUEUE = path.join(__dirname, '../../Agency/ops/notes/DIRECTIVE-QUEUE.md');

// CC posts a directive here
app.post('/directive', (req, res) => {
  const { directive, number } = req.body;
  const timestamp = new Date().toISOString();
  fs.writeFileSync(QUEUE, `# Directive ${number} — ${timestamp}\n\n${directive}\n`);
  res.json({ status: 'queued', directive: number, timestamp });
  console.log(`[CC] Directive ${number} received and queued`);
});

// CC reads the latest report here
app.get('/report', (req, res) => {
  try {
    const report = fs.readFileSync(LOG, 'utf8');
    res.json({ status: 'ok', report, timestamp: new Date().toISOString() });
  } catch(e) {
    res.json({ status: 'empty', report: 'No report yet' });
  }
});

// Health check
app.get('/ping', (req, res) => {
  res.json({ status: 'online', agent: 'Claude Code Bridge', time: new Date().toISOString() });
});

app.listen(4000, () => {
  console.log('CC Bridge running on http://localhost:4000');
  console.log('CC can now send directives without King copy-pasting');
});
