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

  const { name, businessName, budget, needs, contact } = body;

  if (!name || !contact) {
    return new Response(JSON.stringify({ error: 'Name and contact are required.' }), { status: 400, headers });
  }

  const budgetLabels = {
    'under-100': 'Under $100',
    '100-250':   '$100 – $250',
    '250-500':   '$250 – $500',
    '500-1000':  '$500 – $1,000',
    '1000-plus': '$1,000+',
  };
  const budgetLabel = budgetLabels[budget] || budget || 'Not specified';

  try {
    const result = await resend.emails.send({
      from: 'Crown Media Group <king@crownmediagroup.co>',
      to: 'king@crownmediagroup.co',
      subject: `Custom Package Request — ${businessName || name}`,
      html: `<div style="font-family:sans-serif;max-width:560px;padding:32px;background:#0d0d14;color:#e8e8f0">
        <h2 style="color:#C9981A;margin-bottom:8px;font-size:22px">New Custom Package Request</h2>
        <p style="color:#888;font-size:13px;margin:0 0 28px">Submitted via crownmediagroup.co/ai-tools.html</p>
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:10px 0;color:#8888aa;width:140px;font-size:13px;vertical-align:top">Name</td>
            <td style="padding:10px 0;font-weight:600">${name}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8888aa;font-size:13px;vertical-align:top">Business</td>
            <td style="padding:10px 0;font-weight:600">${businessName || '—'}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8888aa;font-size:13px;vertical-align:top">Monthly Budget</td>
            <td style="padding:10px 0"><span style="background:#1a1a3e;color:#C9981A;padding:4px 12px;border-radius:4px;font-size:13px;font-weight:700">${budgetLabel}</span></td>
          </tr>
          <tr>
            <td style="padding:10px 0;color:#8888aa;font-size:13px;vertical-align:top">Contact</td>
            <td style="padding:10px 0"><a href="${contact.includes('@') ? 'mailto:' : 'tel:'}${contact}" style="color:#C9981A">${contact}</a></td>
          </tr>
        </table>
        <div style="margin-top:20px;padding:20px;background:#1a1a2e;border-left:3px solid #C9981A;border-radius:0 6px 6px 0">
          <div style="color:#8888aa;font-size:11px;margin-bottom:10px;letter-spacing:.1em;text-transform:uppercase">What They Need</div>
          <div style="line-height:1.8;font-size:15px">${(needs || '—').replace(/\n/g, '<br>')}</div>
        </div>
        <div style="margin-top:24px;padding:16px 20px;background:#0a1628;border:1px solid rgba(201,152,26,.2);border-radius:6px">
          <strong style="color:#C9981A;font-size:13px">Next Step:</strong>
          <span style="color:#888;font-size:13px"> Reach out within 24 hours. Build the custom proposal before the call.</span>
        </div>
        <p style="color:#333;font-size:12px;margin-top:28px">Crown Media Group &middot; Columbia, SC &middot; All Glory to Jesus</p>
      </div>`,
    });

    if (result.error) {
      console.error('[CUSTOM-PKG] Resend error:', result.error);
      return new Response(JSON.stringify({ error: result.error.message }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (err) {
    console.error('[CUSTOM-PKG] Exception:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: '/api/custom-pkg' };
