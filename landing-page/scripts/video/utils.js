/**
 * video/utils.js — Shared utilities for the blog-to-video pipeline
 * Crown Media Group
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export const ROOT        = resolve(__dirname, '..', '..');
export const CONTENT_DIR = join(ROOT, 'content', 'blog');
export const VIDEO_OUT   = join(ROOT, 'content', 'blog', 'video-output');
export const VIDEO_LOG   = join(ROOT, 'content', 'blog', '.video-log.json');
export const SITE_URL    = 'https://crownmediagroup.co';

// ── Env loader ────────────────────────────────────────────────────────────────
export function loadEnv() {
  const envFile = join(ROOT, '..', '.env');
  if (!existsSync(envFile)) return;
  readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const eq = line.indexOf('=');
    if (eq > 0 && !line.trim().startsWith('#')) {
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (k && !process.env[k]) process.env[k] = v;
    }
  });
}

// ── Parse frontmatter ─────────────────────────────────────────────────────────
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  match[1].split('\n').forEach(line => {
    const eq = line.indexOf(':');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    fm[key] = val;
  });
  const body = content.slice(match[0].length).trim();
  fm._body    = body;
  fm._excerpt = body.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && l.length > 40) || '';
  return fm;
}

// ── Find post ─────────────────────────────────────────────────────────────────
export function findPost(specifiedFile = null) {
  if (specifiedFile) {
    const fp = join(CONTENT_DIR, specifiedFile);
    if (existsSync(fp)) return { path: fp, filename: specifiedFile };
    throw new Error(`File not found: ${specifiedFile}`);
  }
  const log   = loadVideoLog();
  const files = readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.md') && f !== 'fallback-post.md')
    .map(f => ({ name: f, mtime: statSync(join(CONTENT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files) {
    const key = file.name.replace('.md', '');
    if (!log[key]) return { path: join(CONTENT_DIR, file.name), filename: file.name };
  }
  return null; // all posts processed
}

// ── Video log ─────────────────────────────────────────────────────────────────
export function loadVideoLog() {
  if (!existsSync(VIDEO_LOG)) return {};
  try { return JSON.parse(readFileSync(VIDEO_LOG, 'utf8')); } catch { return {}; }
}

export function saveVideoLog(log) {
  writeFileSync(VIDEO_LOG, JSON.stringify(log, null, 2));
}

// ── Slug from filename ────────────────────────────────────────────────────────
export function slugFromFilename(filename) {
  return filename.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace('.md', '');
}

// ── Send failure email via Resend ─────────────────────────────────────────────
export async function notifyFailure(step, error) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'Crown Media <noreply@crownmediagroup.co>',
        to:      ['king@crownmediagroup.co'],
        subject: `[Blog-to-Video] Step failed: ${step}`,
        html:    `<p><strong>Step:</strong> ${step}</p><p><strong>Error:</strong> ${error?.message || error}</p><p>Check the video-output directory for partial files.</p>`,
      }),
    });
  } catch (_) {}
}
