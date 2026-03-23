// Netlify Scheduled Function — runs daily at 10am UTC
// Checks for:
//   1. Abandoned intake: paid but never submitted form (24hr+) → resend form email
//   2. Pending review: logos sent to King but not approved (24hr+) → remind King

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

const FORM_BASE = 'https://docs.google.com/forms/d/1mFTt1YJ9iGJscnZxM5WnVnhN_L_9tqLCK9PV9_KHR3A/viewform';
const FORM_ENTRY = {
  business: '359993626',
  email:    '1269703971',
  orderRef: '729356391',
  product:  '26156092',
};

function buildFormUrl(businessName, email, sessionId, productType) {
  let url = FORM_BASE + '?embedded=false';
  if (FORM_ENTRY.business) url += `&entry.${FORM_ENTRY.business}=${encodeURIComponent(businessName || '')}`;
  if (FORM_ENTRY.email)    url += `&entry.${FORM_ENTRY.email}=${encodeURIComponent(email || '')}`;
  if (FORM_ENTRY.orderRef) url += `&entry.${FORM_ENTRY.orderRef}=${encodeURIComponent(sessionId || '')}`;
  if (FORM_ENTRY.product)  url += `&entry.${FORM_ENTRY.product}=${encodeURIComponent(productType === 'logo-basic' ? 'Logo' : 'Banner')}`;
  return url;
}

export default async () => {
  const now    = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  let abandonedSent = 0;
  let reviewReminders = 0;

  // ── 1. Abandoned intake ─────────────────────────────────────────────────────
  const { data: abandoned } = await supabase
    .from('ai_orders')
    .select('*')
    .eq('status', 'awaiting_intake')
    .lt('created_at', cutoff);

  for (const order of (abandoned || [])) {
    const formUrl = buildFormUrl(order.business_name, order.email, order.stripe_session_id, order.product_type);

    await resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: order.email,
      subject: `Don't forget — complete your brand brief`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
        <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
        <h1 style="font-size:22px;font-weight:800;margin-bottom:12px">Your order is waiting.</h1>
        <p style="color:#8888aa;margin-bottom:24px;line-height:1.7">You paid for your ${order.product_type === 'logo-basic' ? 'logo design' : 'banner set'} but we haven&rsquo;t received your brand brief yet. We can&rsquo;t start without it.</p>
        <a href="${formUrl}" style="display:inline-block;background:#c9a84c;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px">Complete Your Brand Brief</a>
        <p style="color:#555;font-size:13px">Takes 2 minutes. Reply to this email if you need help.</p>
        <p style="color:#333;font-size:12px;margin-top:24px">Crown Media Group &middot; Columbia, SC &middot; crownmediagroup.co</p>
      </div>`,
    }).catch(console.error);

    // Mark as abandoned after follow-up so we don't spam
    await supabase
      .from('ai_orders')
      .update({ status: 'abandoned', status_updated_at: now.toISOString() })
      .eq('id', order.id);

    abandonedSent++;
  }

  // ── 2. Logos pending King review ─────────────────────────────────────────────
  const { data: pendingReview } = await supabase
    .from('ai_orders')
    .select('*')
    .eq('status', 'logos_ready')
    .lt('status_updated_at', cutoff);

  for (const order of (pendingReview || [])) {
    await resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: 'king@crownmediagroup.co',
      subject: `Action needed: Logo review for ${order.business_name} is overdue`,
      html: `<div style="font-family:sans-serif;max-width:480px;padding:32px;background:#0d0d14;color:#e8e8f0">
        <h2 style="color:#C9981A;margin-bottom:16px">Logo Review Overdue</h2>
        <p><strong>Business:</strong> ${order.business_name}</p>
        <p><strong>Customer:</strong> ${order.email}</p>
        <p><strong>Paid:</strong> $${((order.amount || 0) / 100).toFixed(2)}</p>
        <p style="color:#e8e8f0;margin-top:16px">This customer has been waiting over 24 hours for their logo review. Check your email for the review link.</p>
        <a href="https://allglory-onboarding-production.up.railway.app/dashboard" style="display:inline-block;background:#c9a84c;color:#000;font-weight:700;padding:12px 24px;border-radius:6px;text-decoration:none;margin-top:20px">Open Dashboard</a>
      </div>`,
    }).catch(console.error);

    reviewReminders++;
  }

  console.log(`[CRON] Abandoned: ${abandonedSent} follow-ups sent. Review reminders: ${reviewReminders}.`);
};

export const config = {
  schedule: '0 10 * * *', // 10am UTC daily
};
