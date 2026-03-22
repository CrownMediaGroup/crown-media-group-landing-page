/**
 * test-jordan.js — Call your own verified number to hear Jordan
 * Twilio trial accounts can call verified numbers.
 * Add your personal number as verified in Twilio first.
 *
 * Usage: node tools/calls/test-jordan.js +1YOURNUMBER
 *
 * To verify your number in Twilio:
 *   twilio.com console → Phone Numbers → Manage → Verified Caller IDs → Add number
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express   = require('express');
const twilio    = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;

const PORT         = process.env.CALL_PORT || 4001;
const WEBHOOK_BASE = process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`;
const FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER;
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Opening — plays when you answer
app.post('/test/start', (req, res) => {
  const twiml  = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: `${WEBHOOK_BASE}/test/listen`,
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    method: 'POST'
  });

  gather.say({ voice: 'Polly.Joanna', rate: '95%' },
    "Hey, is this Anointed Cuts? I'm Jordan — quick local question for you."
  );

  twiml.say({ voice: 'Polly.Joanna' },
    "I didn't catch that. Feel free to visit crownmediagroup.co for your free audit. Have a blessed day."
  );
  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

// Simple response loop using Polly (no ElevenLabs needed for test)
app.post('/test/listen', (req, res) => {
  const heard = req.body.SpeechResult || '(nothing)';
  console.log(`\n[TEST] You said: "${heard}"`);

  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: `${WEBHOOK_BASE}/test/listen`,
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    method: 'POST'
  });

  gather.say({ voice: 'Polly.Joanna', rate: '95%' },
    `I heard you say: ${heard}. ` +
    "In the real call, Jordan's brain — powered by Claude AI — responds here with a live pitch. " +
    "Say anything to continue the test, or say goodbye to end."
  );

  if (heard.toLowerCase().includes('goodbye') || heard.toLowerCase().includes('bye')) {
    const t2 = new VoiceResponse();
    t2.say({ voice: 'Polly.Joanna' }, "Test complete. Jordan is ready. God bless.");
    t2.hangup();
    return res.type('text/xml').send(t2.toString());
  }

  twiml.hangup();
  res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, async () => {
  console.log(`\n[TEST] Jordan test server on port ${PORT}`);
  console.log(`[TEST] Webhook: ${WEBHOOK_BASE}\n`);

  const target = process.argv[2];
  if (!target) {
    console.log('Usage: node tools/calls/test-jordan.js +1YOURNUMBER');
    console.log('Make sure your number is verified in Twilio first.\n');
    process.exit(0);
  }

  if (!FROM_NUMBER) {
    console.error('TWILIO_FROM_NUMBER not set in .env');
    process.exit(1);
  }

  const normalized = target.startsWith('+') ? target : `+1${target.replace(/\D/g, '')}`;
  console.log(`[TEST] Calling ${normalized}...`);

  const call = await twilioClient.calls.create({
    to:   normalized,
    from: FROM_NUMBER,
    url:  `${WEBHOOK_BASE}/test/start`
  });

  console.log(`[TEST] Call SID: ${call.sid}`);
  console.log('[TEST] Pick up your phone — you will hear Jordan.\n');
});
