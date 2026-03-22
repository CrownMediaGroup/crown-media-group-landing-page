/**
 * jordan.js — Crown Media Group AI Voice Agent
 * Full conversational AI: Twilio + Claude API + ElevenLabs
 *
 * Usage:  node tools/calls/jordan.js +18038650233
 * Deps:   npm install twilio @anthropic-ai/sdk elevenlabs express dotenv axios
 *
 * How it works:
 *   1. Twilio calls the target number
 *   2. Jordan speaks the opening line (ElevenLabs voice)
 *   3. Twilio listens for speech, transcribes it
 *   4. Transcript hits /call/listen → Claude generates Jordan's response
 *   5. ElevenLabs converts response to audio → Jordan speaks it
 *   6. Loop continues until booking, opt-out, or 4min limit
 *   7. All outcomes logged to Supabase
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const express   = require('express');
const twilio    = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');
const fs        = require('fs');
const path      = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── Clients ──────────────────────────────────────────────────────────────────
const twilioClient  = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const anthropic     = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}
const VoiceResponse = twilio.twiml.VoiceResponse;

const PORT         = process.env.CALL_PORT || 4001;
const WEBHOOK_BASE = process.env.WEBHOOK_BASE_URL || `http://localhost:${PORT}`;
const FROM_NUMBER  = process.env.TWILIO_FROM_NUMBER;
const EL_KEY       = process.env.ELEVENLABS_API_KEY;
const EL_VOICE     = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // default: Bella

// ── Audio cache dir ───────────────────────────────────────────────────────────
const AUDIO_DIR = path.join(__dirname, 'audio');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// ── Conversation memory (by CallSid) ─────────────────────────────────────────
const conversations = {};

// ── Jordan's system prompt ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
You are Jordan, a friendly and confident outreach specialist for Crown Media Group, an AI-powered marketing agency based in Columbia, South Carolina. You work directly with David King, the founder.

Your sole mission on every call: build enough trust in under 3 minutes to earn a 15-minute free content audit booking at crownmediagroup.co/book.

## YOUR PERSONALITY
- Warm, direct, and unhurried. Never rushed or scripted-sounding.
- Local. You mention Columbia SC naturally — it builds instant trust.
- Confident but not pushy. You offer value first, ask for nothing upfront.
- Faith-infused when the moment is natural — never forced, never preachy.
- You genuinely care whether this person's business succeeds.
- Keep responses SHORT — 1-3 sentences max. This is a phone call, not an email.

## CALL FLOW
1. After your opening (already delivered), ask: "I know you're busy — I just have one quick question. Is that okay?"
2. Ask ONE pain discovery question based on what you learn about their business
3. Reflect their pain back, then pitch the free audit in 3-4 sentences
4. Close: "I can book you in right now — it's at crownmediagroup.co/book — that's C-R-O-W-N media group dot C-O slash book. Takes 15 minutes, David's on the call himself."
5. Handle objections and loop back to close

## OBJECTION RESPONSES
- Too expensive: "Totally fair — the audit is completely free. No cost, no commitment. What's there to lose?"
- Not interested: "I get it. Is it marketing in general, or just the timing right now?"
- Too busy: "That's exactly why we built it as 15 minutes flat. No prep on your end. You just show up."
- Do it myself: "That's great. The audit just shows you what AI can add. Free, so zero risk."
- Think about it: "Of course. What would make you feel good about saying yes today?"

## HARD RULES
- Never say "amazing," "absolutely," "certainly," or robotic filler phrases
- Never mention pricing first — if they ask: "Audit is free. Packages start at $750/month but that's a later conversation."
- If they ask if you're real: be honest — "I'm an AI assistant. David King is a real Columbia local and he'll be on the call personally."
- Max 4 minutes. If no booking, offer the text link and close warmly.
- ALWAYS keep responses to 1-3 short sentences. Phone calls must be natural.

## BOOKING SIGNAL
When they agree to the audit, say exactly:
"Perfect. The link is crownmediagroup.co/book — C-R-O-W-N media group dot C-O slash book. David will be on the call himself. Talk soon — God bless."
Then output the special token: [BOOKING_CONFIRMED]

## OPT-OUT SIGNAL
If they firmly don't want contact, say:
"Absolutely, I'll remove you right now. Have a blessed day."
Then output: [OPT_OUT]
`;

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
async function textToSpeech(text, callSid) {
  if (!EL_KEY) return null; // fallback to Polly

  const filename = `${callSid}-${Date.now()}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}`,
      {
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.2 }
      },
      {
        headers: {
          'xi-api-key': EL_KEY,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        responseType: 'arraybuffer'
      }
    );
    fs.writeFileSync(filepath, response.data);
    return `${WEBHOOK_BASE}/audio/${filename}`;
  } catch (e) {
    console.error('[EL] TTS error:', e.message);
    return null;
  }
}

// ── Claude response ────────────────────────────────────────────────────────────
async function getJordanResponse(callSid, userMessage) {
  if (!conversations[callSid]) {
    conversations[callSid] = { history: [], startTime: Date.now(), turnCount: 0 };
  }

  const conv = conversations[callSid];
  conv.turnCount++;
  conv.history.push({ role: 'user', content: userMessage });

  // 4-minute limit check
  const elapsedMin = (Date.now() - conv.startTime) / 60000;
  const timeContext = elapsedMin > 3
    ? '\n\nNOTE: Call approaching 4-minute limit. Wrap up warmly and offer the booking link.'
    : '';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 200,
    system: SYSTEM_PROMPT + timeContext,
    messages: conv.history
  });

  const reply = response.content[0].text;
  conv.history.push({ role: 'assistant', content: reply });

  return reply;
}

// ── TwiML builder ─────────────────────────────────────────────────────────────
function buildGatherTwiml(audioUrl, fallbackText) {
  const twiml = new VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: `${WEBHOOK_BASE}/call/listen`,
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    method: 'POST'
  });

  if (audioUrl) {
    gather.play(audioUrl);
  } else {
    gather.say({ voice: 'Polly.Joanna', rate: '95%' }, fallbackText);
  }

  // Fallback if no speech detected
  twiml.say({ voice: 'Polly.Joanna' },
    "I didn't catch that. Feel free to call us back or visit crownmediagroup.co. Have a blessed day."
  );
  twiml.hangup();

  return twiml.toString();
}

// ── Routes ────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Serve generated audio files
app.use('/audio', express.static(AUDIO_DIR));

// Opening line when call connects
app.post('/call/start', async (req, res) => {
  const to       = req.body.To;
  const callSid  = req.body.CallSid;
  const leadName = req.query.business || 'there';

  const opening = `Hey, is this ${leadName}? I'm Jordan — I have a quick local question for you.`;

  console.log(`[JORDAN] Call connected → ${to} | ${callSid}`);

  const audioUrl = await textToSpeech(opening, callSid);
  res.type('text/xml').send(buildGatherTwiml(audioUrl, opening));
});

// Listen → Claude → Respond
app.post('/call/listen', async (req, res) => {
  const transcript = req.body.SpeechResult || '';
  const callSid    = req.body.CallSid;
  const to         = req.body.To;

  console.log(`[JORDAN] Heard: "${transcript}" | ${callSid}`);

  if (!transcript) {
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Joanna' }, "Have a blessed day.");
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  try {
    const reply = await getJordanResponse(callSid, transcript);
    console.log(`[JORDAN] Responding: "${reply.substring(0, 80)}..."`);

    // Check for special signals
    if (reply.includes('[BOOKING_CONFIRMED]')) {
      await logOutcome(to, callSid, 'INTERESTED');
      const clean  = reply.replace('[BOOKING_CONFIRMED]', '').trim();
      const audio  = await textToSpeech(clean, callSid);
      const twiml  = new VoiceResponse();
      if (audio) twiml.play(audio);
      else twiml.say({ voice: 'Polly.Joanna' }, clean);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    if (reply.includes('[OPT_OUT]')) {
      await logOutcome(to, callSid, 'OPT_OUT');
      const clean  = reply.replace('[OPT_OUT]', '').trim();
      const audio  = await textToSpeech(clean, callSid);
      const twiml  = new VoiceResponse();
      if (audio) twiml.play(audio);
      else twiml.say({ voice: 'Polly.Joanna' }, clean);
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    const audioUrl = await textToSpeech(reply, callSid);
    res.type('text/xml').send(buildGatherTwiml(audioUrl, reply));

  } catch (e) {
    console.error('[JORDAN] Claude error:', e.message);
    const twiml = new VoiceResponse();
    twiml.say({ voice: 'Polly.Joanna' },
      "I apologize for the interruption. Please visit crownmediagroup.co to book your free audit. Have a blessed day."
    );
    twiml.hangup();
    res.type('text/xml').send(twiml.toString());
  }
});

// Call status webhook
app.post('/call/status', async (req, res) => {
  const { CallStatus, To, CallSid } = req.body;
  const statusMap = {
    'no-answer': 'NO_ANSWER',
    'busy':      'BUSY',
    'failed':    'FAILED',
    'completed': 'COMPLETED',
    'canceled':  'CANCELED'
  };
  const outcome = statusMap[CallStatus] || CallStatus.toUpperCase();

  if (['no-answer', 'busy', 'failed', 'canceled'].includes(CallStatus)) {
    await logOutcome(To, CallSid, outcome);
  }

  // Clean up conversation memory
  if (conversations[CallSid]) delete conversations[CallSid];

  res.sendStatus(200);
});

// ── Log to Supabase ───────────────────────────────────────────────────────────
async function logOutcome(phone, callSid, status) {
  if (!process.env.SUPABASE_URL) {
    console.log(`[LOG] ${phone} → ${status} (Supabase not configured)`);
    return;
  }
  const { error } = await supabase
    .from('leads')
    .upsert({
      phone,
      call_sid: callSid,
      call_status: status,
      last_called_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'phone' });

  if (error) console.error('[SUPABASE]', error.message);
  else console.log(`[LOG] ${phone} → ${status}`);

  if (status === 'INTERESTED') {
    console.log(`\n🔥 HOT LEAD — ${phone} is ready to book. Follow up NOW.\n`);
  }
}

// ── Make a call ───────────────────────────────────────────────────────────────
async function makeCall(toNumber, businessName = '') {
  if (!FROM_NUMBER) throw new Error('TWILIO_FROM_NUMBER not set in .env');

  const normalized = toNumber.startsWith('+') ? toNumber : `+1${toNumber.replace(/\D/g, '')}`;
  const biz        = encodeURIComponent(businessName || 'there');

  const call = await twilioClient.calls.create({
    to:                   normalized,
    from:                 FROM_NUMBER,
    url:                  `${WEBHOOK_BASE}/call/start?business=${biz}`,
    statusCallback:       `${WEBHOOK_BASE}/call/status`,
    statusCallbackMethod: 'POST',
    machineDetection:     'Enable' // detect voicemail
  });

  console.log(`[JORDAN] Call initiated → ${normalized} | SID: ${call.sid}`);
  return call;
}

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n[JORDAN] Voice agent online — port ${PORT}`);
  console.log(`[JORDAN] Webhook: ${WEBHOOK_BASE}`);
  console.log(`[JORDAN] Voice: ${EL_KEY ? 'ElevenLabs' : 'Polly.Joanna (fallback)'}`);
  console.log(`[JORDAN] Brain: Claude claude-sonnet-4-6\n`);

  const target = process.argv[2];
  const bizName = process.argv[3] || '';

  if (target) {
    console.log(`[JORDAN] Calling ${target}${bizName ? ` (${bizName})` : ''}...`);
    try {
      await makeCall(target, bizName);
    } catch (e) {
      console.error('[JORDAN] Call failed:', e.message);
      process.exit(1);
    }
  }
});

module.exports = { makeCall };
