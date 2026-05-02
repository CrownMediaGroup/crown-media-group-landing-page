// generators/email.js — Crafts personalized follow-up email + sends via Resend
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { slugify } from '../schema.js';

const FROM_NAME  = 'King · Crown Media Group';
const FROM_EMAIL = process.env.KINGDOM_REACH_FROM || 'king@crownmediagroup.co';

export function buildEmail(data, { siteUrl = '', proposalUrl = '' } = {}) {
  const first   = (data.pastor_name || '').split(' ')[0] || 'Pastor';
  const church  = data.church_name || 'your church';
  const tier    = (data.recommended_tier || '').toLowerCase();
  const subject = `Great meeting you, ${first} — here's what we discussed`;

  // --- Deeper personalized opener ---
  let referenceLine;
  if (data.key_quotes && data.key_quotes[0]) {
    referenceLine = `After our conversation — especially when you mentioned "${data.key_quotes[0]}" — I couldn't wait to put this together for you.`;
  } else if (Array.isArray(data.buying_signals) && data.buying_signals.length) {
    referenceLine = `You mentioned ${data.buying_signals[0]} — that told me you're already thinking about this.`;
  } else if (data.church_dna) {
    referenceLine = `What you carry for ${church} is real — ${data.church_dna} — and the families across Columbia need to find you.`;
  } else {
    referenceLine = `What you carry for ${church} is real — and the families across Columbia need to find you.`;
  }

  const painLine = Array.isArray(data.pain_points) && data.pain_points.length
    ? `You mentioned ${data.pain_points.slice(0, 2).join(' and ')} — those are exactly the things we solve every day.`
    : 'You shared the heart of where the church is heading — and we can move that forward fast.';

  // --- Tier-specific body copy ---
  let tierBody;
  if (tier === 'starter') {
    tierBody = `Based on where ${church} is right now, the Starter tier is built for you. The goal is simple: get visible fast, no tech headaches, no learning curve. We handle everything so you can stay focused on ministry.`;
  } else if (tier === 'growth') {
    tierBody = `The Growth tier is built for a church like ${church} — consistent reach, community building, and a team that handles everything week in and week out. You show up for your congregation. We make sure they find you.`;
  } else if (tier === 'premium') {
    tierBody = `The Premium tier is full-funnel domination — from the first click to a filled seat. You focus entirely on ministry while we drive awareness, engagement, and conversions across every channel. This is what it looks like to operate at scale.`;
  } else {
    tierBody = `Inside the proposal you'll see three investment tiers — and I've flagged the one I'd recommend for ${church} based on exactly what you shared.`;
  }

  // --- Proposal direct link line ---
  const proposalLinkLine = proposalUrl
    ? `\n📎 View your proposal directly → ${proposalUrl}\n`
    : '';

  const text = `Hi ${first},

Real talk — thank you for the time today. ${referenceLine}

${painLine}

${tierBody}

Attached is your proposal. Inside you'll find:
  • Three investment tiers (Starter / Growth / Premium)
  • The tier I recommended for ${church} — based on what you shared
  • Exactly what's included and the timeline
${proposalLinkLine}${siteUrl ? `\nI also went ahead and built a draft starter website for ${church}:\n  ${siteUrl}\n(It's yours to keep — no obligation. Look it over and tell me what to tweak.)\n` : ''}
Two ways forward whenever you're ready:
  1. Reply to this email with the tier you'd like to start with
  2. Or grab a 15-minute call here: https://calendly.com/crownmediagroup

Built by faith, powered by AI — and I genuinely believe ${church} is supposed to reach further than it ever has.

In Christ and in service,
King
Founder · Crown Media Group
king@crownmediagroup.co · crownmediagroup.co

"Whatever you do, work heartily, as for the Lord and not for men." — Colossians 3:23
`;

  const previewText = `Your personalized proposal from Crown Media Group — ${church} + ${data.recommended_tier || 'Starter'}`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0a1628">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(previewText)}</div>
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#1a3a8e;color:#fff;padding:28px;border-radius:12px 12px 0 0">
    <div style="font-family:Georgia,serif;font-weight:bold;font-size:20px;letter-spacing:.5px">CROWN MEDIA GROUP</div>
    <div style="font-size:13px;color:#cfd8ee;margin-top:4px">Built by Faith. Powered by AI.</div>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 12px 12px;line-height:1.6;border:1px solid #e5e9f2;border-top:none">
    <p style="margin:0 0 16px">Hi ${escapeHtml(first)},</p>
    <p style="margin:0 0 16px">Real talk — thank you for the time today. ${escapeHtml(referenceLine)}</p>
    <p style="margin:0 0 16px">${escapeHtml(painLine)}</p>
    <p style="margin:0 0 16px">${escapeHtml(tierBody)}</p>
    <p style="margin:0 0 8px"><strong>Attached is your proposal.</strong> Inside you'll find:</p>
    <ul style="margin:0 0 16px;padding-left:20px">
      <li>Three investment tiers (Starter / Growth / Premium)</li>
      <li>The tier I recommended for ${escapeHtml(church)} — based on what you shared</li>
      <li>Exactly what's included and the timeline</li>
    </ul>
    ${proposalUrl ? `<p style="margin:0 0 16px">&#128206; <a href="${escapeAttr(proposalUrl)}" style="color:#1a3a8e;font-weight:600">View your proposal directly &rarr;</a></p>` : ''}
    ${siteUrl ? `<p style="margin:0 0 16px">I also built a <strong>draft starter website</strong> for ${escapeHtml(church)} — yours to keep, no obligation:</p>
    <p style="margin:0 0 24px"><a href="${escapeAttr(siteUrl)}" style="background:#d4a73c;color:#0a1628;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View Your Draft Website</a></p>` : ''}
    <p style="margin:0 0 8px"><strong>Two ways forward when you're ready:</strong></p>
    <ol style="margin:0 0 16px;padding-left:20px">
      <li>Reply with the tier you'd like to start with</li>
      <li>Or grab a 15-minute call: <a href="https://calendly.com/crownmediagroup" style="color:#1a3a8e">calendly.com/crownmediagroup</a></li>
    </ol>
    <p style="margin:0 0 8px">In Christ and in service,</p>
    <p style="margin:0 0 4px;font-weight:bold;font-size:18px">King</p>
    <p style="margin:0;color:#5a6a87;font-size:14px">Founder · Crown Media Group<br>
    <a href="mailto:king@crownmediagroup.co" style="color:#1a3a8e">king@crownmediagroup.co</a> · <a href="https://crownmediagroup.co" style="color:#1a3a8e">crownmediagroup.co</a></p>
    <hr style="border:none;border-top:1px solid #e5e9f2;margin:24px 0">
    <p style="margin:0;font-size:12px;color:#8a96b8;font-style:italic">"Whatever you do, work heartily, as for the Lord and not for men." — Colossians 3:23</p>
    <p style="font-size:11px;color:#999;text-align:center;margin-top:32px">
      Crown Media Group | king@crownmediagroup.co | crownmediagroup.co<br>
      <a href="mailto:king@crownmediagroup.co?subject=Unsubscribe" style="color:#999">Unsubscribe</a>
    </p>
  </div>
</div>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escapeAttr(s='') { return escapeHtml(s).replace(/"/g,'&quot;'); }

export function writeEmailDraft(outputRoot, data, urls = {}) {
  const slug   = slugify(data.church_name);
  const dir    = join(outputRoot, 'emails');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const draft  = buildEmail(data, urls);
  const file   = join(dir, `${slug}_email.txt`);
  writeFileSync(file, `TO: ${data.pastor_name || ''}\nSUBJECT: ${draft.subject}\n\n${draft.text}`, 'utf8');
  return { slug, path:file, relPath:`output/emails/${slug}_email.txt`, ...draft };
}

// --- Follow-up draft writers (save only, do not send) ---

export function writeFollowup1Draft(data, dir) {
  const first  = (data.pastor_name || '').split(' ')[0] || 'Pastor';
  const church = data.church_name || 'your church';
  const slug   = slugify(church);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const subject = `Checking in, ${first} — did you get a chance to look it over?`;
  const text = `Hi ${first},

Just a quick check-in — I sent over ${church}'s proposal a couple of days ago and wanted to make sure it landed okay.

If you have any questions about what's included or want to talk through the tiers, I'm just a reply away. Or grab 15 minutes here: https://calendly.com/crownmediagroup

Still believing in what ${church} is building.

In Christ,
King
Founder · Crown Media Group
king@crownmediagroup.co
`;

  const file = join(dir, `${slug}_followup1.txt`);
  writeFileSync(file, `TO: ${data.pastor_name || ''}\nSUBJECT: ${subject}\n\n${text}`, 'utf8');
  return { slug, path: file, subject, text };
}

export function writeFollowup2Draft(data, dir) {
  const first  = (data.pastor_name || '').split(' ')[0] || 'Pastor';
  const church = data.church_name || 'your church';
  const slug   = slugify(church);

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const subject = `Final note for ${first} — still holding a spot for ${church}`;
  const text = `Hi ${first},

I don't want to keep filling your inbox — this will be my last note for now.

The offer I put together for ${church} is still on the table. If the timing shifts or the right moment comes, you know where to find me.

Two ways to move forward any time:
  1. Reply to this email
  2. Book a call: https://calendly.com/crownmediagroup

It was genuinely great meeting you. Whatever God has next for ${church} — I'm rooting for you.

In Christ and in service,
King
Founder · Crown Media Group
king@crownmediagroup.co · crownmediagroup.co
`;

  const file = join(dir, `${slug}_followup2.txt`);
  writeFileSync(file, `TO: ${data.pastor_name || ''}\nSUBJECT: ${subject}\n\n${text}`, 'utf8');
  return { slug, path: file, subject, text };
}

export async function sendViaResend({ to, subject, html, text, attachmentPath, attachmentName }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok:false, error:'RESEND_API_KEY not set' };
  if (!to)     return { ok:false, error:'Missing recipient' };

  const body = {
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to:   Array.isArray(to) ? to : [to],
    subject, html, text,
    reply_to: FROM_EMAIL,
    open_tracking: true,
    click_tracking: true,
  };

  if (attachmentPath && existsSync(attachmentPath)) {
    body.attachments = [{
      filename: attachmentName || 'proposal.pdf',
      content:  readFileSync(attachmentPath).toString('base64'),
    }];
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok:false, error: j.message || `Resend HTTP ${r.status}`, raw:j };
    return { ok:true, id: j.id || null };
  } catch (e) {
    return { ok:false, error: e.message };
  }
}
