/**
 * call-agent.js — AI outbound call engine
 * Crown Media Group | Twilio + ElevenLabs + Claude API
 *
 * Usage:  node tools/calls/call-agent.js +18038650233
 * Deps:   npm install twilio @supabase/supabase-js express dotenv
 *
 * Requires env vars (add to security/VAULT.md + .env):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER  (your Twilio number, e.g. +18005551234)
 *   WEBHOOK_BASE_URL    (ngrok or Railway URL — no trailing slash)
 *   SUPABASE_URL
 *   SUPABASE_KEY
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express = require('express');
const twilio  = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
} else {
  console.warn('[WARN] Supabase not configured — call outcomes will not be logged');
}
const VoiceResponse = twilio.twiml.VoiceResponse;

const PORT         = process.env.CALL_PORT || 4001;
const WEBHOOK_BASE = process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`;
const FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ── TwiML: initial greeting ──────────────────────────────────────────────────
app.post('/twiml/intro', (req, res) => {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    numDigits: 1,
    action: `${WEBHOOK_BASE}/twiml/response`,
    timeout: 8
  });
  gather.say({
    voice: 'Polly.Joanna',
    rate: '95%'
  },
  "Hi, this is an automated message from Crown Media Group — an AI-powered marketing agency here in Columbia, South Carolina. " +
  "We help local businesses get more customers through social media and digital marketing. " +
  "We'd love to offer you a FREE content audit — no cost, no strings attached. " +
  "Press 1 to learn more or to schedule a quick call. Press 9 to be removed from our list. " +
  "Thank you and God bless."
  );
  // No keypress — leave voicemail-style
  twiml.say({ voice: 'Polly.Joanna' },
    "We didn't catch a response. Feel free to call us back at any time. Have a great day."
  );
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// ── TwiML: handle keypress ───────────────────────────────────────────────────
app.post('/twiml/response', async (req, res) => {
  const digit  = req.body.Digits;
  const to     = req.body.To;
  const callSid = req.body.CallSid;
  const twiml  = new VoiceResponse();

  if (digit === '1') {
    twiml.say({ voice: 'Polly.Joanna' },
      "Excellent! We'll have someone from Crown Media Group reach out to you shortly to schedule your free audit. " +
      "You can also book directly at crown media group dot co slash book. Thank you — God bless!"
    );
    twiml.hangup();
    await logOutcome(to, callSid, 'INTERESTED');
  } else if (digit === '9') {
    twiml.say({ voice: 'Polly.Joanna' },
      "You've been removed from our list. Have a wonderful day."
    );
    twiml.hangup();
    await logOutcome(to, callSid, 'OPT_OUT');
  } else {
    twiml.say({ voice: 'Polly.Joanna' },
      "Sorry, we didn't catch that. Have a great day."
    );
    twiml.hangup();
    await logOutcome(to, callSid, 'NO_RESPONSE');
  }

  res.type('text/xml').send(twiml.toString());
});

// ── TwiML: call status webhook ───────────────────────────────────────────────
app.post('/twiml/status', async (req, res) => {
  const { CallStatus, To, CallSid } = req.body;
  const statusMap = {
    'no-answer':  'NO_ANSWER',
    'busy':       'BUSY',
    'failed':     'FAILED',
    'completed':  'COMPLETED',
    'canceled':   'CANCELED'
  };
  const outcome = statusMap[CallStatus] || CallStatus.toUpperCase();
  if (['no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus)) {
    await logOutcome(To, CallSid, outcome);
  }
  res.sendStatus(200);
});

// ── Log outcome to Supabase leads table ─────────────────────────────────────
async function logOutcome(phone, callSid, status) {
  console.log(`[CALL] ${phone} → ${status}`);
  if (!supabase) return;
  const { error } = await supabase
    .from('leads')
    .upsert({
      phone,
      call_sid: callSid,
      call_status: status,
      last_called_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone' });

  if (error) console.error('Supabase log error:', error.message);

  if (status === 'INTERESTED') {
    console.log(`\n🔥 HOT LEAD: ${phone} pressed 1. Follow up now.\n`);
  }
}

// ── Make a call ──────────────────────────────────────────────────────────────
async function makeCall(toNumber) {
  if (!FROM_NUMBER) throw new Error('TWILIO_FROM_NUMBER not set in .env');

  const call = await client.calls.create({
    to:           toNumber,
    from:         FROM_NUMBER,
    url:          `${WEBHOOK_BASE}/twiml/intro`,
    statusCallback: `${WEBHOOK_BASE}/twiml/status`,
    statusCallbackMethod: 'POST'
  });

  console.log(`[CALL] Initiated → ${toNumber} | SID: ${call.sid}`);
  return call;
}

// ── Start server + optional direct call ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[CALL AGENT] Webhook server on port ${PORT}`);
  console.log(`[CALL AGENT] Webhook base: ${WEBHOOK_BASE}`);

  const target = process.argv[2];
  if (target) {
    console.log(`[CALL AGENT] Calling ${target}...`);
    makeCall(target).catch(e => {
      console.error('Call failed:', e.message);
      process.exit(1);
    });
  }
});

module.exports = { makeCall };
