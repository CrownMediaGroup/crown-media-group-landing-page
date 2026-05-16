import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://crownmediagroup.co',
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
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const { name, email, business, message } = body;

  if (!name || !email || !message) {
    return new Response(JSON.stringify({ error: 'Name, email, and message are required.' }), { status: 400, headers });
  }

  try {
    const result = await resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: 'king@crownmediagroup.co',
      replyTo: email,
      subject: `New inquiry: ${name} — ${business || 'No business listed'}`,
      html: `<div style="font-family:sans-serif;max-width:520px;padding:32px;background:#0d0d14;color:#e8e8f0">
        <h2 style="color:#C9981A;margin-bottom:20px">New Contact Form Submission</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px 0;color:#8888aa;width:110px">Name</td><td style="padding:8px 0;font-weight:600">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#8888aa">Email</td><td style="padding:8px 0"><a href="mailto:${email}" style="color:#C9981A">${email}</a></td></tr>
          <tr><td style="padding:8px 0;color:#8888aa">Business</td><td style="padding:8px 0">${business || '—'}</td></tr>
        </table>
        <div style="margin-top:20px;padding:16px;background:#1a1a2e;border-left:3px solid #C9981A">
          <div style="color:#8888aa;font-size:12px;margin-bottom:8px;letter-spacing:.08em;text-transform:uppercase">Message</div>
          <div style="line-height:1.7">${message.replace(/\n/g, '<br>')}</div>
        </div>
        <p style="color:#555;font-size:12px;margin-top:24px">Hit reply to respond directly to ${name}.</p>
      </div>`,
    });

    if (result.error) {
      console.error('[CONTACT] Resend error:', result.error);
      return new Response(JSON.stringify({ error: result.error.message }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('[CONTACT] Exception:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: '/api/contact' };
