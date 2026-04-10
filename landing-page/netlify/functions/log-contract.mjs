import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const { name, productId, email } = body;

  if (!name || !productId) {
    return new Response(JSON.stringify({ error: 'Name and productId required' }), { status: 400, headers });
  }

  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  const { error } = await supabase.from('contract_acceptances').insert({
    name,
    product_id: productId,
    email: email || null,
    ip,
  });

  if (error) {
    console.error('[LOG-CONTRACT] Supabase error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};

export const config = { path: '/api/log-contract' };
