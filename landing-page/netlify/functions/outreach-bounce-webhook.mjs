// outreach-bounce-webhook.mjs — Resend webhook handler (HTTP, not scheduled)
//
// Receives email.bounced, email.complained, and email.delivery_delayed events
// from Resend and updates the CRM accordingly.
//
// Configure in Resend dashboard:
//   - Endpoint URL: https://crownmediagroup.co/.netlify/functions/outreach-bounce-webhook
//   - Events to subscribe to: email.bounced, email.complained
//   - Signing secret: copy to RESEND_WEBHOOK_SECRET in Netlify env vars

import crypto from 'crypto';
import { crmMarkBounced, crmPatchChurch, crmFetchAllChurches } from './_outreach-helpers.mjs';

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

/**
 * Resend signs webhooks using Svix headers:
 *   svix-id, svix-timestamp, svix-signature
 * Signature format: "v1,<base64 hmac-sha256 of (svix-id.svix-timestamp.body)>"
 */
function verifySignature(rawBody, headers) {
  if (!RESEND_WEBHOOK_SECRET) {
    // Dev / unconfigured — accept (King is expected to set this before going live)
    return { ok: true, dev: true };
  }
  const svixId        = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: 'missing svix headers' };
  }
  // The Resend secret is base64-prefixed with "whsec_"; strip and decode.
  const secret = RESEND_WEBHOOK_SECRET.replace(/^whsec_/, '');
  let key;
  try { key = Buffer.from(secret, 'base64'); }
  catch { return { ok: false, reason: 'bad secret format' }; }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', key).update(signedContent).digest('base64');

  const signatures = svixSignature.split(' ').map(s => s.split(',')[1]).filter(Boolean);
  if (signatures.includes(expected)) return { ok: true };
  return { ok: false, reason: 'signature mismatch' };
}

export default async (req, _context) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const rawBody = await req.text();
  const verify = verifySignature(rawBody, req.headers);
  if (!verify.ok) {
    return Response.json({ ok: false, error: 'unauthorized: ' + verify.reason }, { status: 401 });
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return Response.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }

  const type = event.type || event.event;
  const data = event.data || event;
  const recipient = (data.to && data.to[0]) || data.email || (data.email_addresses && data.email_addresses[0]);

  if (!recipient) {
    return Response.json({ ok: false, error: 'no recipient in event' }, { status: 400 });
  }

  const recipientEmail = String(recipient).toLowerCase();

  // Handle each event type
  let action = 'noop';
  let updated = 0;

  try {
    if (type === 'email.bounced' || type === 'bounced') {
      const reason = data.bounce?.reason || data.reason || 'bounced';
      const result = await crmMarkBounced(recipientEmail, reason);
      action = 'bounced';
      updated = result.updated || 0;
    } else if (type === 'email.complained' || type === 'complained' || type === 'email.complaint') {
      // Find the church record and unsubscribe it
      const churches = await crmFetchAllChurches();
      const match = churches.find(c => (c.email || '').toLowerCase() === recipientEmail);
      if (match) {
        await crmPatchChurch(match.id, {
          unsubscribed: 1,
          unsubscribed_at: new Date().toISOString(),
          status: 'Unsubscribed',
          notes: ` [SPAM-COMPLAINT ${new Date().toISOString()}]`,
        });
        action = 'complaint→unsubscribed';
        updated = 1;
      }
    } else if (type === 'email.delivery_delayed') {
      action = 'delayed (logged only)';
    } else {
      action = `ignored event: ${type}`;
    }
  } catch (e) {
    return Response.json({ ok: false, error: e.message, type, recipient: recipientEmail }, { status: 500 });
  }

  return Response.json({ ok: true, type, recipient: recipientEmail, action, updated });
};
