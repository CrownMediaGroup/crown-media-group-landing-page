#!/usr/bin/env node
// announce-new-services.mjs — email existing upkeep_clients about Kingdom Sound + Kingdom Edge.
// Includes a 30% off first-month loyalty offer via Stripe coupon `LAUNCH30`.
//
// MANUAL PREREQ: create `LAUNCH30` 30%-off-once coupon in Stripe Dashboard before live fire.
//
// Usage:
//   node Agency/tools/announce-new-services.mjs --dry-run   # list active clients only
//   node Agency/tools/announce-new-services.mjs             # live fire
//
// Tracks sends in Agency/ops/notes/service-announcements-sent.json so re-runs are idempotent.

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: join(__dirname, '..', '..', 'landing-page', '.env') });
dotenv({ path: join(__dirname, '..', '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}
if (!DRY_RUN && !RESEND_KEY) {
  console.error('Missing RESEND_API_KEY in env (live mode)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const resend   = DRY_RUN ? null : new Resend(RESEND_KEY);

const SENT_LOG_PATH = join(__dirname, '..', 'ops', 'notes', 'service-announcements-sent.json');

function loadSentLog() {
  if (!existsSync(SENT_LOG_PATH)) return { sent: [] };
  try { return JSON.parse(readFileSync(SENT_LOG_PATH, 'utf8')); } catch { return { sent: [] }; }
}
function saveSentLog(log) { writeFileSync(SENT_LOG_PATH, JSON.stringify(log, null, 2)); }

function emailHtml(firstName) {
  const fn = firstName || 'there';
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#FDFBF7;color:#1A1A2E">
    <img src="https://crownmediagroup.co/logo.png" alt="Crown Media Group" style="height:44px;margin-bottom:32px">
    <h1 style="font-family:'Cormorant Garamond',serif;font-size:28px;font-weight:700;margin-bottom:12px;color:#1A1A3E">${fn}, two new things you should know about.</h1>
    <p style="line-height:1.7;color:#4A4A6A;margin-bottom:22px">It's King. We just launched two new services I think you'll want first crack at — and as a current Crown Media Group client, your code <strong>LAUNCH30</strong> takes 30% off your first month of either one.</p>

    <div style="background:#FFF;border:1px solid rgba(201,152,26,0.2);border-radius:8px;padding:24px;margin-bottom:18px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.14em;color:#C9981A;text-transform:uppercase;margin-bottom:8px">Kingdom Sound</p>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;margin-bottom:10px">AI music library for your videos.</h2>
      <p style="color:#4A4A6A;line-height:1.7;margin-bottom:14px">Original AI-generated tracks you can drop into any video — no copyright strikes, no Content ID claims. Subscribe monthly, license tracks forever. From $27/month.</p>
      <a href="https://crownmediagroup.co/music.html?utm=client-launch" style="display:inline-block;background:#1A1A3E;color:#E8B832;padding:11px 22px;border-radius:4px;font-weight:600;font-size:14px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none">See Music plans</a>
    </div>

    <div style="background:#FFF;border:1px solid rgba(201,152,26,0.2);border-radius:8px;padding:24px;margin-bottom:24px">
      <p style="font-size:11px;font-weight:700;letter-spacing:.14em;color:#C9981A;text-transform:uppercase;margin-bottom:8px">Kingdom Edge</p>
      <h2 style="font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:700;margin-bottom:10px">AI trading intelligence.</h2>
      <p style="color:#4A4A6A;line-height:1.7;margin-bottom:14px">Daily AI market briefings, watchlist tracking, and pattern alerts for stocks and crypto. Educational research tool — not investment advice. From $37/month.</p>
      <a href="https://crownmediagroup.co/edge.html?utm=client-launch" style="display:inline-block;background:#1A1A3E;color:#E8B832;padding:11px 22px;border-radius:4px;font-weight:600;font-size:14px;letter-spacing:.06em;text-transform:uppercase;text-decoration:none">See Edge plans</a>
    </div>

    <p style="color:#4A4A6A;line-height:1.7;margin-bottom:6px">Code <strong>LAUNCH30</strong> at checkout. Good through 2026-06-13.</p>
    <p style="color:#4A4A6A;line-height:1.7;margin-bottom:24px">Reply to this email if you want me to walk you through either one personally.</p>

    <p style="color:#4A4A6A;margin-bottom:4px">In Christ and in service,</p>
    <p style="font-weight:700;font-size:18px;color:#1A1A2E">King</p>
    <p style="color:#4A4A6A;font-size:13px;margin-top:2px">Founder · Crown Media Group</p>

    <hr style="border:none;border-top:1px solid #e5e9f2;margin:28px 0">
    <p style="font-size:11px;color:#8a96b8;font-style:italic;line-height:1.6">"Whatever you do, work heartily, as for the Lord and not for men." — Colossians 3:23</p>
    <p style="font-size:11px;color:#aaa;margin-top:14px">Crown Media Group · Columbia, SC · <a href="mailto:king@crownmediagroup.co?subject=Unsubscribe" style="color:#aaa">Unsubscribe</a></p>
    <p style="font-size:10px;color:#bbb;margin-top:14px">Note: Kingdom Edge is an educational research tool. Not investment advice. Trading involves risk of loss.</p>
  </div>`;
}

function firstNameFromEmail(email) {
  const local = (email || '').split('@')[0];
  if (!local) return '';
  const first = local.split(/[._\-]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

async function run() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);

  const { data: clients, error } = await supabase
    .from('upkeep_clients')
    .select('email, product_id, status, created_at')
    .eq('status', 'active');

  if (error) { console.error('Supabase error:', error.message); process.exit(1); }
  if (!clients || !clients.length) {
    console.log('No active upkeep_clients found.');
    return;
  }

  // Dedupe by email (a single client may have multiple subscriptions)
  const byEmail = {};
  clients.forEach(c => { byEmail[c.email] = byEmail[c.email] || c; });
  const unique = Object.values(byEmail);

  console.log(`\n${unique.length} unique active client emails found:`);
  unique.forEach(c => console.log(`  ${c.email}  [${c.product_id}]`));

  if (DRY_RUN) {
    console.log('\n(dry-run — no emails sent)');
    return;
  }

  const log = loadSentLog();
  const alreadySent = new Set(log.sent.map(s => s.email));

  let sent = 0, skipped = 0, failed = 0;
  for (const c of unique) {
    if (alreadySent.has(c.email)) { console.log(`  skip (already sent): ${c.email}`); skipped++; continue; }
    try {
      const r = await resend.emails.send({
        from:    'Crown Media Group <king@crownmediagroup.co>',
        to:      c.email,
        subject: 'Two new things you should know about — Crown Media Group',
        html:    emailHtml(firstNameFromEmail(c.email)),
      });
      if (r?.data?.id) {
        log.sent.push({ email: c.email, sent_at: new Date().toISOString(), resend_id: r.data.id });
        sent++;
        console.log(`  sent: ${c.email}`);
      } else { failed++; console.log(`  failed: ${c.email}`, r); }
      saveSentLog(log);
      await new Promise(r => setTimeout(r, 200));
    } catch (e) { failed++; console.error(`  error: ${c.email} — ${e.message}`); }
  }

  console.log(`\n=== SUMMARY === sent: ${sent} · skipped (already sent): ${skipped} · failed: ${failed}`);
}

run().catch(err => { console.error(err); process.exit(1); });
