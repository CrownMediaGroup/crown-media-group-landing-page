/**
 * auto-backup.js — Crown Media Group 3-Layer Backup System
 *
 * LAYER 1: Git tag on every run (instant restore point)
 * LAYER 2: Zipped local backup of all critical directories
 * LAYER 3: Netlify deploy history + GitHub = cloud mirror
 *
 * Usage:
 *   node tools/backup/auto-backup.js          → full backup + git tag
 *   node tools/backup/auto-backup.js --list   → list all backup tags
 *   node tools/backup/auto-backup.js --restore <tag>  → restore from tag
 *
 * Run automatically via:
 *   - git post-commit hook (auto-tags every commit)
 *   - n8n nightly schedule at 2AM
 */

const { execSync, exec } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '../..');
const BACKUP_DIR = path.join(ROOT, 'Agency/ops/backups');

// Directories to back up (zip)
const CRITICAL_DIRS = [
  'landing-page',
  'tools/crm/public',
  'Agency/tools',
  'Agency/ops',
  'client-onboarding-system',
];

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ── Layer 1: Git Tag ──────────────────────────────────────────────────────────
function createGitTag() {
  const tag = `backup-${timestamp()}`;
  const shortHash = run('git rev-parse --short HEAD') || 'unknown';
  const branch    = run('git rev-parse --abbrev-ref HEAD') || 'master';
  const msg       = `Auto-backup: ${tag} | branch: ${branch} | commit: ${shortHash}`;

  const result = run(`git tag -a "${tag}" -m "${msg}"`);
  if (result !== null) {
    console.log(`[LAYER 1] Git tag created: ${tag}`);
    // Push tag to GitHub
    const pushed = run(`git push origin "${tag}" 2>&1`);
    if (pushed !== null) {
      console.log(`[LAYER 1] Tag pushed to GitHub: ${tag}`);
    } else {
      console.log(`[LAYER 1] Tag saved locally (push failed — no network?): ${tag}`);
    }
    return tag;
  } else {
    console.log('[LAYER 1] Tag already exists for this timestamp — skipping');
    return null;
  }
}

// ── Layer 2: Zip Local Backup ─────────────────────────────────────────────────
function createZipBackup(tagName) {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const zipName = `crown-media-${tagName || timestamp()}.zip`;
  const zipPath = path.join(BACKUP_DIR, zipName);

  // Build list of existing dirs to include
  const existing = CRITICAL_DIRS.filter(d => fs.existsSync(path.join(ROOT, d)));

  if (!existing.length) {
    console.log('[LAYER 2] No critical dirs found — skipping zip');
    return;
  }

  // Use PowerShell Compress-Archive on Windows
  // PowerShell requires array syntax for multiple paths
  const itemsArr = existing.map(d => `'${path.join(ROOT, d).replace(/\\/g, '/')}'`).join(',');
  const destPath = zipPath.replace(/\\/g, '/');
  const cmd = `powershell -Command "Compress-Archive -Path @(${itemsArr}) -DestinationPath '${destPath}' -Force"`;

  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
    const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
    console.log(`[LAYER 2] Zip created: ${zipName} (${size} MB)`);
  } catch (e) {
    console.log('[LAYER 2] Zip failed (PowerShell):', e.message.slice(0, 100));
  }

  // Keep only last 7 zips to save disk space
  pruneOldBackups();
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const zips = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  // Delete everything after the 7 most recent
  zips.slice(7).forEach(z => {
    fs.unlinkSync(path.join(BACKUP_DIR, z.name));
    console.log(`[LAYER 2] Pruned old backup: ${z.name}`);
  });
}

// ── Layer 3: Netlify Deploy History ──────────────────────────────────────────
async function checkNetlifyBackups() {
  const https = require('https');
  const TOKEN = process.env.NETLIFY_TOKEN || 'nfp_EKfNX62pX8KcqmPdpYShVtdVgEw3ge2P3e50';

  return new Promise(resolve => {
    https.get({
      hostname: 'api.netlify.com',
      path: '/api/v1/sites/9893bf05-26a0-40f9-bb99-5beaebaa5df3/deploys?per_page=5',
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const deploys = JSON.parse(d);
          const ready = deploys.filter(dep => dep.state === 'ready');
          console.log(`[LAYER 3] Netlify cloud backups: ${ready.length} ready deploys available`);
          ready.slice(0, 3).forEach(dep => {
            console.log(`  → ${dep.id.slice(0,8)} | ${new Date(dep.created_at).toLocaleDateString()} | ${dep.deploy_url}`);
          });
        } catch {
          console.log('[LAYER 3] Netlify check skipped (API unreachable)');
        }
        resolve();
      });
    }).on('error', () => {
      console.log('[LAYER 3] Netlify check skipped (no network)');
      resolve();
    });
  });
}

// ── List all backup tags ──────────────────────────────────────────────────────
function listBackups() {
  const tags = run('git tag -l "backup-*" --sort=-version:refname') || '';
  const lines = tags.split('\n').filter(Boolean);
  console.log(`\n[BACKUPS] ${lines.length} git backup tags found:\n`);
  lines.slice(0, 20).forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log('\nTo restore any backup:');
  console.log('  node tools/backup/auto-backup.js --restore <tag-name>');
}

// ── Restore from tag ──────────────────────────────────────────────────────────
function restoreFromTag(tag) {
  console.log(`\n[RESTORE] Restoring from tag: ${tag}`);
  const exists = run(`git tag -l "${tag}"`);
  if (!exists) {
    console.error(`[RESTORE] Tag not found: ${tag}`);
    process.exit(1);
  }

  // Create a safety tag of current state before restoring
  const safetyTag = `pre-restore-${timestamp()}`;
  run(`git tag -a "${safetyTag}" -m "Safety backup before restoring ${tag}"`);
  console.log(`[RESTORE] Safety backup of current state: ${safetyTag}`);

  // Restore landing page files from tag
  const result = run(`git checkout "${tag}" -- landing-page/ Agency/tools/ tools/crm/public/`);
  if (result !== null) {
    console.log('[RESTORE] Files restored. Review changes then commit:');
    console.log('  git diff --stat');
    console.log('  git add -A && git commit -m "restore: from backup ' + tag + '"');
    console.log('  git push origin master');
  } else {
    console.error('[RESTORE] Restore failed — try: git checkout ' + tag + ' -- landing-page/');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) return listBackups();
  if (args.includes('--restore')) {
    const tag = args[args.indexOf('--restore') + 1];
    if (!tag) { console.error('Usage: --restore <tag-name>'); process.exit(1); }
    return restoreFromTag(tag);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Crown Media Group — Auto Backup System');
  console.log(`  ${new Date().toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════\n');

  const tag = createGitTag();
  createZipBackup(tag);
  await checkNetlifyBackups();

  console.log('\n[DONE] 3-layer backup complete.');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch(e => {
  console.error('[BACKUP] Fatal:', e.message);
  process.exit(1);
});
