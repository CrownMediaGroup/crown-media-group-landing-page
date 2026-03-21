import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  'logo-basic':   { name: 'Logo Starter Pack',    amount: 4700,  desc: '3 AI logo concepts, PNG + transparent BG, color palette, font pairing' },
  'logo-premium': { name: 'Full Brand Identity Kit', amount: 9700, desc: 'Logo concepts + SVG vector + social headers + brand guidelines PDF' },
  'banner-basic': { name: 'AI Banner — Starter',  amount: 4700,  desc: '4 AI banners optimized for your platform' },
  'banner-pack':  { name: 'AI Banner — Full Pack', amount: 9700, desc: 'Full banner set: Facebook, Instagram, LinkedIn, Twitter' },
};

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { productId, customerEmail, businessName, style, industry } = body;
  const product = PRODUCTS[productId];

  if (!product) {
    return new Response(JSON.stringify({ error: 'Invalid product' }), { status: 400 });
  }

  const siteUrl = process.env.URL || 'https://crownmediagroup.co';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: product.name, description: product.desc },
        unit_amount: product.amount,
      },
      quantity: 1,
    }],
    customer_email: customerEmail || undefined,
    metadata: {
      productId,
      businessName: businessName || '',
      style: style || 'modern',
      industry: industry || 'general',
    },
    success_url: `${siteUrl}/ai-tools.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/ai-tools.html`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/create-checkout' };
