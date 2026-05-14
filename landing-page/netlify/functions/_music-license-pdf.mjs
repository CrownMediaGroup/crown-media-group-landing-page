// _music-license-pdf.mjs — generate a one-page PDF license certificate per download.
// Uploads to the kingdom-sound bucket under licenses/<license_id>.pdf and returns a signed URL.
// If anything fails (PDF gen, upload, signing) the caller falls back to the inline JSON license.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { supabase } from './_music-helpers.mjs';

const BUCKET = 'kingdom-sound';
const SIGNED_URL_EXPIRY_SEC = 60 * 60 * 24 * 365; // 1 year — license is meant to be permanent
const BRAND_NAVY = rgb(0.10, 0.10, 0.24);  // matches --royal #1A1A3E
const BRAND_GOLD = rgb(0.79, 0.60, 0.10);  // matches --gold  #C9981A
const TEXT_DARK  = rgb(0.10, 0.10, 0.18);
const TEXT_MID   = rgb(0.29, 0.29, 0.42);

/**
 * Build a one-page license PDF and upload it. Returns a signed URL or null on failure.
 *
 * @param {object} opts
 * @param {string} opts.licenseId
 * @param {string} opts.licensee
 * @param {object} opts.track  { id, title }
 * @param {string} opts.tier   starter|pro|studio
 * @param {Date}   opts.issuedAt
 * @returns {Promise<string|null>}
 */
export async function buildAndUploadLicensePdf({ licenseId, licensee, track, tier, issuedAt }) {
  try {
    const pdfDoc = await PDFDocument.create();
    const page   = pdfDoc.addPage([612, 792]);                // 8.5" × 11" in points
    const helv     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // ── Gold accent bar across the top ──────────────────────────────────────
    page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: BRAND_NAVY });
    page.drawRectangle({ x: 0, y: 748, width: 612, height: 4,  color: BRAND_GOLD });

    page.drawText('CROWN MEDIA GROUP', {
      x: 40, y: 768, size: 11, font: helvBold, color: rgb(0.91, 0.72, 0.20), // gold-light
    });
    page.drawText('Kingdom Sound', {
      x: 460, y: 766, size: 14, font: helvBold, color: rgb(1, 1, 1),
    });

    // ── Title ───────────────────────────────────────────────────────────────
    page.drawText('Music License Certificate', {
      x: 40, y: 700, size: 28, font: helvBold, color: TEXT_DARK,
    });
    page.drawText('Perpetual non-exclusive worldwide commercial license', {
      x: 40, y: 676, size: 11, font: helv, color: TEXT_MID,
    });
    // gold underline
    page.drawRectangle({ x: 40, y: 668, width: 220, height: 2, color: BRAND_GOLD });

    // ── License details ─────────────────────────────────────────────────────
    let y = 620;
    const labelSize = 9;
    const valueSize = 12;
    const lineGap   = 32;

    const fields = [
      ['LICENSE ID',     licenseId],
      ['LICENSEE',       licensee],
      ['TRACK',          `#${track.id} — ${track.title}`],
      ['SUBSCRIPTION TIER', tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '—'],
      ['DATE ISSUED',    issuedAt.toISOString().slice(0, 10)],
    ];

    for (const [label, value] of fields) {
      page.drawText(label, { x: 40, y, size: labelSize, font: helvBold, color: TEXT_MID });
      page.drawText(String(value), { x: 40, y: y - 14, size: valueSize, font: helv, color: TEXT_DARK });
      y -= lineGap;
    }

    // ── Rights granted ──────────────────────────────────────────────────────
    y -= 12;
    page.drawText('RIGHTS GRANTED', { x: 40, y, size: labelSize, font: helvBold, color: TEXT_MID });
    y -= 18;
    const rightsText = [
      'The Licensee is granted a perpetual, non-exclusive, worldwide license to use the track named',
      'above as part of audiovisual content including (but not limited to): YouTube videos, Instagram',
      'Reels, TikTok videos, Facebook Reels, YouTube Shorts, Vimeo content, podcasts, websites, paid',
      'advertisements, corporate video, livestreams, and digital media. This license survives',
      'cancellation of the Licensee\'s subscription for content created during the active subscription',
      'period.',
    ];
    for (const line of rightsText) {
      page.drawText(line, { x: 40, y, size: 10.5, font: helv, color: TEXT_DARK });
      y -= 16;
    }

    // ── Restrictions ────────────────────────────────────────────────────────
    y -= 14;
    page.drawText('RESTRICTIONS', { x: 40, y, size: labelSize, font: helvBold, color: TEXT_MID });
    y -= 18;
    const restrictionsText = [
      'Re-sale, sub-licensing, or re-distribution of the underlying audio file is prohibited. The track',
      'may not be uploaded to royalty-free or stock-music platforms. The Licensee may not register',
      'the track with any content-identification system (YouTube Content ID, etc.) as their own work.',
    ];
    for (const line of restrictionsText) {
      page.drawText(line, { x: 40, y, size: 10.5, font: helv, color: TEXT_DARK });
      y -= 16;
    }

    // ── Content ID guarantee ────────────────────────────────────────────────
    y -= 14;
    page.drawText('CONTENT ID GUARANTEE', { x: 40, y, size: labelSize, font: helvBold, color: TEXT_MID });
    y -= 18;
    const guaranteeText = [
      'If this track is ever matched by YouTube Content ID or similar systems, Crown Media Group',
      'will swap it with a different track of equivalent value at no cost and assist the Licensee',
      'with the dispute. Reach out to king@crownmediagroup.co with the affected video URL.',
    ];
    for (const line of guaranteeText) {
      page.drawText(line, { x: 40, y, size: 10.5, font: helv, color: TEXT_DARK });
      y -= 16;
    }

    // ── Footer ──────────────────────────────────────────────────────────────
    page.drawRectangle({ x: 40, y: 88, width: 532, height: 0.6, color: rgb(0.85, 0.85, 0.85) });
    page.drawText('Issued by:', { x: 40, y: 70, size: 9, font: helvBold, color: TEXT_MID });
    page.drawText('Crown Media Group · All Glory to Jesus Global LLC · Columbia, SC · USA',
      { x: 40, y: 56, size: 10, font: helv, color: TEXT_DARK });
    page.drawText('king@crownmediagroup.co · crownmediagroup.co',
      { x: 40, y: 42, size: 9.5, font: helv, color: TEXT_MID });
    page.drawText('"Whatever you do, work heartily, as for the Lord and not for men." — Colossians 3:23',
      { x: 40, y: 22, size: 8.5, font: helv, color: rgb(0.55, 0.55, 0.68) });

    // ── Build + upload ──────────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    const storagePath = `licenses/${licenseId}.pdf`;

    const { error: uploadErr } = await supabase
      .storage
      .from(BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadErr && !/already exists/i.test(uploadErr.message || '')) {
      console.error('[LICENSE_PDF] upload error:', uploadErr.message);
      return null;
    }

    const { data: signed, error: signErr } = await supabase
      .storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SEC);

    if (signErr || !signed?.signedUrl) {
      console.error('[LICENSE_PDF] sign error:', signErr?.message);
      return null;
    }

    return { signedUrl: signed.signedUrl, storagePath };
  } catch (err) {
    console.error('[LICENSE_PDF] unexpected error:', err.message);
    return null;
  }
}
