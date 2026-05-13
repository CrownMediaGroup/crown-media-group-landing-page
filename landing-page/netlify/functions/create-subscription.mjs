import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUBSCRIPTIONS = {
  'upkeep-35':         { name: 'Website Upkeep',             amount: 3500,  desc: 'Monthly content updates, security monitoring, SSL renewal, uptime checks, priority support' },
  'crm-33':            { name: 'Crown Media CRM',             amount: 3300,  desc: 'Full CRM access — pipeline, AI outreach, bulk email/SMS, lead generator, photo scan, unlimited contacts' },
  'social-197':        { name: 'Social Media Starter',        amount: 19700, desc: '8 posts/month, 1 platform, branded graphics, content calendar, hashtag strategy' },
  'social-297':        { name: 'Social Media Growth',         amount: 29700, desc: '20 posts/month, 3 platforms, Reels, Meta Ads, bi-weekly check-in, analytics report' },
  'social-497':        { name: 'Social Media Partner Level',  amount: 49700, desc: 'Ads management, weekly strategy, competitor analysis, email marketing, priority support' },
  // ── Kingdom Sound — AI music library ──────────────────────────────────────
  'music-starter-27':  { name: 'Kingdom Sound — Starter',     amount: 2700,  desc: '5 track downloads/month, standard library, YouTube + Reels license, swap any flagged track free' },
  'music-pro-67':      { name: 'Kingdom Sound — Pro',         amount: 6700,  desc: '20 track downloads/month, full library, 1 custom track request/month, all-platform license' },
  'music-studio-147':  { name: 'Kingdom Sound — Studio',      amount: 14700, desc: 'Unlimited downloads, custom tracks, stems/loops, brand-exclusive option (1 track/quarter)' },
  // ── Kingdom Edge — AI trading intelligence (educational tool) ─────────────
  'edge-watch-37':     { name: 'Kingdom Edge — Watch',        amount: 3700,  desc: 'Daily morning brief, 1 watchlist (10 symbols), 5 alerts/day, stocks + crypto. Educational tool — not investment advice.' },
  'edge-trade-97':     { name: 'Kingdom Edge — Trade',        amount: 9700,  desc: 'Morning + midday + close briefs, 3 watchlists, 25 alerts/day, earnings preview, sector heatmaps. Not investment advice.' },
  'edge-edge-297':     { name: 'Kingdom Edge — Edge',         amount: 29700, desc: 'All Trade features, real-time alerts, custom setups, weekly 30-min strategy call. Not investment advice.' },
};

// Map productId prefix → success redirect target
function successPathFor(productId) {
  if (productId.startsWith('music-')) return '/music.html?success=1&session_id={CHECKOUT_SESSION_ID}';
  if (productId.startsWith('edge-'))  return '/edge.html?success=1&session_id={CHECKOUT_SESSION_ID}';
  return '/ai-tools.html?success=1&session_id={CHECKOUT_SESSION_ID}';
}

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

  const cancelPath = productId.startsWith('music-')
    ? '/music.html'
    : productId.startsWith('edge-')
      ? '/edge.html'
      : '/ai-tools.html';

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
    // Propagate productId + email to the Subscription itself (not just the session)
    // so customer.subscription.* webhooks can read them off sub.metadata.
    subscription_data: {
      metadata: {
        productId,
        customerEmail: customerEmail || '',
        businessName: businessName || '',
      },
    },
    success_url: `${siteUrl}${successPathFor(productId)}`,
    cancel_url:  `${siteUrl}${cancelPath}`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/create-subscription' };
