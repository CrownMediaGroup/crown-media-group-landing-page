import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  'logo-basic':    { name: 'AI Logo Design',  amount: 9700,  desc: '4 logo concepts, SVG vector + PNG, transparent background, 4 style variations' },
  'banner-pack':   { name: 'AI Banner Set',   amount: 9700,  desc: 'Full banner set: Facebook, Instagram, LinkedIn, Twitter — all platform sizes' },
  'website-basic': { name: 'AI Website',      amount: 19700, desc: '1-page service business website — deployed live to your own URL within 24 hours' },
  // ── Kingdom Sound — per-project pricing (Tina proposal model) ──────────────
  'music-license-150':  { name: 'Kingdom Sound — Catalog License (Standard)',  amount: 15000, desc: 'Single track license, MP3 + WAV, perpetual commercial license, all platforms' },
  'music-license-297':  { name: 'Kingdom Sound — Catalog License (Premium)',   amount: 29700, desc: 'Single premium track license with stems available, MP3 + WAV, perpetual commercial license' },
  'music-license-497':  { name: 'Kingdom Sound — Catalog License (Signature)', amount: 49700, desc: 'Signature catalog track license, MP3 + WAV + stems, perpetual commercial license' },
  'music-custom-500':   { name: 'Kingdom Sound — Custom Instrumental (Basic)', amount: 50000, desc: 'Original instrumental built around your brief. 5 business day delivery. 2 rounds of revisions. WAV + MP3.' },
  'music-custom-750':   { name: 'Kingdom Sound — Custom Instrumental (Extended)', amount: 75000, desc: 'Extended-length custom instrumental + alternate mix. 7 business day delivery. 2 rounds revisions.' },
  'music-custom-997':   { name: 'Kingdom Sound — Custom Instrumental (Multi-Version)', amount: 99700, desc: 'Custom instrumental with 3 mix variations + stems. 7 business day delivery. 2 rounds revisions.' },
  'music-original-993': { name: 'Kingdom Sound — Fully Original Song',          amount: 99300, desc: 'Original song — lyrics, melody, production, vocals — written for one story, person, or brand. 14 business day delivery.' },
  'music-bundle-1997':  { name: 'Kingdom Sound — All Three Services Bundle',    amount: 199700, desc: '1 Signature catalog license + 1 Multi-Version custom instrumental + 1 fully original song. Saves $490 (33% off) vs. piecemeal.' },
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

  const { productId, customerEmail, businessName, style, industry, trackId, intakeBrief } = body;
  const product = PRODUCTS[productId];

  if (!product) {
    return new Response(JSON.stringify({ error: 'Invalid product' }), { status: 400 });
  }

  const siteUrl = process.env.URL || 'https://crownmediagroup.co';

  // Route success/cancel URLs based on product family
  const isMusic = productId.startsWith('music-');
  const successPath = isMusic
    ? '/music.html?success=1&session_id={CHECKOUT_SESSION_ID}'
    : '/ai-tools.html?success=1&session_id={CHECKOUT_SESSION_ID}';
  const cancelPath  = isMusic ? '/music.html' : '/ai-tools.html';

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
      style:        style    || 'modern',
      industry:     industry || 'general',
      trackId:      trackId  ? String(trackId) : '',
      intakeBrief:  (intakeBrief || '').slice(0, 500),  // Stripe metadata 500 char limit per field
    },
    success_url: `${siteUrl}${successPath}`,
    cancel_url:  `${siteUrl}${cancelPath}`,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/create-checkout' };
