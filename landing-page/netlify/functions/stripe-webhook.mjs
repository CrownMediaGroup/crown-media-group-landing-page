import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

// ── Google Form pre-fill entry IDs ────────────────────────────────────────────
// To get these: open the form → 3-dot menu → "Get pre-filled link"
// Fill each field with a test value → click "Get link" → copy the URL
// Each param looks like: entry.1234567890=value — use just the number after "entry."
const FORM_ID = '1mFTt1YJ9iGJscnZxM5WnVnhN_L_9tqLCK9PV9_KHR3A';
const FORM_ENTRY = {
  business: '', // "Business Name" field entry ID
  email:    '', // "Email Address" field entry ID
  orderRef: '', // "Order Reference" field entry ID (add this field to the form first)
};

function buildFormUrl(businessName, email, sessionId) {
  let url = `https://docs.google.com/forms/d/${FORM_ID}/viewform?embedded=true`;
  if (FORM_ENTRY.business) url += `&entry.${FORM_ENTRY.business}=${encodeURIComponent(businessName)}`;
  if (FORM_ENTRY.email)    url += `&entry.${FORM_ENTRY.email}=${encodeURIComponent(email)}`;
  if (FORM_ENTRY.orderRef) url += `&entry.${FORM_ENTRY.orderRef}=${encodeURIComponent(sessionId)}`;
  return url;
}

export default async (req) => {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    if (session.payment_status === 'paid') {
      const productId    = session.metadata.productId;
      const businessName = session.metadata.businessName || '';
      const email        = session.customer_details?.email || '';
      const isLogo       = productId === 'logo-basic';

      const { data: order, error } = await supabase.from('ai_orders').insert({
        email,
        product_type:      productId,
        amount:            session.amount_total,
        stripe_session_id: session.id,
        status:            isLogo ? 'awaiting_intake' : 'processing',
        business_name:     businessName,
        style:             session.metadata.style || '',
        industry:          session.metadata.industry || '',
      }).select().single();

      if (error) {
        console.error('[WEBHOOK] Supabase insert error:', error);
        return new Response('DB error', { status: 500 });
      }

      // Notify King of new sale
      const productLabel  = isLogo ? 'AI Logo Design' : 'AI Banner Set';
      const amountDollars = ((session.amount_total || 0) / 100).toFixed(2);
      resend.emails.send({
        from: 'Crown Media Group <king@crownmediagroup.co>',
        to: 'king@crownmediagroup.co',
        subject: `New sale: ${productLabel} — $${amountDollars}`,
        html: `<div style="font-family:sans-serif;max-width:480px;padding:32px;background:#0d0d14;color:#e8e8f0">
          <h2 style="color:#C9981A;margin-bottom:16px">New Sale</h2>
          <p><strong>Product:</strong> ${productLabel}</p>
          <p><strong>Amount:</strong> $${amountDollars}</p>
          <p><strong>Business:</strong> ${businessName}</p>
          <p><strong>Customer email:</strong> ${email}</p>
          <p style="color:#555;font-size:13px;margin-top:24px">${isLogo ? 'Logo — customer sent to brand brief form. Pipeline fires on form submit.' : 'Banner — generation running automatically.'} Check <a href="https://crownmediagroup.co/admin" style="color:#C9981A">admin dashboard</a>.</p>
        </div>`,
      }).catch(console.error);

      if (isLogo) {
        // Send customer to Google Form to complete brand brief
        const formUrl = buildFormUrl(businessName, email, session.id);
        resend.emails.send({
          from: 'Crown Media Group <king@crownmediagroup.co>',
          to: email,
          subject: `Complete your logo brief — Crown Media Group`,
          html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#0d0d14;color:#e8e8f0">
            <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:40px;margin-bottom:32px">
            <h1 style="font-size:24px;font-weight:800;margin-bottom:12px">Payment confirmed${businessName ? `, ${businessName}` : ''}.</h1>
            <p style="color:#8888aa;margin-bottom:28px;line-height:1.7">One last step — fill out your brand brief so we can build a logo custom to your business. Takes 2 minutes.</p>
            <a href="${formUrl}" style="display:inline-block;background:#c9a84c;color:#000;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;margin-bottom:32px">Complete Your Brand Brief</a>
            <p style="color:#555;font-size:13px">Your logo will be ready within 24 hours of submitting the brief. Questions? Reply to this email.</p>
            <p style="color:#333;font-size:12px;margin-top:24px">Crown Media Group &middot; Columbia, SC &middot; crownmediagroup.co</p>
          </div>`,
        }).catch(console.error);
      } else {
        // Banner — fire automated background generation
        const siteUrl = process.env.URL || 'https://crownmediagroup.co';
        fetch(`${siteUrl}/.netlify/functions/generate-assets-background`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id }),
        }).catch(console.error);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

export const config = { path: '/api/stripe-webhook' };
