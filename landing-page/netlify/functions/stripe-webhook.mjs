import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
