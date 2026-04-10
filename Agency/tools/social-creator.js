/**
 * social-creator.js — Ultimate Social Content Creation + Posting Engine
 * Crown Media Group | All Glory to Jesus Global LLC
 *
 * Pipeline: topic → Claude captions → ffmpeg video → browser preview → approve → post all platforms
 *
 * Usage:
 *   node Agency/tools/social-creator.js --topic "Crown Media is the best AI agency in Columbia SC"
 *   node Agency/tools/social-creator.js --topic "Shatiea juice launch" --client shatiea --video
 *   node Agency/tools/social-creator.js --topic "..." --platform instagram --dry-run
 *   node Agency/tools/social-creator.js --topic "..." --video --orientation square
 *
 * Flags:
 *   --topic <string>          REQUIRED. What to post about.
 *   --client <crown|shatiea>  Brand context. Default: crown
 *   --video                   Create a 30-sec Ken Burns slideshow video via ffmpeg
 *   --platform <platform>     instagram|facebook|x|tiktok|all  Default: all
 *   --image <path>            Override brand image. Optional.
 *   --text <string>           Video text overlay. Default: derived from topic.
 *   --orientation <portrait|square>  Video dimensions. Default: portrait (1080x1920)
 *   --dry-run                 Generate + preview, do NOT actually post
 *   --skip-preview            Skip browser preview gate (for automation/runner)
 *   --auto-approve            Skip approval gate entirely — post immediately after generating
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const path     = require('path');
const fs       = require('fs');
const os       = require('os');
const readline = require('readline');
const { execSync } = require('child_process');

// ── Brand configs ─────────────────────────────────────────────────────────────
const BRANDS = {
  crown: {
    name: 'Crown Media Group',
    location: 'Columbia, SC',
    handle: '@crownmediagroupco',
    tone: 'bold, direct, faith-infused, no fluff, confident CTA',
    alwaysInclude: ['Columbia SC', 'AI-powered'],
    colors: { primary: '#1a1a2e', accent: '#c9a84c' },
    defaultImages: [
      path.join(__dirname, '../../assets/social/crown-media-post-1-ig.jpg'),
      path.join(__dirname, '../../assets/social/crown-media-post-2-ig.jpg'),
      path.join(__dirname, '../../assets/social/crown-media-post-3-ig.jpg'),
    ],
  },
  shatiea: {
    name: 'Fruit of the Spirit Juice',
    location: 'Columbia, SC',
    handle: '@fruitofthespiritjuice',
    tone: 'faith-driven, warm, clean, community-centered, bold but approachable',
    alwaysInclude: ['faith', 'Columbia'],
    colors: { primary: '#2d5a27', accent: '#f5c842' },
    defaultImages: [
      // Falls back to Crown Media images until Shatiea has dedicated assets
      path.join(__dirname, '../../assets/social/crown-media-post-1-ig.jpg'),
      path.join(__dirname, '../../assets/social/crown-media-post-2-ig.jpg'),
    ],
  },
};

const OUTPUT_DIR = path.join(__dirname, 'output');

// ── Utilities ─────────────────────────────────────────────────────────────────
function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else flags[key] = true;
    }
  }
  return flags;
}

function printUsage() {
  console.log(`
Usage: node Agency/tools/social-creator.js --topic "Your message here" [options]

Options:
  --topic <string>          REQUIRED. What to post about.
  --client <crown|shatiea>  Brand voice. Default: crown
  --video                   Generate 30-sec video via ffmpeg (Ken Burns slideshow)
  --platform <platform>     all|instagram|facebook|x|tiktok  Default: all
  --image <path>            Override source image
  --text <string>           Video overlay text (default: first line of topic)
  --orientation <p|s>       portrait (1080x1920) or square (1080x1080). Default: portrait
  --dry-run                 Preview without posting
  --skip-preview            Skip browser preview gate (automation mode)
`);
}

// ── Step 1: Caption Generation via Claude API ─────────────────────────────────
async function generateCaptions(topic, brand) {
  console.log('[CREATOR] Generating platform-specific captions via Gemini...');

  const prompt = `You are a social media copywriter for a Christian-values marketing agency based in Columbia, SC.

BRAND: ${brand.name}
LOCATION: ${brand.location}
TONE: ${brand.tone}
ALWAYS INCLUDE: ${brand.alwaysInclude.join(', ')} (naturally, where it fits)

TOPIC: ${topic}

Generate one caption per platform. Return ONLY valid JSON — no markdown, no code fences, no extra text, no explanation.

Platform-specific rules:
- instagram: Start with a scroll-stopping hook (first 100 chars matter most — this is what shows before "more"). Add value in the body. End with EXACTLY 5 hashtags — no more, no fewer. Max 2200 chars total. Faith-aligned where it feels natural.
- facebook: Conversational and slightly longer. No hard sell. End with a question or soft CTA to drive comments. 300-500 chars. Max 3 hashtags.
- x: Under 240 chars. One bold idea. Confident. 1-2 hashtags max. Direct CTA or strong statement. No filler.
- tiktok: Trendy opener that hooks the very first line (people scroll fast). Casual, relatable energy. 5-7 hashtags mixing trending tags with niche community tags. Under 300 chars total.
- threads: Conversational and punchy. More personal than Instagram — like a real thought. 1-3 hashtags max. Under 500 chars. Can be a question, take, or short story opener.

Return exactly this JSON shape:
{"instagram":"full caption with hashtags","facebook":"full caption","x":"tweet under 240 chars","tiktok":"trendy caption with hashtags","threads":"threads post under 500 chars"}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200 },
        }),
      }
    );
    const geminiData = await geminiRes.json();
    if (!geminiData.candidates?.[0]) throw new Error(geminiData.error?.message || 'Gemini returned no content');

    const raw = geminiData.candidates[0].content.parts[0].text.trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');

    const captions = JSON.parse(raw);

    // Validate all 5 platforms present
    for (const p of ['instagram', 'facebook', 'x', 'tiktok', 'threads']) {
      if (!captions[p]) throw new Error(`Missing caption for ${p}`);
    }

    console.log('[CREATOR] Captions generated.');
    return captions;

  } catch (e) {
    throw new Error(`[CREATOR] Caption generation failed: ${e.message}`);
  }
}

// ── Step 2: Video Creation via ffmpeg ─────────────────────────────────────────
async function createVideo(brand, overlayText, orientation, outputPath) {
  // Verify ffmpeg is available
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); }
  catch { throw new Error('[CREATOR] ffmpeg not found. Install: winget install Gyan.FFmpeg'); }

  const W = 1080;
  const H = orientation === 'square' ? 1080 : 1920;
  const tmpDir = path.join(os.tmpdir(), `creator-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`[CREATOR] Preparing images for ${W}x${H} ${orientation} video...`);

  // Resize all source images to 2x output (zoom headroom for Ken Burns)
  const sharp = require('sharp');
  const resizedPaths = [];
  for (let i = 0; i < brand.defaultImages.length; i++) {
    const src = brand.defaultImages[i];
    if (!fs.existsSync(src)) continue;
    const dest = path.join(tmpDir, `slide${i}.jpg`);
    await sharp(src)
      .resize(W * 2, H * 2, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 95 })
      .toFile(dest);
    resizedPaths.push(dest);
  }

  if (resizedPaths.length === 0) throw new Error('[CREATOR] No source images found for video generation');

  const fps      = 30;
  const slideDur = 10;  // seconds per slide
  const fadeLen  = 1;   // crossfade length in seconds
  const n        = resizedPaths.length;
  const totalDur = (slideDur * n) - (fadeLen * (n - 1));

  // Ken Burns expressions — alternating zoom-in, zoom-out, pan-right
  const zoomExprs = [
    `z='min(zoom+0.0015,1.3)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `z='if(lte(zoom,1),1.3,max(1,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `z='min(zoom+0.0012,1.25)':x='iw/2-(iw/zoom/2)+t*2':y='ih/2-(ih/zoom/2)'`,
  ];

  // Build filter_complex
  let fc = '';
  for (let i = 0; i < n; i++) {
    fc += `[${i}:v]scale=${W * 2}:${H * 2},zoompan=${zoomExprs[i % 3]}:d=${slideDur * fps}:s=${W}x${H}:fps=${fps}[v${i}];`;
  }

  // Chain xfades between slides
  if (n === 1) {
    fc += `[v0]copy[vfades];`;
  } else if (n === 2) {
    fc += `[v0][v1]xfade=transition=fade:duration=${fadeLen}:offset=${slideDur - fadeLen}[vfades];`;
  } else {
    fc += `[v0][v1]xfade=transition=fade:duration=${fadeLen}:offset=${slideDur - fadeLen}[xf1];`;
    fc += `[xf1][v2]xfade=transition=fade:duration=${fadeLen}:offset=${slideDur * 2 - fadeLen * 2}[vfades];`;
  }

  // Text overlay — fades in over 0.5s starting at (totalDur - 10)
  const textStart = Math.max(0, totalDur - 10);
  const safeText  = overlayText
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\u2019')   // smart apostrophe avoids ffmpeg parse errors
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\n/g, ' ');

  // fontfile: Windows path with escaped colon inside ffmpeg filter
  const fontPath = 'C\\:/Windows/Fonts/Montserrat-Bold.ttf';
  fc += `[vfades]drawtext=fontfile='${fontPath}':text='${safeText}':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=h-220:borderw=3:bordercolor=black@0.8:alpha='if(lt(t,${textStart}),0,if(lt(t,${textStart}+0.5),(t-${textStart})/0.5,1))'[vtext]`;

  // Build input args — each image as a looped stream of slideDur seconds
  const inputs = resizedPaths
    .map(p => `-loop 1 -t ${slideDur} -i "${p.replace(/\\/g, '/')}"`)
    .join(' ');

  const outPath = outputPath.replace(/\\/g, '/');
  const cmd = [
    'ffmpeg -y',
    inputs,
    `-filter_complex "${fc}"`,
    `-map "[vtext]"`,
    `-c:v libx264 -preset fast -crf 22`,
    `-pix_fmt yuv420p`,
    `-r ${fps}`,
    `-t ${totalDur}`,
    `-an`,
    `"${outPath}"`,
  ].join(' ');

  console.log(`[CREATOR] Generating ${totalDur}-second video...`);
  execSync(cmd, { stdio: 'inherit', timeout: 180000 });

  // Cleanup temp
  try { fs.rmSync(tmpDir, { recursive: true }); } catch {}

  console.log(`[CREATOR] Video saved: ${outputPath}`);
  return outputPath;
}

// ── Step 3: Browser Preview ───────────────────────────────────────────────────
async function openPreview(mediaPath, captions, isVideo) {
  const previewPath = path.join(os.tmpdir(), `creator-preview-${Date.now()}.html`);

  // Use file:// URI with forward slashes for browser compatibility
  const mediaSrc = 'file:///' + mediaPath.replace(/\\/g, '/').replace(/^\//, '');

  const mediaTag = isVideo
    ? `<video src="${mediaSrc}" controls autoplay muted loop style="max-width:380px;border-radius:12px;box-shadow:0 4px 24px #000"></video>`
    : `<img src="${mediaSrc}" style="max-width:380px;border-radius:12px;box-shadow:0 4px 24px #000">`;

  const platformColors = {
    instagram: '#e1306c',
    facebook:  '#1877f2',
    x:         '#ffffff',
    tiktok:    '#69c9d0',
    threads:   '#a8a8a8',
  };
  const platformBg = {
    instagram: '#1a0810',
    facebook:  '#0a1628',
    x:         '#0d0d0d',
    tiktok:    '#010d10',
    threads:   '#111111',
  };

  const captionRows = Object.entries(captions).map(([p, t]) => `
    <div style="border-left:4px solid ${platformColors[p]};padding:14px 16px;margin:14px 0;background:${platformBg[p]};border-radius:6px">
      <div style="color:${platformColors[p]};font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">${p} &nbsp;·&nbsp; ${t.length} chars</div>
      <div style="color:#eee;white-space:pre-wrap;font-size:14px;line-height:1.6">${t.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Crown Media — Post Preview</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080808; color: #fff; font-family: -apple-system, system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 20px 60px; }
  h2 { color: #c9a84c; font-size: 20px; margin-bottom: 6px; }
  .sub { color: #666; font-size: 13px; margin-bottom: 24px; }
  .media-wrap { text-align: center; margin-bottom: 28px; }
  .instructions { background: #111; border: 1px solid #333; border-radius: 8px; padding: 16px; margin-top: 24px; color: #aaa; font-size: 13px; line-height: 1.8; }
  .instructions strong { color: #c9a84c; }
  .instructions .cancel { color: #ef4444; }
</style>
</head>
<body>
  <h2>Post Preview — Crown Media Group</h2>
  <p class="sub">Review your content below before posting.</p>
  <div class="media-wrap">${mediaTag}</div>
  ${captionRows}
  <div class="instructions">
    Return to the terminal and:<br>
    Type <strong>y</strong> → Approve and post to all platforms<br>
    Type <strong class="cancel">n</strong> → Cancel without posting<br>
    Type <strong>edit instagram New caption here</strong> → Override any platform's caption
  </div>
</body>
</html>`;

  fs.writeFileSync(previewPath, html, 'utf8');

  // Open in default Windows browser
  try {
    execSync(`start "" "${previewPath.replace(/\//g, '\\')}"`, { stdio: 'ignore' });
    console.log('[CREATOR] Preview opened in browser.');
  } catch {
    console.log(`[CREATOR] Open this file in your browser: ${previewPath}`);
  }

  return previewPath;
}

// ── Step 4: Approval Gate ─────────────────────────────────────────────────────
async function approvalGate(captions) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    console.log('\n' + '═'.repeat(55));
    console.log('APPROVAL — review the preview in your browser.');
    console.log('  y                              → Post now');
    console.log('  n                              → Cancel');
    console.log('  edit instagram <new caption>   → Override');
    console.log('═'.repeat(55));

    const ask = () => {
      rl.question('> ', (ans) => {
        const a = ans.trim();
        const al = a.toLowerCase();

        if (al === 'y' || al === 'yes') {
          rl.close();
          resolve({ approved: true, captions });

        } else if (al === 'n' || al === 'no') {
          rl.close();
          resolve({ approved: false, captions: null });

        } else if (al.startsWith('edit ')) {
          const m = a.match(/^edit\s+(instagram|facebook|x|tiktok)\s+(.+)$/i);
          if (m) {
            captions[m[1].toLowerCase()] = m[2];
            console.log(`[EDIT] ${m[1].toLowerCase()} caption updated.`);
          } else {
            console.log('Format: edit <platform> <new caption text>');
            console.log('Example: edit x Crown Media is live in Columbia SC. #AI #Marketing');
          }
          ask();

        } else {
          console.log('Type y to approve, n to cancel, or: edit <platform> <caption>');
          ask();
        }
      });
    };

    ask();
  });
}

// ── Step 5: Post to all platforms ────────────────────────────────────────────
async function executePost(platforms, captions, imagePath, videoPath, dryRun) {
  // Import post functions from social-post.js (runs silently — no main() side effects)
  const { postInstagram, postFacebook, postX, postTikTok, postThreads } = require('./social-post');

  const results = {};
  const isAll   = platforms === 'all' || platforms.includes('all');

  if (isAll || platforms.includes('instagram')) {
    results.instagram = await postInstagram(captions.instagram, imagePath, dryRun);
  }
  if (isAll || platforms.includes('facebook')) {
    results.facebook = await postFacebook(captions.facebook, imagePath, dryRun);
  }
  if (isAll || platforms.includes('x')) {
    results.x = await postX(captions.x, imagePath, dryRun);
  }
  if (isAll || platforms.includes('tiktok')) {
    if (!videoPath) {
      console.log('[TIKTOK] Skipped — TikTok requires a video. Add --video to create one.');
      results.tiktok = { success: false, reason: 'no_video — use --video flag' };
    } else {
      results.tiktok = await postTikTok(captions.tiktok, videoPath, dryRun);
    }
  }
  if (isAll || platforms.includes('threads')) {
    results.threads = await postThreads(captions.threads, imagePath, dryRun);
  }

  return results;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (!flags.topic) {
    printUsage();
    process.exit(1);
  }

  const topic       = flags.topic;
  const clientKey   = (flags.client || 'crown').toLowerCase();
  const brand       = BRANDS[clientKey] || BRANDS.crown;
  const platforms   = flags.platform || 'all';
  const dryRun      = !!flags['dry-run'];
  const skipPreview = !!flags['skip-preview'] || !!flags['auto-approve'];
  const autoApprove = !!flags['auto-approve'];
  const orientation = flags.orientation === 'square' ? 'square' : 'portrait';
  const overlayText = flags.text || topic.split('.')[0].slice(0, 60); // first sentence, max 60 chars

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('\n' + '═'.repeat(60));
  console.log(`SOCIAL CREATOR | ${brand.name} | ${platforms.toUpperCase()} | ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Topic: ${topic}`);
  console.log('═'.repeat(60));

  // ── 1. Generate captions ────────────────────────────────────────────────────
  let captions;
  if (flags['captions-file'] && fs.existsSync(flags['captions-file'])) {
    const raw = JSON.parse(fs.readFileSync(flags['captions-file'], 'utf8'));
    // Handle both flat {instagram,facebook,...} and wrapped {captions:{...}} formats
    captions = raw.captions || raw;
    console.log('[CREATOR] Loaded captions from file.');
  } else {
    captions = await generateCaptions(topic, brand);
  }

  // Print captions to terminal
  console.log('\n── Generated Captions ───────────────────────────────');
  for (const [p, t] of Object.entries(captions)) {
    console.log(`\n[${p.toUpperCase()}]\n${t}`);
  }
  console.log('\n' + '─'.repeat(52));

  // ── 2. Media ────────────────────────────────────────────────────────────────
  let imagePath = flags.image || brand.defaultImages.find(p => fs.existsSync(p));
  let videoPath = null;

  if (flags.video) {
    const outFile = path.join(OUTPUT_DIR, `creator-${Date.now()}.mp4`);
    videoPath = await createVideo(brand, overlayText, orientation, outFile);
    // For platforms that accept images, use a frame from the video or the first brand image
    // imagePath stays as the brand image (Instagram/Facebook/X post with image)
  }

  if (!imagePath) {
    console.log('[CREATOR] Warning: No image found. Instagram will be skipped.');
  }

  // ── 3. Preview + Approval ───────────────────────────────────────────────────
  if (autoApprove) {
    console.log('[CREATOR] Auto-approve mode — posting immediately.');
  } else if (!skipPreview) {
    const previewMedia = videoPath || imagePath;
    if (previewMedia) {
      await openPreview(previewMedia, captions, !!videoPath);
    } else {
      console.log('[CREATOR] No media to preview — captions shown above.');
    }

    const approval = await approvalGate(captions);
    if (!approval.approved) {
      console.log('[CREATOR] Cancelled. Nothing was posted.');
      process.exit(0);
    }
    // Use potentially edited captions
    Object.assign(captions, approval.captions || {});
  } else if (!autoApprove) {
    // skipPreview but not autoApprove — just proceed
  }

  // ── 4. Post ─────────────────────────────────────────────────────────────────
  const results = await executePost(platforms, captions, imagePath, videoPath, dryRun);

  // ── 5. Results ──────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('[RESULTS]');
  for (const [p, r] of Object.entries(results)) {
    const status = r.dryRun ? 'DRY RUN' : r.success ? 'POSTED' : `FAILED (${r.reason})`;
    console.log(`  ${p.padEnd(12)} → ${status}`);
  }
  console.log('═'.repeat(60));

  // ── 6. Save captions record ─────────────────────────────────────────────────
  const captionsOut = path.join(OUTPUT_DIR, `captions-${Date.now()}.json`);
  // Save flat captions file (platform keys only) so --captions-file reload works correctly
  fs.writeFileSync(captionsOut, JSON.stringify(captions, null, 2));
  console.log(`[CREATOR] Captions saved: ${captionsOut}`);
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
