/**
 * thumbnail-generator.js — Auto-generate YouTube thumbnails that rival top creators
 *
 * 3 brand templates:
 *   A: "Dark Statement"  — Diary of a CEO style (default, most versatile)
 *   B: "Bold Number"     — MrBeast style (used when title has a $ or number)
 *   C: "Revelation"      — Dan Martell style (used for How/Why/What questions)
 *
 * Output: 1280×720 PNG, wired into blog-to-video.js pipeline
 * Crown Media Group | @mkdavidking
 */

import sharp from 'sharp';
import { join, dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { VIDEO_OUT } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Brand constants ────────────────────────────────────────────────────────────
const B = {
  navy:       '#060C18',
  navyMid:    '#0D1829',
  navyLight:  '#1A2840',
  gold:       '#D4A84B',
  goldBright: '#F0C060',
  goldDim:    '#8A6520',
  white:      '#FFFFFF',
  offWhite:   '#EEF2FF',
  red:        '#E53E3E',
  royalPurple:'#2D1B69',
};

// ── Font stack ─────────────────────────────────────────────────────────────────
// System fonts that render cleanly in Sharp's SVG engine on Windows
const HEADLINE_FONT = `'Impact', 'Arial Black', 'Helvetica Neue', Arial, sans-serif`;
const BODY_FONT     = `'Arial Black', 'Helvetica Neue', Arial, sans-serif`;
const BRAND_FONT    = `'Georgia', 'Times New Roman', serif`;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Wrap text into lines that fit within maxChars.
 * Returns array of strings, max 3 lines for headline.
 */
function wrapText(text, maxChars = 22, maxLines = 3) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
      if (lines.length >= maxLines - 1) {
        // Last line — dump remaining words
        const rest = words.slice(words.indexOf(word)).join(' ');
        if (rest.length > maxChars + 8) {
          lines.push(rest.slice(0, maxChars + 5) + '…');
        } else {
          lines.push(rest);
        }
        return lines.slice(0, maxLines);
      }
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, maxLines);
}

/**
 * Detect which template to use from title.
 */
function detectTemplate(title) {
  const t = title.toLowerCase();
  const hasNumber = /\$[\d,]+|^\d+\s|\s\d+\s|\d+%|\bthe \d|\b\d{1,2}\s+(ways|tips|steps|signs|secrets|reasons|mistakes)/i.test(title);
  const hasQuestion = /^(how|why|what|when|is |are |can |do |does |will |should )/i.test(t);
  if (hasNumber) return 'B';
  if (hasQuestion) return 'C';
  return 'A';
}

/**
 * Extract the most visually impactful word/phrase to highlight in gold.
 * Looks for numbers, power words, dollar amounts.
 */
function findHighlight(title) {
  const money = title.match(/\$[\d,]+[kKmM]?/);
  if (money) return money[0];
  const num = title.match(/\b\d+\b/);
  if (num) return num[0];
  const power = ['secret', 'mistake', 'truth', 'real', 'actual', 'hidden', 'exposed', 'dead', 'failed', 'win', 'lose', 'broke', 'rich', 'free', 'fast'];
  for (const p of power) {
    const re = new RegExp(`\\b${p}\\w*\\b`, 'i');
    const m  = title.match(re);
    if (m) return m[0];
  }
  return null;
}

/**
 * Extract category label for badge (short, uppercase).
 */
function categoryLabel(category = 'Marketing') {
  const map = {
    'Marketing':      'MARKETING',
    'SEO':            'SEO',
    'Social Media':   'SOCIAL MEDIA',
    'Local Business': 'LOCAL BIZ',
    'Faith & Business': 'FAITH + BUSINESS',
    'AI Tools':       'AI TOOLS',
    'Case Studies':   'CASE STUDY',
  };
  return map[category] || category.toUpperCase().slice(0, 16);
}

// ── SVG TEMPLATES ──────────────────────────────────────────────────────────────

/**
 * Template A: "Dark Statement"
 * Full dark luxury background, gold accent bar left, bold white headline,
 * gold subheadline, Crown Media brand mark bottom-right.
 * Rival: Diary of a CEO, Steven Bartlett
 */
function templateA(title, subtitle, category, highlight) {
  const lines = wrapText(title, 20, 3);
  const lineCount = lines.length;
  const fontSize = lineCount === 1 ? 120 : lineCount === 2 ? 95 : 74;
  const lineHeight = fontSize * 1.1;
  const blockH = lineCount * lineHeight;
  const blockY = (720 - blockH) / 2 - 20;

  // Build headline SVG — highlight one word in gold
  const hlWord = highlight ? highlight.toLowerCase() : null;
  const headlineSvg = lines.map((line, i) => {
    const y = blockY + i * lineHeight + fontSize;
    // Check if this line contains the highlight word
    if (hlWord && line.toLowerCase().includes(hlWord)) {
      const idx = line.toLowerCase().indexOf(hlWord);
      const before = line.slice(0, idx);
      const hl     = line.slice(idx, idx + hlWord.length);
      const after  = line.slice(idx + hlWord.length);
      return `
        <text x="108" y="${y}" font-family="${HEADLINE_FONT}" font-size="${fontSize}" font-weight="900" fill="${B.white}" text-anchor="start" letter-spacing="-1">
          ${before && `<tspan fill="${B.white}">${escSVG(before)}</tspan>`}
          <tspan fill="${B.goldBright}">${escSVG(hl)}</tspan>
          ${after && `<tspan fill="${B.white}">${escSVG(after)}</tspan>`}
        </text>`;
    }
    return `<text x="108" y="${y}" font-family="${HEADLINE_FONT}" font-size="${fontSize}" font-weight="900" fill="${B.white}" text-anchor="start" letter-spacing="-1">${escSVG(line)}</text>`;
  }).join('\n');

  const catLabel = categoryLabel(category);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <!-- Dark luxury gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#04080F"/>
      <stop offset="50%"  stop-color="#0A1220"/>
      <stop offset="100%" stop-color="#06091A"/>
    </linearGradient>
    <!-- Gold radial glow behind text -->
    <radialGradient id="glow" cx="30%" cy="50%" r="55%">
      <stop offset="0%"   stop-color="#1A2840" stop-opacity="1"/>
      <stop offset="100%" stop-color="#04080F" stop-opacity="1"/>
    </radialGradient>
    <!-- Gold shimmer gradient for accent bar -->
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="${B.goldBright}"/>
      <stop offset="50%"  stop-color="${B.gold}"/>
      <stop offset="100%" stop-color="${B.goldDim}"/>
    </linearGradient>
    <!-- Right fade for visual depth -->
    <linearGradient id="rightFade" x1="60%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#04080F" stop-opacity="0"/>
      <stop offset="100%" stop-color="#020408" stop-opacity="1"/>
    </linearGradient>
    <!-- Subtle dot pattern -->
    <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <circle cx="20" cy="20" r="1" fill="${B.gold}" fill-opacity="0.07"/>
    </pattern>
  </defs>

  <!-- Background layers -->
  <rect width="1280" height="720" fill="url(#bgGrad)"/>
  <rect width="1280" height="720" fill="url(#glow)"/>
  <rect width="1280" height="720" fill="url(#dots)"/>

  <!-- Right-side depth fade -->
  <rect x="0" y="0" width="1280" height="720" fill="url(#rightFade)"/>

  <!-- Gold accent bar — left edge, full height -->
  <rect x="0" y="0" width="8" height="720" fill="url(#barGrad)"/>

  <!-- Subtle horizontal lines for texture -->
  <line x1="100" y1="160" x2="750" y2="160" stroke="${B.gold}" stroke-width="1" stroke-opacity="0.15"/>
  <line x1="100" y1="${blockY + blockH + 48}" x2="680" y2="${blockY + blockH + 48}" stroke="${B.gold}" stroke-width="1" stroke-opacity="0.15"/>

  <!-- Category badge (top left) -->
  <rect x="100" y="72" width="${catLabel.length * 13 + 24}" height="34" rx="4" fill="${B.gold}" fill-opacity="0.15" stroke="${B.gold}" stroke-width="1" stroke-opacity="0.6"/>
  <text x="112" y="95" font-family="${BODY_FONT}" font-size="14" font-weight="700" fill="${B.gold}" letter-spacing="2">${escSVG(catLabel)}</text>

  <!-- Main headline -->
  ${headlineSvg}

  <!-- Subtitle (if provided) -->
  ${subtitle ? `<text x="108" y="${blockY + blockH + 36}" font-family="${BODY_FONT}" font-size="30" font-weight="700" fill="${B.gold}" fill-opacity="0.9" letter-spacing="1">${escSVG(subtitle.slice(0, 55))}</text>` : ''}

  <!-- Crown Media brand mark — bottom right -->
  <text x="1175" y="690" font-family="${BRAND_FONT}" font-size="18" font-weight="700" fill="${B.gold}" fill-opacity="0.8" text-anchor="end" letter-spacing="2">CROWN MEDIA GROUP</text>
  <line x1="1050" y1="672" x2="1175" y2="672" stroke="${B.gold}" stroke-width="0.75" stroke-opacity="0.35"/>

  <!-- Subtle corner decoration -->
  <rect x="1180" y="40" width="60" height="3" fill="${B.gold}" fill-opacity="0.4" rx="2"/>
  <rect x="1237" y="40" width="3" height="60" fill="${B.gold}" fill-opacity="0.4" rx="2"/>
</svg>`;
}

/**
 * Template B: "Bold Number"
 * Massive number/dollar centered, supporting text, intense glow.
 * Rival: MrBeast, finance/business creators
 */
function templateB(title, subtitle, category, highlight) {
  const isNumber = highlight && /[\d$]/.test(highlight);
  const bigText  = isNumber ? highlight : (highlight || title.split(' ')[0]);
  const restText = title.replace(highlight || '', '').trim();
  const lines    = wrapText(restText || title, 24, 2);
  const catLabel = categoryLabel(category);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#06040E"/>
      <stop offset="100%" stop-color="#0A1422"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#2A1A00" stop-opacity="1"/>
      <stop offset="60%"  stop-color="#0A0D18" stop-opacity="1"/>
      <stop offset="100%" stop-color="#06040E" stop-opacity="1"/>
    </radialGradient>
    <radialGradient id="goldGlow" cx="50%" cy="42%" r="35%">
      <stop offset="0%"   stop-color="${B.gold}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${B.gold}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="${B.goldBright}"/>
      <stop offset="50%"  stop-color="${B.gold}"/>
      <stop offset="100%" stop-color="${B.goldDim}"/>
    </linearGradient>
  </defs>

  <rect width="1280" height="720" fill="url(#bgGrad)"/>
  <rect width="1280" height="720" fill="url(#centerGlow)"/>
  <rect width="1280" height="720" fill="url(#goldGlow)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1280" height="6" fill="url(#barGrad)"/>

  <!-- Big number/highlight — center stage -->
  <text x="640" y="390" font-family="${HEADLINE_FONT}" font-size="260" font-weight="900" fill="${B.goldBright}" text-anchor="middle" letter-spacing="-6" opacity="0.95">${escSVG(bigText)}</text>

  <!-- Outline/shadow for depth -->
  <text x="643" y="393" font-family="${HEADLINE_FONT}" font-size="260" font-weight="900" fill="none" stroke="${B.navy}" stroke-width="3" text-anchor="middle" letter-spacing="-6" opacity="0.5">${escSVG(bigText)}</text>

  <!-- Supporting text lines below number -->
  ${lines.map((line, i) => `<text x="640" y="${440 + i * 72}" font-family="${HEADLINE_FONT}" font-size="64" font-weight="900" fill="${B.white}" text-anchor="middle" letter-spacing="-1">${escSVG(line)}</text>`).join('\n  ')}

  <!-- Category badge -->
  <rect x="${640 - catLabel.length * 6.5 - 12}" y="88" width="${catLabel.length * 13 + 24}" height="34" rx="4" fill="${B.gold}" fill-opacity="0.15" stroke="${B.gold}" stroke-width="1" stroke-opacity="0.5"/>
  <text x="640" y="111" font-family="${BODY_FONT}" font-size="14" font-weight="700" fill="${B.gold}" text-anchor="middle" letter-spacing="2">${escSVG(catLabel)}</text>

  <!-- Brand mark bottom -->
  <text x="640" y="690" font-family="${BRAND_FONT}" font-size="18" font-weight="700" fill="${B.gold}" fill-opacity="0.7" text-anchor="middle" letter-spacing="3">CROWN MEDIA GROUP</text>

  <!-- Corner decoration left -->
  <rect x="40" y="40" width="60" height="3" fill="${B.gold}" fill-opacity="0.35" rx="2"/>
  <rect x="40" y="40" width="3" height="60" fill="${B.gold}" fill-opacity="0.35" rx="2"/>
  <!-- Corner decoration right -->
  <rect x="1180" y="40" width="60" height="3" fill="${B.gold}" fill-opacity="0.35" rx="2"/>
  <rect x="1237" y="40" width="3" height="60" fill="${B.gold}" fill-opacity="0.35" rx="2"/>
</svg>`;
}

/**
 * Template C: "Revelation" / Question-hook
 * Split background. Bold question left. Gold callout box right with key phrase.
 * Rival: Dan Martell, Alex Hormozi, business educators
 */
function templateC(title, subtitle, category, highlight) {
  const lines    = wrapText(title, 18, 3);
  const lineCount = lines.length;
  const fontSize = lineCount === 1 ? 100 : lineCount === 2 ? 80 : 63;
  const lineHeight = fontSize * 1.12;
  const blockH   = lineCount * lineHeight;
  const blockY   = (720 - blockH) / 2 - 30;
  const catLabel = categoryLabel(category);

  // Key callout for right panel
  const callout  = highlight || subtitle || 'FREE';
  const calloutLines = wrapText(callout, 14, 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <linearGradient id="bgLeft" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#04080F"/>
      <stop offset="100%" stop-color="#0D1829"/>
    </linearGradient>
    <linearGradient id="bgRight" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#0D1829"/>
      <stop offset="100%" stop-color="#0F1C38"/>
    </linearGradient>
    <linearGradient id="divider" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="${B.goldBright}" stop-opacity="0"/>
      <stop offset="30%"  stop-color="${B.gold}"/>
      <stop offset="70%"  stop-color="${B.gold}"/>
      <stop offset="100%" stop-color="${B.goldDim}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="${B.goldBright}"/>
      <stop offset="100%" stop-color="${B.goldDim}"/>
    </linearGradient>
    <radialGradient id="rightGlow" cx="75%" cy="50%" r="40%">
      <stop offset="0%"   stop-color="#D4A84B" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#D4A84B" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow-filter">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Background split -->
  <rect x="0"   y="0" width="780"  height="720" fill="url(#bgLeft)"/>
  <rect x="780" y="0" width="500"  height="720" fill="url(#bgRight)"/>
  <rect width="1280" height="720" fill="url(#rightGlow)"/>

  <!-- Gold divider line -->
  <rect x="774" y="0" width="3" height="720" fill="url(#divider)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="7" height="720" fill="url(#barGrad)"/>

  <!-- Category badge left -->
  <rect x="80" y="64" width="${catLabel.length * 12 + 24}" height="32" rx="4" fill="${B.gold}" fill-opacity="0.15" stroke="${B.gold}" stroke-width="1" stroke-opacity="0.55"/>
  <text x="92" y="86" font-family="${BODY_FONT}" font-size="13" font-weight="700" fill="${B.gold}" letter-spacing="2">${escSVG(catLabel)}</text>

  <!-- Main headline LEFT -->
  ${lines.map((line, i) => `<text x="80" y="${blockY + i * lineHeight + fontSize}" font-family="${HEADLINE_FONT}" font-size="${fontSize}" font-weight="900" fill="${B.white}" letter-spacing="-1">${escSVG(line)}</text>`).join('\n  ')}

  <!-- Subtitle below headline -->
  ${subtitle ? `<text x="80" y="${blockY + blockH + 42}" font-family="${BODY_FONT}" font-size="28" font-weight="700" fill="${B.gold}" fill-opacity="0.88">${escSVG(subtitle.slice(0, 48))}</text>` : ''}

  <!-- RIGHT panel — callout box -->
  <rect x="840" y="200" width="380" height="320" rx="12" fill="${B.gold}" fill-opacity="0.1" stroke="${B.goldBright}" stroke-width="2" stroke-opacity="0.6"/>

  <!-- Callout top bar -->
  <rect x="840" y="200" width="380" height="6" rx="3" fill="${B.goldBright}" fill-opacity="0.8"/>

  ${calloutLines.map((line, i) => `<text x="1030" y="${300 + i * 90}" font-family="${HEADLINE_FONT}" font-size="${calloutLines.length === 1 ? 80 : 66}" font-weight="900" fill="${B.goldBright}" text-anchor="middle" letter-spacing="-1">${escSVG(line)}</text>`).join('\n  ')}

  <!-- Callout sub label -->
  <text x="1030" y="480" font-family="${BODY_FONT}" font-size="22" font-weight="700" fill="${B.white}" fill-opacity="0.55" text-anchor="middle" letter-spacing="2">WATCH THIS</text>

  <!-- Brand mark bottom right -->
  <text x="1240" y="690" font-family="${BRAND_FONT}" font-size="16" font-weight="700" fill="${B.gold}" fill-opacity="0.7" text-anchor="end" letter-spacing="2">CROWN MEDIA GROUP</text>
</svg>`;
}

// ── XML escape helper ──────────────────────────────────────────────────────────
function escSVG(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Generate a branded YouTube thumbnail for the given post.
 *
 * @param {string} title      - Video title
 * @param {string} slug       - Post slug (used for output filename)
 * @param {string} category   - Post category
 * @param {string} [subtitle] - Optional subtitle / key insight (max 55 chars)
 * @returns {Promise<string>} - Absolute path to 1280×720 PNG
 */
export async function generateThumbnail(title, slug, category = 'Marketing', subtitle = '') {
  const outDir = VIDEO_OUT;
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${slug}-thumbnail.png`);

  const template  = detectTemplate(title);
  const highlight = findHighlight(title);

  let svg;
  if (template === 'B') {
    svg = templateB(title, subtitle, category, highlight);
  } else if (template === 'C') {
    svg = templateC(title, subtitle, category, highlight);
  } else {
    svg = templateA(title, subtitle, category, highlight);
  }

  console.log(`  [Thumbnail] Template ${template} — "${title.slice(0, 60)}"`);

  await sharp(Buffer.from(svg))
    .resize(1280, 720)
    .png({ quality: 95 })
    .toFile(outPath);

  console.log(`  [Thumbnail] → ${outPath}`);
  return outPath;
}
