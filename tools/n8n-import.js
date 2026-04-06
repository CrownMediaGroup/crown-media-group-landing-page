/**
 * n8n-import.js — Import Crown Media Group video pipeline into n8n
 * Usage: node tools/n8n-import.js
 * Requires: n8n running on localhost:5678 (run: npx n8n)
 */

const fs   = require('fs');
const path = require('path');

const N8N_URL     = 'http://localhost:5678';
const PIPELINE    = path.join(__dirname, '../tools/video-service/automation/video-pipeline.json');
const IMPORT_FLAG = path.join(__dirname, '../Agency/ops/notes/.n8n-imported');

async function run() {
  console.log('[n8n-import] Checking n8n connection...');

  // Check if already imported this session
  if (fs.existsSync(IMPORT_FLAG)) {
    console.log('[n8n-import] Pipeline already imported. Delete Agency/ops/notes/.n8n-imported to re-import.');
    return;
  }

  // Check n8n is online
  try {
    const health = await fetch(`${N8N_URL}/healthz`);
    if (!health.ok) throw new Error('not ok');
  } catch {
    console.log('[n8n-import] n8n is not running.');
    console.log('[n8n-import] Start it with: npx n8n');
    console.log('[n8n-import] Then run this script again.');
    process.exit(0);
  }

  console.log('[n8n-import] n8n is online. Reading pipeline...');

  if (!fs.existsSync(PIPELINE)) {
    console.error(`[n8n-import] Pipeline file not found: ${PIPELINE}`);
    process.exit(1);
  }

  let workflow;
  try {
    workflow = JSON.parse(fs.readFileSync(PIPELINE, 'utf8'));
  } catch (e) {
    console.error('[n8n-import] Failed to parse pipeline JSON:', e.message);
    process.exit(1);
  }

  // Check if workflow already exists by name
  try {
    const listRes  = await fetch(`${N8N_URL}/rest/workflows`, { headers: { 'Content-Type': 'application/json' } });
    const listData = await listRes.json();
    const existing = (listData.data || []).find(w => w.name === workflow.name);
    if (existing) {
      console.log(`[n8n-import] Workflow "${workflow.name}" already exists (id: ${existing.id}). Skipping.`);
      fs.writeFileSync(IMPORT_FLAG, new Date().toISOString());
      return;
    }
  } catch { /* continue */ }

  // Import workflow
  console.log(`[n8n-import] Importing "${workflow.name}"...`);
  try {
    const createRes  = await fetch(`${N8N_URL}/rest/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      console.error('[n8n-import] Import failed:', JSON.stringify(created).substring(0, 300));
      process.exit(1);
    }
    const wfId = created.data?.id || created.id;
    console.log(`[n8n-import] Imported. Workflow ID: ${wfId}`);

    // Activate it
    if (wfId) {
      const activateRes = await fetch(`${N8N_URL}/rest/workflows/${wfId}/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (activateRes.ok) {
        console.log('[n8n-import] Workflow activated.');
      } else {
        console.log('[n8n-import] Import OK. Activate manually in n8n UI if needed.');
      }
    }

    fs.writeFileSync(IMPORT_FLAG, new Date().toISOString());
    console.log('[n8n-import] Done. Video pipeline is live in n8n.');
  } catch (e) {
    console.error('[n8n-import] Error:', e.message);
    process.exit(1);
  }
}

run();
