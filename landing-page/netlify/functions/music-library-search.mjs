// GET /api/music-library — paginated track list with filters.
// Returns metadata only (no signed URLs). Gating happens at /api/music-download.
//
// Query params:
//   email          (required) — caller's subscription email
//   genre          (optional) — filter by genre
//   mood           (optional) — filter by mood
//   q              (optional) — title/tag search
//   page           (optional) — default 1
//   per_page       (optional) — default 24, max 60

import { supabase, resolveMusicSubscription, monthlyDownloadsFor, TIER_QUOTAS, json } from './_music-helpers.mjs';

export default async (req) => {
  const url      = new URL(req.url);
  const email    = (url.searchParams.get('email') || '').toLowerCase().trim();
  const genre    = url.searchParams.get('genre');
  const mood     = url.searchParams.get('mood');
  const q        = url.searchParams.get('q');
  const page     = Math.max(1,  parseInt(url.searchParams.get('page'))     || 1);
  const perPage  = Math.min(60, Math.max(1, parseInt(url.searchParams.get('per_page')) || 24));

  // Validate subscription FIRST — no email = no library
  const sub = await resolveMusicSubscription(email);
  if (!sub.ok) return json(403, { error: 'no_active_music_subscription', reason: sub.reason });

  // Tier-gated catalog: starter sees only starter-tier tracks, pro sees starter+pro, studio sees everything
  const tierVisibility = sub.tier === 'studio'
    ? ['starter', 'pro', 'studio']
    : sub.tier === 'pro'
      ? ['starter', 'pro']
      : ['starter'];

  let query = supabase
    .from('music_tracks')
    .select('id,title,genre,mood,bpm,duration_sec,tier_required,description,tags,source_platform,created_at', { count: 'exact' })
    .eq('public', true)
    .in('tier_required', tierVisibility)
    .order('created_at', { ascending: false });

  if (genre) query = query.eq('genre', genre);
  if (mood)  query = query.eq('mood',  mood);
  if (q)     query = query.ilike('title', `%${q}%`);

  const from = (page - 1) * perPage;
  const to   = from + perPage - 1;
  const { data: tracks, count, error } = await query.range(from, to);

  if (error) return json(500, { error: 'db_error', detail: error.message });

  // Annotate with quota state
  const quota = await monthlyDownloadsFor(email);
  const limit = TIER_QUOTAS[sub.tier];
  const used  = quota.ok ? quota.count : 0;

  return json(200, {
    tier:        sub.tier,
    quota: {
      used,
      limit:     limit === Infinity ? null : limit,
      remaining: limit === Infinity ? null : Math.max(0, limit - used),
      month:     quota.monthBucket,
    },
    pagination: {
      page,
      per_page: perPage,
      total:    count || 0,
      pages:    Math.ceil((count || 0) / perPage),
    },
    tracks: tracks || [],
  });
};

export const config = { path: '/api/music-library' };
