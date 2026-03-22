import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async (req) => {
  const token = req.headers.get('x-admin-token');
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const { data: orders, error } = await supabase
    .from('ai_orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const completed = orders.filter(o => o.status === 'completed');
  const pending   = orders.filter(o => o.status === 'pending');
  const failed    = orders.filter(o => o.status === 'failed');
  const totalRev  = completed.reduce((s, o) => s + (o.amount || 0), 0);

  return new Response(JSON.stringify({
    orders,
    summary: {
      total_orders:     orders.length,
      completed_orders: completed.length,
      pending_orders:   pending.length,
      failed_orders:    failed.length,
      total_revenue:    totalRev,
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/admin-orders' };
