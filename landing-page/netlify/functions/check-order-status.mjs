import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async (req) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Missing session_id' }), { status: 400 });
  }

  const { data: order, error } = await supabase
    .from('ai_orders')
    .select('id, status, product_type, business_name, created_at')
    .eq('stripe_session_id', sessionId)
    .single();

  if (error || !order) {
    return new Response(JSON.stringify({ status: 'not_found' }), { status: 404 });
  }

  return new Response(JSON.stringify({ orderId: order.id, status: order.status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/check-order-status' };
