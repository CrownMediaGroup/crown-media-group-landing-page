// POST /api/music-intake — receives the project brief for custom / original / bundle orders.
// Updates the music_orders row with intake_brief + intake_metadata + notifies King.

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const email   = (body.email || '').toLowerCase().trim();
  const orderId = body.order_id ? parseInt(body.order_id) : null;
  const productType = (body.product_type || 'custom').toLowerCase();

  if (!email || !email.includes('@')) return json(400, { error: 'invalid_email' });

  // ── AUTH: must be tied to a paid order on this email, OR rate-limited ──
  // Pre-payment briefs are no longer accepted from unverified emails — too much
  // spam exposure on the custom/original tiers.
  let order = null;
  if (orderId) {
    const { data } = await supabase
      .from('music_orders')
      .select('id, user_email, status, product_type')
      .eq('id', orderId)
      .eq('user_email', email)
      .maybeSingle();
    if (!data || data.status !== 'paid') {
      return json(403, { error: 'order_not_found_or_unpaid', detail: 'Submit your brief from the link in your post-purchase confirmation email.' });
    }
    order = data;
  } else {
    // No order_id provided — only allow if the email has at least one paid music order
    const { data: anyPaid } = await supabase
      .from('music_orders')
      .select('id')
      .eq('user_email', email)
      .eq('status', 'paid')
      .limit(1)
      .maybeSingle();
    if (!anyPaid) {
      return json(403, { error: 'no_paid_order', detail: 'You need a paid order before submitting a brief. Check your inbox for the link from your purchase confirmation.' });
    }
  }

  // ── RATE LIMIT: one brief per email per hour ──────────────────────────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from('music_orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_email', email)
    .gte('updated_at', oneHourAgo)
    .not('intake_brief', 'is', null);
  if ((recentCount || 0) >= 2) {
    return json(429, { error: 'rate_limited', detail: 'Too many briefs in the last hour. Try again later or text (908) 848-1436.' });
  }

  // Build a human-readable brief text + structured metadata
  const briefLines = [];
  const skip = ['order_id', 'product_type', 'email'];
  for (const [k, v] of Object.entries(body)) {
    if (skip.includes(k)) continue;
    if (v && String(v).trim()) briefLines.push(`${k.replace(/_/g, ' ').toUpperCase()}: ${v}`);
  }
  const briefText = briefLines.join('\n');

  // Update the verified order with the brief
  if (order) {
    const { data } = await supabase
      .from('music_orders')
      .update({ intake_brief: briefText, intake_metadata: body, updated_at: new Date().toISOString() })
      .eq('id', order.id)
      .eq('user_email', email)
      .select().single();
    order = data || order;
  } else {
    // No specific orderId, but customer has paid orders — attach to most recent unbrief'd one
    const { data } = await supabase
      .from('music_orders')
      .select('id')
      .eq('user_email', email)
      .eq('status', 'paid')
      .is('intake_brief', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) {
      const { data: updated } = await supabase
        .from('music_orders')
        .update({ intake_brief: briefText, intake_metadata: body, updated_at: new Date().toISOString() })
        .eq('id', data.id)
        .eq('user_email', email)
        .select().single();
      order = updated;
    } else {
      return json(409, { error: 'no_open_order', detail: 'Every paid order on this email already has a brief. Reply to the original confirmation email to add notes.' });
    }
  }

  // Notify King
  resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to:   'king@crownmediagroup.co',
    subject: `Project brief — ${productType} — ${email}${order?.id ? ` (Order #${order.id})` : ''}`,
    html: `<div style="font-family:sans-serif;max-width:600px;padding:28px;background:#0d0d14;color:#e8e8f0">
      <h2 style="color:#C9981A;margin-bottom:14px">New Project Brief — ${productType.toUpperCase()}</h2>
      <p><strong>Customer:</strong> ${email}</p>
      ${order?.id ? `<p><strong>Order ID:</strong> ${order.id}</p>` : '<p style="color:#C8442C"><strong>Pre-payment brief</strong> — no order ID yet. Verify payment before starting work.</p>'}
      <div style="background:#1a1a24;padding:18px;border-radius:6px;margin-top:14px;line-height:1.7;white-space:pre-wrap;font-size:.92rem">${briefText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
      <p style="color:#555;font-size:13px;margin-top:18px">Update status when you start work: PATCH /api/admin (or directly in Supabase music_orders table).</p>
    </div>`,
  }).catch(console.error);

  // Confirm to customer
  resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to:   email,
    subject: `Brief received — Kingdom Sound ${productType}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
      <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
      <h1 style="font-size:22px;font-weight:800;margin-bottom:12px">Brief received.</h1>
      <p style="color:#8888aa;margin-bottom:22px;line-height:1.7">I'll reach out within 24 hours to confirm details and kick off production. Most ${productType} projects deliver within 5-14 business days from confirmation.</p>
      <p style="color:#555;font-size:13px">Order: ${order?.id || 'pending'} · ${productType}</p>
      <p style="color:#333;font-size:12px;margin-top:24px">Questions? Reply to this email or text (908) 848-1436.</p>
    </div>`,
  }).catch(console.error);

  return json(200, { ok: true, order_id: order?.id });
};

export const config = { path: '/api/music-intake' };
