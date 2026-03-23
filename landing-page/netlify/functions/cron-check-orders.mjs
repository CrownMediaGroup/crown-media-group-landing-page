// Netlify Scheduled Function — runs daily at 10am UTC
// Checks for:
//   1. Abandoned intake: paid but never submitted form (24hr+) → resend form email
//   2. Pending review: logos sent to King but not approved (24hr+) → remind King
//   3. Website upsell sequence: completed website orders → 3-email sequence (Day 3, 7, 14)

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend   = new Resend(process.env.RESEND_API_KEY);

// ── Logo/Banner form constants ───────────────────────────────────────────────
const FORM_BASE  = 'https://docs.google.com/forms/d/1mFTt1YJ9iGJscnZxM5WnVnhN_L_9tqLCK9PV9_KHR3A/viewform';
const FORM_ENTRY = {
  business: '359993626',
  email:    '1269703971',
  orderRef: '729356391',
  product:  '26156092',
};

// ── Website brief form constants ─────────────────────────────────────────────
const WEBSITE_FORM_BASE  = 'https://docs.google.com/forms/d/1IFzJoYN0ogTpPhxoQ4xjcDDkJ6PGPwfiBOitFTUAuXU/viewform';
const WEBSITE_FORM_ENTRY = {
  business: '1481453274',
  email:    '208138928',
  orderRef: '1584328223',
};

function buildFormUrl(businessName, email, sessionId, productType) {
  let url = FORM_BASE + '?embedded=false';
  if (FORM_ENTRY.business) url += `&entry.${FORM_ENTRY.business}=${encodeURIComponent(businessName || '')}`;
  if (FORM_ENTRY.email)    url += `&entry.${FORM_ENTRY.email}=${encodeURIComponent(email || '')}`;
  if (FORM_ENTRY.orderRef) url += `&entry.${FORM_ENTRY.orderRef}=${encodeURIComponent(sessionId || '')}`;
  if (FORM_ENTRY.product)  url += `&entry.${FORM_ENTRY.product}=${encodeURIComponent(productType === 'logo-basic' ? 'Logo' : 'Banner')}`;
  return url;
}

function buildWebsiteFormUrl(businessName, email, sessionId) {
  let url = WEBSITE_FORM_BASE + '?embedded=false';
  if (WEBSITE_FORM_ENTRY.business) url += `&entry.${WEBSITE_FORM_ENTRY.business}=${encodeURIComponent(businessName || '')}`;
  if (WEBSITE_FORM_ENTRY.email)    url += `&entry.${WEBSITE_FORM_ENTRY.email}=${encodeURIComponent(email || '')}`;
  if (WEBSITE_FORM_ENTRY.orderRef) url += `&entry.${WEBSITE_FORM_ENTRY.orderRef}=${encodeURIComponent(sessionId || '')}`;
  return url;
}

export default async () => {
  const now    = new Date();
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  let abandonedSent   = 0;
  let reviewReminders = 0;
  let upsellSent      = 0;

  // ── 1. Abandoned intake ─────────────────────────────────────────────────────
  const { data: abandoned } = await supabase
    .from('ai_orders')
    .select('*')
    .eq('status', 'awaiting_intake')
    .lt('created_at', cutoff);

  for (const order of (abandoned || [])) {
    const isWebsite = order.product_type === 'website-basic';

    const formUrl = isWebsite
      ? buildWebsiteFormUrl(order.business_name, order.email, order.stripe_session_id)
      : buildFormUrl(order.business_name, order.email, order.stripe_session_id, order.product_type);

    const productLabel = isWebsite
      ? 'website'
      : (order.product_type === 'logo-basic' ? 'logo design' : 'banner set');

    const briefLabel  = isWebsite ? 'website brief' : 'brand brief';
    const timeLabel   = isWebsite ? '3 minutes' : '2 minutes';
    const buttonLabel = isWebsite ? 'Complete Your Website Brief' : 'Complete Your Brand Brief';

    await resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: order.email,
      subject: `Don't forget — complete your ${briefLabel}`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
        <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
        <h1 style="font-size:22px;font-weight:800;margin-bottom:12px">Your order is waiting.</h1>
        <p style="color:#8888aa;margin-bottom:24px;line-height:1.7">You paid for your ${productLabel} but we haven&rsquo;t received your ${briefLabel} yet. We can&rsquo;t start without it.</p>
        <a href="${formUrl}" style="display:inline-block;background:#c9a84c;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px">${buttonLabel}</a>
        <p style="color:#555;font-size:13px">Takes ${timeLabel}. Reply to this email if you need help.</p>
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

  // ── 3. Website upsell sequence ────────────────────────────────────────────────
  // Sends 3 value emails to completed website customers: Day 3, Day 7, Day 14
  // Requires follow_up_stage + follow_up_sent_at columns on ai_orders.
  // If those columns don't exist yet, this block skips gracefully.
  try {
    const { data: websiteOrders, error: wsErr } = await supabase
      .from('ai_orders')
      .select('*')
      .like('product_type', 'website-%')
      .eq('status', 'completed')
      .lt('follow_up_stage', 3);

    if (wsErr) {
      if (wsErr.message && wsErr.message.toLowerCase().includes('column')) {
        console.warn('[CRON] follow_up_stage column not found — skipping upsell sequence. Run migration to enable.');
      } else {
        console.error('[CRON] Website upsell query error:', wsErr.message);
      }
    } else {
      for (const order of (websiteOrders || [])) {
        const stage      = order.follow_up_stage ?? 0;
        const updatedAt  = new Date(order.status_updated_at || order.created_at);
        const sentAt     = order.follow_up_sent_at ? new Date(order.follow_up_sent_at) : null;
        const biz        = order.business_name || 'your business';
        const daysSince  = (now - updatedAt) / (1000 * 60 * 60 * 24);
        const daysSinceSent = sentAt ? (now - sentAt) / (1000 * 60 * 60 * 24) : null;

        let shouldSend = false;
        if (stage === 0 && daysSince >= 3)         shouldSend = true;
        if (stage === 1 && daysSinceSent >= 4)     shouldSend = true;
        if (stage === 2 && daysSinceSent >= 7)     shouldSend = true;

        if (!shouldSend) continue;

        let subject = '';
        let html    = '';

        if (stage === 0) {
          // Email 1 — Day 3: Pure value, no sell
          subject = 'Your site is live — here\'s what most businesses miss';
          html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
            <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
            <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Your site is live.</h1>
            <p style="color:#8888aa;margin-bottom:24px;line-height:1.7">Now here are 3 things that turn a website into an actual lead machine — most businesses skip all three.</p>

            <h3 style="color:#c9a84c;font-size:16px;margin-bottom:6px">1. Claim your Google Business Profile</h3>
            <p style="color:#aaa;line-height:1.7;margin-bottom:20px">This is free and it is the single highest-ROI thing a local business can do. When someone searches "${biz}" or your service + city, your profile shows up with your hours, photos, and reviews — right at the top. Takes 15 minutes to set up. If you haven&rsquo;t done it yet, do it today.</p>

            <h3 style="color:#c9a84c;font-size:16px;margin-bottom:6px">2. Be consistent on one social platform</h3>
            <p style="color:#aaa;line-height:1.7;margin-bottom:20px">You don&rsquo;t need to be everywhere. Pick one platform where your customers actually are and post 3&ndash;4 times a week. The businesses that win on social are the consistent ones, not the ones with the most followers. Even simple behind-the-scenes content builds trust fast.</p>

            <h3 style="color:#c9a84c;font-size:16px;margin-bottom:6px">3. Run a small targeted local ad</h3>
            <p style="color:#aaa;line-height:1.7;margin-bottom:20px">$5&ndash;$10 a day targeting your zip code on Facebook or Google can drive real traffic to your new site. The key is targeting — city, age, interest. Most businesses waste money running broad. Narrow wins.</p>

            <p style="color:#e8e8f0;margin-bottom:8px;line-height:1.7">Want to talk through which of these makes the most sense for your business right now? I&rsquo;ll give you 15 minutes, no pitch.</p>
            <a href="https://calendly.com/crownmediagroupco" style="display:inline-block;background:#c9a84c;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:8px;margin-bottom:32px">Book a Free 15-Min Strategy Call</a>

            <p style="color:#333;font-size:12px;margin-top:24px">Crown Media Group &middot; Columbia, SC &middot; crownmediagroup.co</p>
          </div>`;

        } else if (stage === 1) {
          // Email 2 — Day 7: 30-day plan + Growth package CTA
          subject = `30-day plan for ${biz}`;
          html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
            <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
            <h1 style="font-size:22px;font-weight:800;margin-bottom:8px">Here&rsquo;s a 30-day plan for ${biz}.</h1>
            <p style="color:#8888aa;margin-bottom:24px;line-height:1.7">I put this together based on your business type. This is what the next 30 days could look like if executed right.</p>

            <div style="background:#16161f;border-left:3px solid #c9a84c;padding:20px;border-radius:4px;margin-bottom:24px">
              <p style="margin:0 0 10px;font-weight:700;color:#e8e8f0">Week 1 — Foundation</p>
              <p style="color:#aaa;margin:0;line-height:1.7">Google Business Profile fully optimized. 5 photos uploaded. First week of social content posted. Site indexed and showing in local search.</p>
            </div>

            <div style="background:#16161f;border-left:3px solid #c9a84c;padding:20px;border-radius:4px;margin-bottom:24px">
              <p style="margin:0 0 10px;font-weight:700;color:#e8e8f0">Week 2 — Content Engine</p>
              <p style="color:#aaa;margin:0;line-height:1.7">12 pieces of content scheduled and queued for the month. Mix of educational, behind-the-scenes, and promotional. Consistent posting = trust = inbound calls.</p>
            </div>

            <div style="background:#16161f;border-left:3px solid #c9a84c;padding:20px;border-radius:4px;margin-bottom:24px">
              <p style="margin:0 0 10px;font-weight:700;color:#e8e8f0">Week 3 — Paid Traffic</p>
              <p style="color:#aaa;margin:0;line-height:1.7">First ad campaign live. $10/day targeting Columbia area. Driving traffic to your site. Tracking every click so we know what&rsquo;s working.</p>
            </div>

            <div style="background:#16161f;border-left:3px solid #c9a84c;padding:20px;border-radius:4px;margin-bottom:24px">
              <p style="margin:0 0 10px;font-weight:700;color:#e8e8f0">Week 4 — Review & Scale</p>
              <p style="color:#aaa;margin:0;line-height:1.7">Review results. Optimize what&rsquo;s working. Double down. By end of month you have data, traction, and a repeatable system.</p>
            </div>

            <p style="color:#e8e8f0;margin-bottom:8px;line-height:1.7">This is what our Growth package delivers — done for you, every month, without you having to think about it. $1,200/mo. No long contracts.</p>
            <a href="https://crownmediagroup.co/#pricing" style="display:inline-block;background:#c9a84c;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-top:8px;margin-bottom:32px">See the Growth Package</a>

            <p style="color:#333;font-size:12px;margin-top:24px">Crown Media Group &middot; Columbia, SC &middot; crownmediagroup.co</p>
          </div>`;

        } else if (stage === 2) {
          // Email 3 — Day 14: Short, direct, one question
          subject = 'Last message — quick question';
          html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
            <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
            <p style="line-height:1.8;margin-bottom:16px">Have you gotten any calls from your site yet?</p>
            <p style="color:#aaa;line-height:1.8;margin-bottom:16px">I have one Growth slot open this month for a Columbia business. Reply &ldquo;interested&rdquo; and I&rsquo;ll send details.</p>
            <p style="color:#333;font-size:12px;margin-top:40px">Crown Media Group &middot; Columbia, SC &middot; crownmediagroup.co</p>
          </div>`;
        }

        const { error: sendErr } = await resend.emails.send({
          from: 'Crown Media Group <king@crownmediagroup.co>',
          to: order.email,
          subject,
          html,
        }).catch(e => ({ error: e }));

        if (sendErr) {
          console.error(`[CRON] Upsell email error for order ${order.id}:`, sendErr);
          continue;
        }

        // Advance the stage
        await supabase
          .from('ai_orders')
          .update({
            follow_up_stage:   stage + 1,
            follow_up_sent_at: now.toISOString(),
          })
          .eq('id', order.id);

        upsellSent++;
      }
    }
  } catch (err) {
    console.warn('[CRON] Website upsell sequence skipped:', err.message);
  }

  console.log(`[CRON] Abandoned: ${abandonedSent} follow-ups sent. Review reminders: ${reviewReminders}. Upsell emails: ${upsellSent}.`);
};

export const config = {
  schedule: '0 10 * * *', // 10am UTC daily
};
