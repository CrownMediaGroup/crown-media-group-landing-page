import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  'logo-basic':    { name: 'AI Logo Design',  amount: 9700,  desc: '4 logo concepts, SVG vector + PNG, transparent background, 4 style variations' },
  'banner-pack':   { name: 'AI Banner Set',   amount: 9700,  desc: 'Full banner set: Facebook, Instagram, LinkedIn, Twitter — all platform sizes' },
  'website-basic': { name: 'AI Website',      amount: 19700, desc: '1-page service business website — deployed live to your own URL in under 10 minutes' },
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
