import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

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
      const { data: order, error } = await supabase.from('ai_orders').insert({
        email: session.customer_details?.email,
        product_type: session.metadata.productId,
        amount: session.amount_total,
        stripe_session_id: session.id,
        status: 'processing',
        business_name: session.metadata.businessName,
        style: session.metadata.style,
        industry: session.metadata.industry,
      }).select().single();

      if (error) {
        console.error('[WEBHOOK] Supabase insert error:', error);
        return new Response('DB error', { status: 500 });
      }

      // Notify King of new sale
      const productLabel = session.metadata.productId === 'logo-basic' ? 'AI Logo Design' : 'AI Banner Set';
      const amountDollars = ((session.amount_total || 0) / 100).toFixed(2);
      resend.emails.send({
        from: 'Crown Media Group <king@crownmediagroup.co>',
        to: 'king@crownmediagroup.co',
        subject: `New sale: ${productLabel} — $${amountDollars}`,
        html: `<div style="font-family:sans-serif;max-width:480px;padding:32px;background:#0d0d14;color:#e8e8f0">
          <h2 style="color:#C9981A;margin-bottom:16px">New Sale</h2>
          <p><strong>Product:</strong> ${productLabel}</p>
          <p><strong>Amount:</strong> $${amountDollars}</p>
          <p><strong>Business:</strong> ${session.metadata.businessName}</p>
          <p><strong>Industry:</strong> ${session.metadata.industry}</p>
          <p><strong>Style:</strong> ${session.metadata.style}</p>
          <p><strong>Customer email:</strong> ${session.customer_details?.email}</p>
          <p style="color:#555;font-size:13px;margin-top:24px">Generation is running automatically. Check <a href="https://crownmediagroup.co/admin" style="color:#C9981A">admin dashboard</a> for status.</p>
        </div>`,
      }).catch(console.error);

      // Fire background generation function
      const siteUrl = process.env.URL || 'https://crownmediagroup.co';
      fetch(`${siteUrl}/.netlify/functions/generate-assets-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      }).catch(console.error);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};

export const config = { path: '/api/stripe-webhook' };
