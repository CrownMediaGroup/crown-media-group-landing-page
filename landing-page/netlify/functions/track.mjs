/**
 * track.mjs — Blog page view tracker → Supabase
 * Called by a lightweight beacon script on every blog post page load.
 *
 * Required Netlify env vars (already set in your Netlify dashboard):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *
 * Supabase table (run once in Supabase SQL editor):
 *   CREATE TABLE IF NOT EXISTS blog_analytics (
 *     id         BIGSERIAL PRIMARY KEY,
 *     slug       TEXT NOT NULL,
 *     title      TEXT,
 *     referrer   TEXT DEFAULT 'direct',
 *     platform   TEXT DEFAULT 'direct',
 *     viewed_at  TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS blog_analytics_slug_idx ON blog_analytics (slug);
 *   CREATE INDEX IF NOT EXISTS blog_analytics_viewed_at_idx ON blog_analytics (viewed_at);
 */

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { slug, referrer, title } = JSON.parse(event.body || '{}');
    if (!slug || slug === 'index') return { statusCode: 200, body: 'ok' };

    const supaUrl = process.env.SUPABASE_URL;
    const supaKey = process.env.SUPABASE_ANON_KEY;
    if (!supaUrl || !supaKey) return { statusCode: 200, body: 'ok' }; // Env not set — fail silently

    const platform = detectPlatform(referrer || '');

    await fetch(`${supaUrl}/rest/v1/blog_analytics`, {
      method:  'POST',
      headers: {
        apikey:          supaKey,
        Authorization:   `Bearer ${supaKey}`,
        'Content-Type':  'application/json',
        Prefer:          'return=minimal',
      },
      body: JSON.stringify({
        slug,
        title:     (title || '').slice(0, 250),
        referrer:  (referrer || 'direct').slice(0, 250),
        platform,
      }),
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'ok',
    };
  } catch (_) {
    // Never return an error — tracking failures must be invisible to readers
    return { statusCode: 200, body: 'ok' };
  }
};

function detectPlatform(ref) {
  if (!ref) return 'direct';
  const r = ref.toLowerCase();
  if (/google|bing|duckduckgo|yahoo|ecosia|baidu/.test(r)) return 'search';
  if (/linkedin/.test(r))       return 'linkedin';
  if (/twitter|t\.co|x\.com/.test(r)) return 'x';
  if (/facebook|fb\.com|fb\.me/.test(r)) return 'facebook';
  if (/reddit/.test(r))         return 'reddit';
  if (/medium/.test(r))         return 'medium';
  if (/hashnode/.test(r))       return 'hashnode';
  if (/instagram/.test(r))      return 'instagram';
  if (ref === 'direct')         return 'direct';
  return 'other';
}
