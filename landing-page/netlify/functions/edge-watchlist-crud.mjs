// /api/edge-watchlist — manage user watchlists.
// GET ?email=...                       → list watchlists for active subscriber
// POST { email, name?, symbols[] }     → create
// PATCH { email, id, name?, symbols? } → update
// DELETE { email, id }                 → delete
//
// All operations enforce tier limits.

import { supabase, resolveEdgeSubscription, json } from './_edge-helpers.mjs';

function cleanSymbols(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map(s => String(s).toUpperCase().trim()).filter(Boolean))];
}

export default async (req) => {
  const url   = new URL(req.url);
  const method = req.method;

  let email, body = {};
  if (method === 'GET') {
    email = (url.searchParams.get('email') || '').toLowerCase().trim();
  } else {
    try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }
    email = (body.email || '').toLowerCase().trim();
  }

  const sub = await resolveEdgeSubscription(email);
  if (!sub.ok) return json(403, { error: 'no_active_edge_subscription', reason: sub.reason });

  if (method === 'GET') {
    const { data, error } = await supabase
      .from('edge_watchlists')
      .select('id,name,symbols,active,created_at,updated_at')
      .eq('user_email', email)
      .eq('active', true)
      .order('created_at', { ascending: true });
    if (error) return json(500, { error: error.message });
    return json(200, { tier: sub.tier, features: sub.features, watchlists: data || [] });
  }

  if (method === 'POST') {
    const symbols = cleanSymbols(body.symbols).slice(0, sub.features.watchlistSymbolsMax);
    if (symbols.length === 0) return json(400, { error: 'no_symbols' });

    const { count } = await supabase
      .from('edge_watchlists')
      .select('id', { count: 'exact', head: true })
      .eq('user_email', email)
      .eq('active', true);
    if ((count || 0) >= sub.features.watchlistMax) {
      return json(429, { error: 'watchlist_limit_reached', limit: sub.features.watchlistMax, tier: sub.tier });
    }

    const { data, error } = await supabase.from('edge_watchlists').insert({
      user_email:    email,
      product_id:    sub.productId,
      stripe_sub_id: sub.subscriptionId,
      name:          (body.name || 'My Watchlist').slice(0, 80),
      symbols,
      active:        true,
    }).select().single();
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, watchlist: data });
  }

  if (method === 'PATCH') {
    const id = parseInt(body.id);
    if (!id) return json(400, { error: 'missing_id' });
    const patch = { updated_at: new Date().toISOString() };
    if (body.name)    patch.name    = String(body.name).slice(0, 80);
    if (body.symbols) patch.symbols = cleanSymbols(body.symbols).slice(0, sub.features.watchlistSymbolsMax);
    const { data, error } = await supabase
      .from('edge_watchlists')
      .update(patch)
      .eq('id', id)
      .eq('user_email', email)
      .select().single();
    if (error) return json(500, { error: error.message });
    if (!data)  return json(404, { error: 'not_found_or_not_yours' });
    return json(200, { ok: true, watchlist: data });
  }

  if (method === 'DELETE') {
    const id = parseInt(body.id);
    if (!id) return json(400, { error: 'missing_id' });
    const { error } = await supabase
      .from('edge_watchlists')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_email', email);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true });
  }

  return json(405, { error: 'method_not_allowed' });
};

export const config = { path: '/api/edge-watchlist' };
