// POST /api/music-custom-request — Pro + Studio tier custom track brief intake.
// Logs to music_custom_requests + emails King so he can fire generation in Suno/Udio.
//
// Body: { email, brief, reference_url? }

import { Resend } from 'resend';
import { supabase, resolveMusicSubscription, json } from './_music-helpers.mjs';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const email        = (body.email || '').toLowerCase().trim();
  const brief        = (body.brief || '').trim();
  const referenceUrl = (body.reference_url || '').trim();

  if (!email || brief.length < 20) {
    return json(400, { error: 'brief_too_short', min_chars: 20 });
  }

  // Validate active subscription + tier
  const sub = await resolveMusicSubscription(email);
  if (!sub.ok) return json(403, { error: 'no_active_music_subscription', reason: sub.reason });
  if (sub.tier === 'starter') {
    return json(403, { error: 'starter_tier_not_eligible', upgrade_url: '/music.html#upgrade' });
  }

  // Pro tier: 1 custom request per calendar month. Studio: unlimited.
  if (sub.tier === 'pro') {
    const monthBucket = new Date().toISOString().slice(0, 7);
    const { count: usedThisMonth } = await supabase
      .from('music_custom_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_email', email)
      .gte('requested_at', `${monthBucket}-01T00:00:00Z`);
    if ((usedThisMonth || 0) >= 1) {
      return json(429, { error: 'pro_monthly_custom_used', limit: 1, month: monthBucket });
    }
  }

  const { data: row, error } = await supabase.from('music_custom_requests').insert({
    user_email:          email,
    product_id:          sub.productId,
    stripe_sub_id:       sub.subscriptionId,
    brief,
    reference_track_url: referenceUrl || null,
    status:              'pending',
  }).select().single();

  if (error) return json(500, { error: 'db_insert_failed', detail: error.message });

  // Notify King
  resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to:   'king@crownmediagroup.co',
    subject: `Custom track request — ${email} (${sub.tier})`,
    html: `<div style="font-family:sans-serif;max-width:560px;padding:32px;background:#0d0d14;color:#e8e8f0">
      <h2 style="color:#C9981A;margin-bottom:16px">Custom Track Request</h2>
      <p><strong>Subscriber:</strong> ${email}</p>
      <p><strong>Tier:</strong> ${sub.tier}</p>
      <p><strong>Request ID:</strong> ${row.id}</p>
      ${referenceUrl ? `<p><strong>Reference track:</strong> <a href="${referenceUrl}" style="color:#C9981A">${referenceUrl}</a></p>` : ''}
      <div style="background:#1a1a24;padding:16px;border-radius:8px;margin:16px 0;line-height:1.6">
        ${brief.replace(/\n/g, '<br>')}
      </div>
      <p style="color:#555;font-size:13px;margin-top:24px">Generate in Suno/Udio, upload to kingdom-sound bucket, then PATCH music_custom_requests with delivered_track_id + status='delivered'.</p>
    </div>`,
  }).catch(console.error);

  // Confirmation to subscriber
  resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to:   email,
    subject: 'Your custom track request — Kingdom Sound',
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
      <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
      <h1 style="font-size:22px;font-weight:800;margin-bottom:12px">Custom track request received.</h1>
      <p style="color:#8888aa;margin-bottom:24px;line-height:1.7">We're generating your track now. Expect delivery within 48 hours. We'll email you the moment it's ready.</p>
      <p style="color:#555;font-size:13px">Request ID: ${row.id}</p>
      <p style="color:#333;font-size:12px;margin-top:24px">Crown Media Group &middot; Columbia, SC</p>
    </div>`,
  }).catch(console.error);

  return json(200, { ok: true, request_id: row.id });
};

export const config = { path: '/api/music-custom-request' };
