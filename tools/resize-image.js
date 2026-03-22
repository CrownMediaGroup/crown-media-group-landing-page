/**
 * resize-image.js — Resize any image for social media
 * Usage: node tools/resize-image.js <input> [format]
 * Formats: ig (1080x1080) | story (1080x1920) | fb (1200x630) | x (1200x675)
 * Example: node tools/resize-image.js myPhoto.jpg ig
 * Output: saved next to input as myPhoto-ig.jpg
 */

const sharp = require('sharp');
const path  = require('path');

const SIZES = {
  ig:    { width: 1080, height: 1080 },   // Instagram square
  story: { width: 1080, height: 1920 },   // Stories / Reels cover
  fb:    { width: 1200, height: 630  },   // Facebook / X link preview
  x:     { width: 1200, height: 675  },   // X (Twitter)
  wide:  { width: 1920, height: 1080 },   // Landscape / YouTube thumb
};

const [,, input, format = 'ig'] = process.argv;

if (!input) {
  console.log('Usage: node tools/resize-image.js <input> [ig|story|fb|x|wide]');
  console.log('Sizes:', Object.entries(SIZES).map(([k,v]) => `${k}=${v.width}x${v.height}`).join(' | '));
  process.exit(0);
}

const size = SIZES[format];
if (!size) { console.error(`Unknown format "${format}". Options: ${Object.keys(SIZES).join(', ')}`); process.exit(1); }

const ext    = path.extname(input);
const base   = input.slice(0, -ext.length);
const output = `${base}-${format}${ext}`;

sharp(input)
  .resize(size.width, size.height, { fit: 'cover', position: 'center' })
  .jpeg({ quality: 90 })
  .toFile(output)
  .then(() => console.log(`Done: ${output} (${size.width}x${size.height})`))
  .catch(e => { console.error('Error:', e.message); process.exit(1); });
