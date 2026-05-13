// POST /api/music-download — issues a signed download URL for an active subscriber.
// Enforces monthly quota (5 / 20 / unlimited). Logs every download for retention/license trail.
//
// Body: { email, trackId, format ('mp3' | 'wav' | 'stems') }

import { supabase, resolveMusicSubscription, monthlyDownloadsFor, TIER_QUOTAS, json } from './_music-helpers.mjs';

const BUCKET = 'kingdom-sound';
const SIGNED_URL_EXPIRY_SEC = 60 * 30; // 30 minutes

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const email   = (body.email || '').toLowerCase().trim();
  const trackId = parseInt(body.trackId);
  const format  = (body.format || 'mp3').toLowerCase();

  if (!email || !trackId) return json(400, { error: 'missing_email_or_track' });
  if (!['mp3', 'wav', 'stems'].includes(format)) return json(400, { error: 'invalid_format' });

  // 1. Verify active subscription
  const sub = await resolveMusicSubscription(email);
  if (!sub.ok) return json(403, { error: 'no_active_music_subscription', reason: sub.reason });

  // 2. Load track + enforce tier visibility
  const { data: track, error: trackErr } = await supabase
    .from('music_tracks')
    .select('id,title,storage_path,wav_path,stems_path,tier_required,public,duration_sec')
    .eq('id', trackId)
    .single();

  if (trackErr || !track) return json(404, { error: 'track_not_found' });
  if (!track.public) return json(403, { error: 'track_unavailable' });

  const tierOrder = { starter: 1, pro: 2, studio: 3 };
  const requiredLevel = tierOrder[track.tier_required] || 1;
  const userLevel     = tierOrder[sub.tier] || 0;
  if (userLevel < requiredLevel) {
    return json(403, { error: 'tier_too_low', required: track.tier_required, current: sub.tier });
  }

  // 3. Enforce monthly quota (starter/pro). Studio = unlimited.
  const quota = await monthlyDownloadsFor(email);
  const limit = TIER_QUOTAS[sub.tier];
  if (limit !== Infinity && quota.ok && quota.count >= limit) {
    return json(429, {
      error:        'quota_exceeded',
      tier:         sub.tier,
      limit,
      used:         quota.count,
      month:        quota.monthBucket,
      upgrade_url:  '/music.html#upgrade',
    });
  }

  // 4. Pick the right storage path
  const wantedPath = format === 'wav'
    ? track.wav_path
    : format === 'stems'
      ? track.stems_path
      : track.storage_path;

  if (!wantedPath) return json(404, { error: 'format_not_available', format });

  // Stems are studio-only
  if (format === 'stems' && sub.tier !== 'studio') {
    return json(403, { error: 'stems_studio_only' });
  }

  // 5. Issue signed URL
  const { data: signed, error: signErr } = await supabase
    .storage
    .from(BUCKET)
    .createSignedUrl(wantedPath, SIGNED_URL_EXPIRY_SEC);

  if (signErr || !signed?.signedUrl) {
    return json(500, { error: 'sign_failed', detail: signErr?.message });
  }

  // 6. Log the download (drives next-month quota)
  const { error: logErr } = await supabase.from('music_downloads').insert({
    user_email:     email,
    product_id:     sub.productId,
    stripe_sub_id:  sub.subscriptionId,
    track_id:       track.id,
    // license_pdf_path: null    -- v2 will populate this with a generated PDF
  });
  if (logErr) console.error('[MUSIC] download log insert error:', logErr);

  // 7. Build inline license text (lightweight v1; PDF generator is a Phase 2 item)
  const license = {
    track_id:        track.id,
    track_title:     track.title,
    licensee:        email,
    license_date:    new Date().toISOString(),
    rights:          'Perpetual non-exclusive worldwide license to use this track in commercial and non-commercial video, audio, podcast, and digital content. Re-sale or re-distribution of the underlying audio file is not permitted.',
    platforms:       'YouTube, Instagram, TikTok, Reels, Shorts, Vimeo, podcasts, websites, paid ads',
    issued_by:       'Crown Media Group (All Glory to Jesus Global LLC)',
    license_id:      `KSL-${track.id}-${Date.now().toString(36)}`,
  };

  return json(200, {
    track_id:    track.id,
    title:       track.title,
    format,
    download_url: signed.signedUrl,
    expires_in_seconds: SIGNED_URL_EXPIRY_SEC,
    license,
    quota: {
      tier:      sub.tier,
      used:      (quota.count || 0) + 1,
      limit:     limit === Infinity ? null : limit,
      remaining: limit === Infinity ? null : Math.max(0, limit - (quota.count || 0) - 1),
    },
  });
};

export const config = { path: '/api/music-download' };
