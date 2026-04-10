import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUBSCRIPTIONS = {
  'upkeep-35':  { name: 'Website Upkeep',             amount: 3500,  desc: 'Monthly content updates, security monitoring, SSL renewal, uptime checks, priority support' },
  'crm-33':     { name: 'Crown Media CRM',             amount: 3300,  desc: 'Full CRM access — pipeline, AI outreach, bulk email/SMS, lead generator, photo scan, unlimited contacts' },
  'social-197': { name: 'Social Media Starter',        amount: 19700, desc: '8 posts/month, 1 platform, branded graphics, content calendar, hashtag strategy' },
  'social-297': { name: 'Social Media Growth',         amount: 29700, desc: '20 posts/month, 3 platforms, Reels, Meta Ads, bi-weekly check-in, analytics report' },
  'social-497': { name: 'Social Media Partner Level',  amount: 49700, desc: 'Ads management, weekly strategy, competitor analysis, email marketing, priority support' },
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

  const { productId, customerEmail, businessName } = body;
  const product = SUBSCRIPTIONS[productId];

  if (!product) {
    return new Response(JSON.stringify({ error: 'Invalid product' }), { status: 400 });
  }

  const siteUrl = process.env.URL || 'https://crownmediagroup.co';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: product.name, description: product.desc },
        unit_amount: product.amount,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    }],
    customer_email: customerEmail || undefined,
    metadata: {
      productId,
      businessName: businessName || '',
    },
    success_url: `${siteUrl}/ai-tools.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/ai-tools.html`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/create-subscription' };
