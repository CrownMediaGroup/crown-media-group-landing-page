/**
 * tiktok-post.js — TikTok Content Posting API
 * Crown Media Group | Posts videos to @crownmediagroupco TikTok
 *
 * Usage:
 *   node Agency/tools/tiktok-post.js --auth              → OAuth login, saves session
 *   node Agency/tools/tiktok-post.js --post <video.mp4>  → Upload + publish video
 *   node Agency/tools/tiktok-post.js --post <video.mp4> --title "Caption text"
 *   node Agency/tools/tiktok-post.js --status <publish_id>  → Check post status
 *   node Agency/tools/tiktok-post.js --dry-run --post <video.mp4>  → Validate without posting
 *
 * Setup:
 *   .env needs: TIKTOK_CLIENT_KEY=aw94n02niin3hy9m
 *               TIKTOK_CLIENT_SECRET=K1ZHzkUoFVGmMNLQsw5KH3g5LpGyPDQ6
 *   Run --auth once to authorize your TikTok account
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const http    = require('http');
const { exec } = require('child_process');
const crypto  = require('crypto');

const CLIENT_KEY    = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error('[FATAL] TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET required in .env');
  process.exit(1);
}
const REDIRECT_URI  = 'http://localhost:3456/callback';
const SESSION_FILE  = path.join(__dirname, '../../security/tiktok-session.json');
const SCOPES        = 'video.publish,video.upload';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')); } catch { return null; }
}

function saveSession(data) {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
  console.log(`[SESSION] Saved → ${SESSION_FILE}`);
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
  exec(cmd);
}

function httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data   = typeof body === 'string' ? body : JSON.stringify(body);
    const opts   = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsPut(uploadUrl, buffer, contentType = 'video/mp4') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(uploadUrl);
    const opts   = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length,
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
}

// ── OAuth Flow ────────────────────────────────────────────────────────────────

async function runAuth() {
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.set('client_key', CLIENT_KEY);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('state', state);

  console.log('\n[AUTH] Opening TikTok authorization...');
  console.log('[AUTH] If browser does not open, visit:');
  console.log(authUrl.toString());

  openBrowser(authUrl.toString());

  // Local server to catch callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost:3456');
      const code  = u.searchParams.get('code');
      const error = u.searchParams.get('error');
      res.end('<html><body><h2>Authorization complete. Return to terminal.</h2></body></html>');
      server.close();
      if (error) reject(new Error(error));
      else resolve(code);
    });
    server.listen(3456, () => console.log('[AUTH] Waiting for TikTok callback on port 3456...'));
    server.on('error', reject);
  });

  console.log('[AUTH] Code received. Exchanging for access token...');

  const tokenBody = new URLSearchParams({
    client_key:    CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    code,
    grant_type:    'authorization_code',
    redirect_uri:  REDIRECT_URI,
  }).toString();

  const res = await new Promise((resolve, reject) => {
    const data = tokenBody;
    const req  = https.request({
      hostname: 'open.tiktokapis.com',
      path: '/v2/oauth/token/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    }, r => {
      let raw = '';
      r.on('data', d => raw += d);
      r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  if (res.status !== 200 || res.body.error) {
    console.error('[AUTH] Token exchange failed:', JSON.stringify(res.body, null, 2));
    process.exit(1);
  }

  const session = {
    access_token:  res.body.access_token,
    refresh_token: res.body.refresh_token,
    open_id:       res.body.open_id,
    expires_in:    res.body.expires_in,
    authorized_at: Date.now(),
    scope:         res.body.scope,
  };

  saveSession(session);
  console.log(`[AUTH] Success! open_id: ${session.open_id}`);
  console.log('[AUTH] Scopes:', session.scope);
  console.log('[AUTH] Run --post <video.mp4> to post your first video.');
}

// ── Token Refresh ─────────────────────────────────────────────────────────────

async function refreshToken(session) {
  console.log('[TOKEN] Refreshing access token...');
  const data = new URLSearchParams({
    client_key:    CLIENT_KEY,
    client_secret: CLIENT_SECRET,
    grant_type:    'refresh_token',
    refresh_token: session.refresh_token,
  }).toString();

  const res = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'open.tiktokapis.com',
      path: '/v2/oauth/token/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    }, r => {
      let raw = '';
      r.on('data', d => raw += d);
      r.on('end', () => resolve({ status: r.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  if (res.status !== 200 || !res.body.access_token) {
    console.error('[TOKEN] Refresh failed — run --auth again');
    process.exit(1);
  }

  const updated = {
    ...session,
    access_token:  res.body.access_token,
    refresh_token: res.body.refresh_token || session.refresh_token,
    expires_in:    res.body.expires_in,
    authorized_at: Date.now(),
  };
  saveSession(updated);
  return updated;
}

async function getValidSession() {
  let session = loadSession();
  if (!session) {
    console.error('[ERROR] No session. Run: node Agency/tools/tiktok-post.js --auth');
    process.exit(1);
  }
  // Refresh if within 5 min of expiry
  const age = (Date.now() - session.authorized_at) / 1000;
  if (age > (session.expires_in - 300)) {
    session = await refreshToken(session);
  }
  return session;
}

// ── Post Video ────────────────────────────────────────────────────────────────

async function postVideo(videoPath, title, dryRun = false) {
  if (!fs.existsSync(videoPath)) {
    console.error(`[ERROR] File not found: ${videoPath}`);
    process.exit(1);
  }

  const videoBuffer = fs.readFileSync(videoPath);
  const videoSize   = videoBuffer.length;
  const videoName   = path.basename(videoPath);
  const caption     = title || `${videoName.replace(/\.[^.]+$/, '')} | Crown Media Group`;

  console.log(`\n[POST] Video: ${videoName} (${(videoSize / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`[POST] Caption: ${caption}`);

  if (dryRun) {
    console.log('[DRY RUN] Would initialize upload. No actual post made.');
    return;
  }

  const session = await getValidSession();

  // Step 1: Initialize upload
  console.log('[POST] Initializing upload with TikTok...');
  const initRes = await httpsPost(
    'https://open.tiktokapis.com/v2/post/publish/video/init/',
    {
      post_info: {
        title: caption,
        privacy_level: 'SELF_ONLY', // safe default — change to PUBLIC_TO_EVERYONE when ready
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize,
        total_chunk_count: 1,
      },
    },
    { Authorization: `Bearer ${session.access_token}` }
  );

  if (initRes.status !== 200 || initRes.body.error?.code !== 'ok') {
    console.error('[POST] Init failed:', JSON.stringify(initRes.body, null, 2));
    process.exit(1);
  }

  const { publish_id, upload_url } = initRes.body.data;
  console.log(`[POST] publish_id: ${publish_id}`);
  console.log('[POST] Uploading video binary...');

  // Step 2: Upload video binary
  const uploadRes = await httpsPut(upload_url, videoBuffer, 'video/mp4');

  if (uploadRes.status !== 204 && uploadRes.status !== 200) {
    console.error(`[POST] Upload failed (HTTP ${uploadRes.status}):`, uploadRes.body);
    process.exit(1);
  }

  console.log('[POST] Upload complete. TikTok is processing...');
  console.log(`[POST] Check status: node Agency/tools/tiktok-post.js --status ${publish_id}`);
  console.log('\n[NOTE] Video set to SELF_ONLY (only you can see). Change privacy_level to PUBLIC_TO_EVERYONE when ready for live posting.');

  // Save publish_id locally
  const logDir  = path.join(__dirname, '../ops/tiktok');
  const logFile = path.join(logDir, `posts-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : [];
  log.push({ publish_id, caption, video: videoName, posted_at: new Date().toISOString() });
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
}

// ── Status Check ──────────────────────────────────────────────────────────────

async function checkStatus(publishId) {
  const session = await getValidSession();

  const res = await httpsPost(
    'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
    { publish_id: publishId },
    { Authorization: `Bearer ${session.access_token}` }
  );

  const status = res.body?.data?.status;
  const failReason = res.body?.data?.fail_reason;

  console.log(`[STATUS] publish_id: ${publishId}`);
  console.log(`[STATUS] Status: ${status || 'unknown'}`);
  if (failReason) console.log(`[STATUS] Fail reason: ${failReason}`);
  if (status === 'PUBLISH_COMPLETE') console.log('[STATUS] Video is LIVE on TikTok.');
  else if (status === 'PROCESSING_UPLOAD') console.log('[STATUS] Still processing — check again in 30s.');
  else console.log('[STATUS] Full response:', JSON.stringify(res.body, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const isAuth  = args.includes('--auth');
  const isDry   = args.includes('--dry-run');
  const postIdx = args.indexOf('--post');
  const statIdx = args.indexOf('--status');
  const titleIdx = args.indexOf('--title');

  const videoPath = postIdx >= 0 ? args[postIdx + 1] : null;
  const publishId = statIdx >= 0 ? args[statIdx + 1] : null;
  const title     = titleIdx >= 0 ? args[titleIdx + 1] : null;

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Crown Media Group — TikTok Content Poster');
  console.log('═══════════════════════════════════════════════════\n');

  if (isAuth)        return runAuth();
  if (videoPath)     return postVideo(videoPath, title, isDry);
  if (publishId)     return checkStatus(publishId);

  console.log('Usage:');
  console.log('  --auth                     Authorize TikTok account (run once)');
  console.log('  --post <video.mp4>         Upload and post a video');
  console.log('  --post <video.mp4> --title "Your caption here"');
  console.log('  --status <publish_id>      Check post status');
  console.log('  --dry-run                  Validate without posting');
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
