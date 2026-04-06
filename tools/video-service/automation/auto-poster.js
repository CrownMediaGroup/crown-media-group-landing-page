/**
 * auto-poster.js — Video Service Auto-Posting Engine
 * Crown Media Group | All Glory to Jesus Global LLC
 *
 * Usage:
 *   node tools/video-service/automation/auto-poster.js          # run continuously (cron)
 *   node tools/video-service/automation/auto-poster.js --check  # run once and exit
 *
 * Runs every 15 minutes. Checks for scheduled video projects and posts to:
 *   - Instagram, Facebook, TikTok → social-post.js (Playwright)
 *   - YouTube, X → Buffer API (requires BUFFER_ACCESS_TOKEN)
 *   - Threads → social-post.js
 *
 * On success: updates video_platform_posts + video_projects in Supabase
 * On failure: SMS King via Twilio + logs to DAILY-LOG.md
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { execSync, exec } = require('child_process');
const fs   = require('fs');
const path = require('path');
const http = require('https');

const ROOT        = path.join(__dirname, '../../..');
const DAILY_LOG   = path.join(ROOT, 'Agency/ops/notes/DAILY-LOG.md');
const SOCIAL_POST = path.join(ROOT, 'Agency/tools/social-post.js');

// ── Env ──────────────────────────────────────────────────────
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SUPABASE_KEY    = process.env.SUPABASE_KEY;
const TWILIO_SID      = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN    = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM     = process.env.TWILIO_FROM_NUMBER;
const KING_PHONE      = process.env.KING_PHONE || process.env.TWILIO_TO_NUMBER;
const YT_CLIENT_ID     = process.env.YOUTUBE_CLIENT_ID;
const YT_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YT_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;
const GMAIL_USER      = process.env.GMAIL_USER;
const GMAIL_PASS      = process.env.GMAIL_APP_PASSWORD;

// ── Logging ───────────────────────────────────────────────────
function log(msg) {
  const ts  = new Date().toISOString();
  const line = `[${ts}] [VIDEO-POSTER] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(DAILY_LOG, line);
}

// ── Supabase helpers ──────────────────────────────────────────
async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} — ${body}`);
  }
  return options.method === 'DELETE' ? null : res.json();
}

async function getScheduledProjects() {
  const now = new Date().toISOString();
  return sbFetch(
    `video_projects?select=*&status=eq.scheduled&scheduled_post_at=lte.${now}&posted_at=is.null&order=scheduled_post_at.asc`
  );
}

async function getPlatformPosts(projectId) {
  return sbFetch(
    `video_platform_posts?project_id=eq.${projectId}&status=in.(draft,approved)&order=platform.asc`
  );
}

async function markPostDone(postId, platformPostId = null) {
  await sbFetch(`video_platform_posts?id=eq.${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'posted',
      posted_at: new Date().toISOString(),
      ...(platformPostId ? { platform_post_id: platformPostId } : {}),
    }),
    headers: { Prefer: 'return=minimal' },
  });
}

async function markPostFailed(postId, reason) {
  await sbFetch(`video_platform_posts?id=eq.${postId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'failed' }),
    headers: { Prefer: 'return=minimal' },
  });
  log(`FAILED post ${postId}: ${reason}`);
}

async function markProjectPosted(projectId) {
  await sbFetch(`video_projects?id=eq.${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'posted', posted_at: new Date().toISOString() }),
    headers: { Prefer: 'return=minimal' },
  });
}

// ── Twilio SMS to King ────────────────────────────────────────
function smsKing(message) {
  if (!TWILIO_SID || !KING_PHONE) {
    log(`[SMS SKIP] ${message}`);
    return;
  }
  const body = `TO=${encodeURIComponent(KING_PHONE)}&From=${encodeURIComponent(TWILIO_FROM)}&Body=${encodeURIComponent(message)}`;
  const auth  = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const req   = http.request({
    hostname: 'api.twilio.com',
    path: `/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, res => log(`[SMS] ${res.statusCode}`));
  req.on('error', e => log(`[SMS ERROR] ${e.message}`));
  req.write(body);
  req.end();
}

// ── Gmail notification to client ──────────────────────────────
async function emailClient(clientEmail, clientName, businessName, postedPlatforms) {
  if (!GMAIL_USER || !GMAIL_PASS) { log('[EMAIL SKIP] No Gmail credentials'); return; }
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });
    const platformList = postedPlatforms.join(', ');
    await transporter.sendMail({
      from: `"Crown Media Group" <${GMAIL_USER}>`,
      to: clientEmail,
      subject: `Your video is live on ${platformList}!`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;">
          <div style="background:#1A1A3E;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
            <h1 style="color:#E8B832;font-family:Georgia,serif;font-size:1.4rem;margin:0;">Crown Media Group</h1>
          </div>
          <div style="background:#FDFBF7;padding:32px;border-radius:0 0 8px 8px;">
            <p style="font-size:1rem;color:#1A1A2E;">Hi ${clientName.split(' ')[0]},</p>
            <p style="color:#4A4A6A;line-height:1.6;">Great news — your video for <strong>${businessName}</strong> is now live!</p>
            <p style="color:#4A4A6A;line-height:1.6;">We posted it to: <strong>${platformList}</strong></p>
            <p style="color:#4A4A6A;line-height:1.6;margin-top:20px;">Check your profiles and let us know what you think. We'll have engagement stats for you in your monthly report.</p>
            <p style="color:#9A720D;font-style:italic;margin-top:24px;font-size:0.9rem;">All glory to God — we're honored to serve your business.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
            <p style="font-size:0.8rem;color:#8A8AAA;">Crown Media Group | Columbia, SC | <a href="https://crownmediagroup.co" style="color:#C9981A;">crownmediagroup.co</a></p>
          </div>
        </div>`,
    });
    log(`[EMAIL] Sent "video live" notification to ${clientEmail}`);
  } catch (err) {
    log(`[EMAIL ERROR] ${err.message}`);
  }
}

// ── ffmpeg helpers ────────────────────────────────────────────
function compressVideo(inputPath, outputPath) {
  try {
    execSync(`ffmpeg -i "${inputPath}" -vcodec libx264 -crf 28 -y "${outputPath}"`, { timeout: 120000 });
    return outputPath;
  } catch (err) {
    log(`[FFMPEG] Compression failed: ${err.message}`);
    return inputPath; // use original
  }
}

function cropToReel(inputPath, outputPath) {
  try {
    execSync(`ffmpeg -i "${inputPath}" -vf "crop=ih*9/16:ih,scale=1080:1920" -y "${outputPath}"`, { timeout: 120000 });
    return outputPath;
  } catch (err) {
    log(`[FFMPEG] Crop failed: ${err.message}`);
    return inputPath;
  }
}

// ── Social-post.js caller ─────────────────────────────────────
function postToSocial(platform, caption, videoPath, dryRun = false) {
  const dry = dryRun ? '--dry-run ' : '';
  const cap = caption.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const cmd = `node "${SOCIAL_POST}" --platform ${platform} --video "${videoPath}" --caption "${cap}" ${dry}`;
  log(`[POST] ${platform.toUpperCase()}: ${cmd.substring(0, 100)}...`);
  try {
    const out = execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    log(`[POST OK] ${platform}: ${out.trim().substring(0, 80)}`);
    return true;
  } catch (err) {
    const errMsg = err.stderr || err.message;
    log(`[POST FAIL] ${platform}: ${errMsg.substring(0, 100)}`);
    return false;
  }
}

// ── YouTube API direct upload (bypasses Buffer) ───────────────
async function postToYouTube(caption, videoPath, platformTitle) {
  if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
    log('[YOUTUBE SKIP] YOUTUBE_CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN not set');
    return false;
  }
  try {
    const { google } = require('googleapis');
    const os         = require('os');
    const oauth2 = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET, 'http://localhost:3001/callback');
    oauth2.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
    const youtube = google.youtube({ version: 'v3', auth: oauth2 });

    // If videoPath is a remote URL, download to temp first
    let localPath = videoPath;
    if (videoPath.startsWith('http')) {
      const tmpFile = path.join(os.tmpdir(), `yt-upload-${Date.now()}.mp4`);
      log(`[YOUTUBE] Downloading video to temp: ${tmpFile}`);
      const res  = await fetch(videoPath);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buf  = await res.arrayBuffer();
      fs.writeFileSync(tmpFile, Buffer.from(buf));
      localPath = tmpFile;
    }

    const title = (platformTitle || caption).slice(0, 100);
    log(`[YOUTUBE] Uploading: ${title}`);

    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description: caption.slice(0, 5000),
          categoryId:  '22', // People & Blogs
          defaultLanguage: 'en',
        },
        status: {
          privacyStatus:           'public',
          selfDeclaredMadeForKids: false,
          madeForKids:             false,
        },
      },
      media: {
        mimeType: 'video/mp4',
        body:     fs.createReadStream(localPath),
      },
    });

    const videoId  = response.data.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    log(`[YOUTUBE OK] ${videoUrl}`);
    return videoId;
  } catch (err) {
    log(`[YOUTUBE ERROR] ${err.message}`);
    return false;
  }
}

// ── Manual fallback notification ──────────────────────────────
async function notifyKingManualEdit(project) {
  const storageUrl = project.raw_video_url
    ? `${SUPABASE_URL}/storage/v1/object/public/video-uploads/${project.raw_video_url}`
    : project.drive_link || 'N/A';

  const msg = `[Crown Media] New video to edit — ${project.client_name} | ${project.business_name} | Open: crownmediagroup.co/video-admin | Raw: ${storageUrl.substring(0, 60)}`;
  smsKing(msg);

  // Update status to processing
  await sbFetch(`video_projects?id=eq.${project.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'processing',
      king_notified: true,
      manual_edit_notes: 'Auto-notified King via SMS for manual CapCut edit',
    }),
    headers: { Prefer: 'return=minimal' },
  });
  log(`[MANUAL] Notified King for project ${project.id}`);
}

// ── Main: process one project ─────────────────────────────────
async function processProject(project) {
  log(`Processing project ${project.id} — ${project.client_name} (${project.business_name})`);

  // Check if project needs manual edit
  if (project.needs_capcut && !project.edited_video_url) {
    await notifyKingManualEdit(project);
    return;
  }

  const videoPath = project.edited_video_url || project.raw_video_url;
  if (!videoPath) {
    log(`[SKIP] No video path for project ${project.id}`);
    return;
  }

  // Resolve local path or storage URL
  let localVideoPath = videoPath;
  if (!videoPath.startsWith('/') && !videoPath.startsWith('http')) {
    localVideoPath = `${SUPABASE_URL}/storage/v1/object/public/video-uploads/${videoPath}`;
  }

  const posts = await getPlatformPosts(project.id);
  if (!posts.length) {
    log(`[SKIP] No platform posts for project ${project.id}`);
    return;
  }

  const posted = [];
  const failed = [];

  for (const post of posts) {
    const caption = [post.caption, post.hashtags].filter(Boolean).join('\n\n');
    let success = false;
    let platformId = null;

    if (['instagram', 'facebook', 'tiktok', 'threads'].includes(post.platform)) {
      // Use social-post.js (Playwright)
      success = postToSocial(post.platform, caption, localVideoPath);
    } else if (post.platform === 'youtube') {
      // Use YouTube Data API v3 directly
      const ytId = await postToYouTube(caption, localVideoPath, post.platform_title);
      success    = !!ytId;
      platformId = typeof ytId === 'string' ? ytId : null;
    } else if (post.platform === 'x') {
      // X requires Twitter API v2 credentials — skip, notify King
      log('[X SKIP] X/Twitter posting requires Twitter API v2 — post manually');
      await markPostFailed(post.id, 'X requires Twitter API v2 credentials');
    }

    if (success) {
      await markPostDone(post.id, platformId);
      posted.push(post.platform);
    } else {
      await markPostFailed(post.id, 'posting failed');
      failed.push(post.platform);
    }

    // Small delay between platforms
    await new Promise(r => setTimeout(r, 3000));
  }

  // Update project status
  if (posted.length > 0) {
    await markProjectPosted(project.id);
    log(`[DONE] Project ${project.id} — posted to: ${posted.join(', ')}`);

    // Notify client
    await emailClient(
      project.client_email,
      project.client_name,
      project.business_name,
      posted
    );

    // SMS King summary
    smsKing(`Video posted! ${project.client_name} — ${project.business_name} | Platforms: ${posted.join(', ')} | ${failed.length > 0 ? 'FAILED: ' + failed.join(', ') : 'All OK'}`);
  }

  if (failed.length > 0) {
    smsKing(`Video post FAILED for ${project.client_name}: ${failed.join(', ')} — check crownmediagroup.co/video-admin`);
  }
}

// ── Check new uploads and notify King ────────────────────────
async function checkNewUploads() {
  const projects = await sbFetch(
    `video_projects?status=eq.uploaded&king_notified=eq.false&select=*`
  );
  for (const p of (projects || [])) {
    const storageUrl = p.drive_link || (p.raw_video_url ? `Supabase Storage: ${p.raw_video_url.substring(0, 40)}` : 'No file yet');
    smsKing(`New video from ${p.client_name} (${p.business_name}) — ${storageUrl} — Review: crownmediagroup.co/video-admin`);
    await sbFetch(`video_projects?id=eq.${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ king_notified: true }),
      headers: { Prefer: 'return=minimal' },
    });
    log(`[NEW] Notified King of upload from ${p.client_name}`);
  }
}

// ── Main runner ───────────────────────────────────────────────
async function runCheck() {
  log('--- Video poster check start ---');
  try {
    // 1. Notify King of new uploads
    await checkNewUploads();

    // 2. Post scheduled projects
    const projects = await getScheduledProjects();
    log(`Found ${(projects || []).length} projects due for posting`);
    for (const project of (projects || [])) {
      await processProject(project);
    }
  } catch (err) {
    log(`[ERROR] ${err.message}`);
    smsKing(`Video poster error: ${err.message.substring(0, 100)}`);
  }
  log('--- Video poster check end ---');
}

// ── Mode: --check (run once) or continuous (cron) ─────────────
const isCheck = process.argv.includes('--check');

if (isCheck) {
  runCheck().then(() => process.exit(0)).catch(err => {
    log(`Fatal: ${err.message}`);
    process.exit(1);
  });
} else {
  // Continuous mode — require node-cron
  try {
    const cron = require('node-cron');
    log('[CRON] Auto-poster starting — runs every 15 minutes');
    runCheck(); // run immediately on start
    cron.schedule('*/15 * * * *', () => { runCheck(); });
  } catch (err) {
    log('[CRON] node-cron not found — run: npm install node-cron');
    log('[CRON] Falling back to single check mode');
    runCheck().then(() => process.exit(0));
  }
}
