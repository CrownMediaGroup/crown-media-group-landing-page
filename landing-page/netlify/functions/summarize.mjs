/**
 * summarize.mjs — AI Blog Post Summarizer
 * Uses direct Anthropic API fetch (no SDK — avoids esbuild bundling issues)
 * Crown Media Group
 * Fallback chain: Anthropic → Gemini → 500 error
 */

export const handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': 'https://crownmediagroup.co',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Health check — GET request returns key status
  if (event.httpMethod === 'GET') {
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ok',
        anthropic_key: hasAnthropicKey,
        gemini_key: hasGeminiKey,
      }),
    };
  }

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const { text, title } = JSON.parse(event.body || '{}');
    if (!text || text.length < 100) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No content provided' }) };
    }

    const prompt = `Summarize this blog post in exactly 5 clear, actionable bullet points. Be specific and direct. No filler. Write for a busy small business owner who wants the key takeaways in 30 seconds.

Title: ${title || 'Blog Post'}

Content:
${text.slice(0, 6000)}

Format your response as exactly 5 bullet points starting with "•". Nothing else — no intro, no outro.`;

    // --- PRIMARY: Anthropic ---
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const summary = data.content?.[0]?.text || '';
          if (summary) {
            return {
              statusCode: 200,
              headers: { ...cors, 'Content-Type': 'application/json' },
              body: JSON.stringify({ summary, provider: 'anthropic' }),
            };
          }
        }
        // Anthropic failed — fall through to Gemini
        console.log('Anthropic failed, status:', response.status, '— trying Gemini fallback');
      } catch (anthropicErr) {
        console.log('Anthropic threw:', anthropicErr.message, '— trying Gemini fallback');
      }
    }

    // --- FALLBACK: Gemini ---
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 500, temperature: 0.3 },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (summary) {
            return {
              statusCode: 200,
              headers: { ...cors, 'Content-Type': 'application/json' },
              body: JSON.stringify({ summary, provider: 'gemini' }),
            };
          }
        }
        console.log('Gemini also failed, status:', geminiRes.status);
      } catch (geminiErr) {
        console.log('Gemini threw:', geminiErr.message);
      }
    }

    // Both failed
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Summary service unavailable. No API keys configured or both APIs failed.' }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
