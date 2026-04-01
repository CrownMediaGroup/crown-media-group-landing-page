/**
 * summarize.mjs — AI Blog Post Summarizer
 * Called from the "AI Summary" button on every blog post.
 * Reads the full post content via slug → calls Claude → returns a 5-bullet summary.
 *
 * Required env: ANTHROPIC_API_KEY (already set in Netlify)
 */

import Anthropic from '@anthropic-ai/sdk';

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

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001', // Fast + cheap for summaries
      max_tokens: 500,
      messages: [{
        role:    'user',
        content: `Summarize this blog post in exactly 5 clear, actionable bullet points. Be specific and direct. No filler. Write for a busy small business owner who wants the key takeaways in 30 seconds.

Title: ${title || 'Blog Post'}

Content:
${text.slice(0, 6000)}

Format your response as exactly 5 bullet points starting with "•". Nothing else — no intro, no outro.`,
      }],
    });

    const summary = message.content[0]?.text || '';

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
