import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async (req) => {
  const url = new URL(req.url);
  const orderId = url.searchParams.get('order_id');

  if (!orderId) {
    return new Response(JSON.stringify({ error: 'Missing order_id' }), { status: 400 });
  }

  const { data: order } = await supabase
    .from('ai_orders')
    .select('status, email')
    .eq('id', orderId)
    .single();

  if (!order || order.status !== 'completed') {
    return new Response(JSON.stringify({ error: 'Order not ready' }), { status: 403 });
  }

  const { data: assets } = await supabase
    .from('ai_assets')
    .select('storage_path, asset_type, style, platform, width, height')
    .eq('order_id', orderId);

  // Generate signed URLs (2-hour expiry)
  const signed = await Promise.all(
    (assets || []).map(async (asset) => {
      const { data } = await supabase.storage
        .from('ai-generated')
        .createSignedUrl(asset.storage_path, 7200);
      return { ...asset, downloadUrl: data?.signedUrl };
    })
  );

  return new Response(JSON.stringify({ assets: signed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/get-delivery-urls' };
