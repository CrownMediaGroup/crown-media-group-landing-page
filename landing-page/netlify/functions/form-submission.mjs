import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async (req) => {
  const payload = await req.json();
  const { name, email, business, message } = payload.payload?.data || {};

  await resend.emails.send({
    from: 'Crown Media Group <king@crownmediagroup.co>',
    to: 'king@crownmediagroup.co',
    reply_to: email,
    subject: `New contact: ${name || 'Website visitor'} — ${business || 'No business listed'}`,
    html: `<div style="font-family:sans-serif;max-width:520px;padding:32px;background:#0d0d14;color:#e8e8f0">
      <h2 style="color:#C9981A;margin-bottom:16px">New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> <a href="mailto:${email}" style="color:#C9981A">${email}</a></p>
      <p><strong>Business:</strong> ${business || '—'}</p>
      <p style="margin-top:16px"><strong>Message:</strong></p>
      <p style="background:#1a1a2e;padding:16px;border-left:3px solid #C9981A;line-height:1.6">${message}</p>
      <p style="color:#555;font-size:13px;margin-top:24px">Reply directly to this email to respond to ${name}.</p>
    </div>`,
  });

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

export const config = { path: '/api/form-submission' };
