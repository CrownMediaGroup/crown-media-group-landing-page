/**
 * summarize.mjs — AI Blog Post Summarizer
 * Uses direct Anthropic API fetch (no SDK — avoids esbuild bundling issues)
 * Crown Media Group
 */

export const handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { text, title } = JSON.parse(event.body || '{}');
    if (!text || text.length < 100) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No content provided' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Summarize this blog post in exactly 5 clear, actionable bullet points. Be specific and direct. No filler. Write for a busy small business owner who wants the key takeaways in 30 seconds.

Title: ${title || 'Blog Post'}

Content:
${text.slice(0, 6000)}

Format your response as exactly 5 bullet points starting with "•". Nothing else — no intro, no outro.`,
        }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: `API error: ${response.status}` }) };
    }

    const data = await response.json();
    const summary = data.content?.[0]?.text || '';

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
