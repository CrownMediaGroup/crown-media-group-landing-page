// POST /api/edge-daily-brief — generate + deliver a market brief.
// Body: { brief_type: 'morning' | 'midday' | 'close', secret: process.env.EDGE_INTERNAL_SECRET }
//
// Pipeline:
//   1. Fetch overnight news + price snapshots from Polygon.io
//   2. Summarize via Claude API (Haiku for cost, Sonnet for the morning brief)
//   3. Upsert into edge_briefs (one per type per date)
//   4. Email all active edge subscribers + log to edge_brief_deliveries
//
// Manual trigger:
//   curl -X POST https://crownmediagroup.co/api/edge-daily-brief \
//     -H "Content-Type: application/json" \
//     -d '{"brief_type":"morning","secret":"YOUR_SECRET"}'
//
// LEGAL: every brief includes the disclaimer. Briefs are identical for all subscribers — no
// personalized advice. The content is "market journalism" style, not "you should buy X" advice.

import { Resend } from 'resend';
import { supabase, json, LEGAL_DISCLAIMER, TIER_FEATURES } from './_edge-helpers.mjs';

const resend = new Resend(process.env.RESEND_API_KEY);

const POLYGON_KEY    = process.env.POLYGON_API_KEY;
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const INTERNAL_SECRET = process.env.EDGE_INTERNAL_SECRET;

const TRACKED_TICKERS = ['SPY', 'QQQ', 'IWM', 'DIA', 'VIX'];
const TRACKED_CRYPTO  = ['X:BTCUSD', 'X:ETHUSD'];

async function fetchPolygonNews(limit = 20) {
  if (!POLYGON_KEY) return [];
  try {
    const url = `https://api.polygon.io/v2/reference/news?limit=${limit}&order=desc&sort=published_utc&apiKey=${POLYGON_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.results || []).map(n => ({
      title:    n.title,
      desc:     n.description,
      tickers:  n.tickers || [],
      pub:      n.published_utc,
      url:      n.article_url,
      author:   n.author,
    }));
  } catch (e) {
    console.error('[BRIEF] polygon news error:', e.message);
    return [];
  }
}

async function fetchPolygonSnapshot(ticker) {
  if (!POLYGON_KEY) return null;
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const bar = (d.results || [])[0];
    return bar ? {
      ticker,
      open:   bar.o,
      close:  bar.c,
      high:   bar.h,
      low:    bar.l,
      volume: bar.v,
      change_pct: bar.o ? ((bar.c - bar.o) / bar.o * 100).toFixed(2) : null,
    } : null;
  } catch (e) {
    console.error('[BRIEF] polygon snapshot error:', e.message);
    return null;
  }
}

async function summarizeWithClaude(briefType, snapshots, news) {
  if (!ANTHROPIC_KEY) {
    // Graceful fallback when no API key — useful for first-run testing
    const fallback = [
      `Market snapshot for ${new Date().toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}:`,
      '',
      ...snapshots.filter(s => s).map(s => `${s.ticker}: closed ${s.close} (${s.change_pct >= 0 ? '+' : ''}${s.change_pct}%) on ${s.volume.toLocaleString()} volume`),
      '',
      'Top stories:',
      ...news.slice(0, 5).map(n => `• ${n.title}`),
      '',
      LEGAL_DISCLAIMER,
    ].join('\n');
    return { summary: fallback.split('\n').slice(0, 3).join(' '), full: fallback };
  }

  const model = briefType === 'morning' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  const prompt = `You are writing the ${briefType} edition of "Kingdom Edge" — a daily market intelligence brief for retail traders.
This is JOURNALISM, not advice. Never say "buy" or "sell." Use neutral, factual language.

Today's market data:
${snapshots.filter(s => s).map(s => `- ${s.ticker}: prev close $${s.close} (${s.change_pct >= 0 ? '+' : ''}${s.change_pct}% vs open), volume ${s.volume?.toLocaleString()}`).join('\n')}

Recent news (last 24h):
${news.slice(0, 12).map(n => `- ${n.title} (${n.tickers?.slice(0,3).join(', ') || 'general'})`).join('\n')}

Write the brief in this structure (concise, scannable):
1. **One-line market mood** (5–10 words)
2. **Overnight & overseas** — 2 bullets on what happened in Asia/Europe + futures
3. **3 things to watch today** — 3 specific tickers or sectors with WHY they matter
4. **Crypto check** — 1-2 bullets on BTC/ETH if any meaningful move
5. **Earnings/events on deck** — list scheduled events worth noting

Tone: like a Wall Street Journal Morning Briefing — informed, sharp, never preachy. Under 350 words. End with: "${LEGAL_DISCLAIMER}"`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':       ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':    'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) {
      console.error('[BRIEF] claude api error', r.status, await r.text());
      return { summary: 'Brief generated (Claude API unavailable, fallback used).', full: prompt };
    }
    const d = await r.json();
    const full = d.content?.[0]?.text || '';
    const summary = full.split('\n').find(l => l.trim()) || 'See full brief.';
    return { summary: summary.replace(/^[*#\-\s]+/, '').slice(0, 200), full };
  } catch (e) {
    console.error('[BRIEF] claude fetch error:', e.message);
    return { summary: 'Brief generation failed.', full: '' };
  }
}

function renderEmailHtml(brief) {
  const md = (brief.content_text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = md
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul style="margin:8px 0 14px;padding-left:20px">$1</ul>')
    .replace(/\n\n/g, '</p><p style="margin:12px 0">')
    .replace(/\n/g, '<br>');

  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#0E0E28;color:#e8e8f0">
    <div style="border-bottom:2px solid #C9981A;padding-bottom:16px;margin-bottom:24px">
      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#C9981A;text-transform:uppercase">KINGDOM EDGE</p>
      <p style="margin:6px 0 0;font-size:22px;font-weight:800;color:#fff">${brief.brief_type.charAt(0).toUpperCase() + brief.brief_type.slice(1)} Brief · ${brief.brief_date}</p>
    </div>
    <div style="line-height:1.7;color:#d8d8e8"><p style="margin:12px 0">${html}</p></div>
    <hr style="border:none;border-top:1px solid #2a2a44;margin:32px 0">
    <p style="font-size:12px;color:#888;line-height:1.5"><em>${LEGAL_DISCLAIMER}</em> By using this service you agree to the <a href="https://crownmediagroup.co/edge/terms.html" style="color:#C9981A">Terms of Service</a>, <a href="https://crownmediagroup.co/edge/disclaimers.html" style="color:#C9981A">Disclaimers</a>, and <a href="https://crownmediagroup.co/edge/risk-disclosure.html" style="color:#C9981A">Risk Disclosure</a>.</p>
    <p style="font-size:11px;color:#555;margin-top:16px">Crown Media Group · Columbia, SC · <a href="https://crownmediagroup.co/edge.html" style="color:#888">Manage subscription</a></p>
  </div>`;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  if (!INTERNAL_SECRET) return json(503, { error: 'server_misconfig', detail: 'EDGE_INTERNAL_SECRET not set' });
  if (body.secret !== INTERNAL_SECRET) return json(401, { error: 'unauthorized' });

  const briefType = body.brief_type || 'morning';
  if (!['morning', 'midday', 'close'].includes(briefType)) {
    return json(400, { error: 'invalid_brief_type' });
  }

  // 1. Gather data
  const news      = await fetchPolygonNews(20);
  const snapshots = await Promise.all([...TRACKED_TICKERS, ...TRACKED_CRYPTO].map(fetchPolygonSnapshot));

  // 2. Summarize
  const ai = await summarizeWithClaude(briefType, snapshots, news);

  // 3. Upsert into edge_briefs
  const today = new Date().toISOString().slice(0, 10);
  const { data: brief, error: briefErr } = await supabase
    .from('edge_briefs')
    .upsert({
      brief_type:   briefType,
      brief_date:   today,
      content_html: renderEmailHtml({ brief_type: briefType, brief_date: today, content_text: ai.full }),
      content_text: ai.full,
      summary:      ai.summary,
      symbols:      [...TRACKED_TICKERS, ...TRACKED_CRYPTO],
    }, { onConflict: 'brief_type,brief_date' })
    .select().single();

  if (briefErr) {
    return json(500, { error: 'brief_upsert_failed', detail: briefErr.message });
  }

  // 4. Find subscribers entitled to this brief type
  const tiersEntitled = Object.entries(TIER_FEATURES)
    .filter(([, f]) => f.briefTypes.includes(briefType))
    .map(([tier]) => tier);
  const productIds = tiersEntitled.map(t =>
    t === 'watch' ? 'edge-watch-37' :
    t === 'trade' ? 'edge-trade-97' :
                    'edge-edge-297');

  const { data: subscribers } = await supabase
    .from('upkeep_clients')
    .select('email, product_id')
    .in('product_id', productIds)
    .eq('status', 'active');

  // 5. Send + log
  let sent = 0, failed = 0;
  for (const sub of (subscribers || [])) {
    try {
      // Skip duplicate sends (idempotent per email+brief)
      const { data: existing } = await supabase
        .from('edge_brief_deliveries')
        .select('id')
        .eq('user_email', sub.email)
        .eq('brief_id',   brief.id)
        .maybeSingle();
      if (existing) continue;

      const r = await resend.emails.send({
        from:    'Crown Media Group <king@crownmediagroup.co>',
        to:      sub.email,
        subject: `${briefType === 'morning' ? '☀️ Morning' : briefType === 'midday' ? '🕛 Midday' : '🌙 Close'} Brief — ${today}`,
        html:    brief.content_html,
      });

      if (r?.data?.id) {
        await supabase.from('edge_brief_deliveries').insert({
          user_email:   sub.email,
          brief_id:     brief.id,
          delivered_at: new Date().toISOString(),
        });
        sent++;
      } else { failed++; }

      // Resend rate-limit nicety
      await new Promise(r => setTimeout(r, 80));
    } catch (e) { failed++; console.error('[BRIEF] send error', sub.email, e.message); }
  }

  return json(200, {
    ok:           true,
    brief_id:     brief.id,
    brief_type:   briefType,
    brief_date:   today,
    subscribers:  (subscribers || []).length,
    sent,
    failed,
    summary:      ai.summary,
  });
};

export const config = { path: '/api/edge-daily-brief' };
