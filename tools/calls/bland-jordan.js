/**
 * bland-jordan.js — Jordan AI Voice Agent via Bland.ai
 * No Twilio upgrade needed. Calls any number immediately.
 *
 * Usage:  node tools/calls/bland-jordan.js +18038650233 "Anointed Cuts"
 * Deps:   npm install axios dotenv
 *
 * Get free API key: app.bland.ai → sign up → copy API key → add to .env
 * BLAND_API_KEY=your_key_here
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const axios = require('axios');
const path  = require('path');
const fs    = require('fs');

const BLAND_KEY    = process.env.BLAND_API_KEY;
const WEBHOOK_BASE = process.env.WEBHOOK_BASE_URL || '';
const LOG_FILE     = path.join(__dirname, '../../Agency/ops/notes/DAILY-LOG.md');

if (!BLAND_KEY) {
  console.error('\nMISSING: BLAND_API_KEY not set in .env');
  console.error('Get your key at: app.bland.ai\n');
  process.exit(1);
}

// ── Jordan's full system prompt ───────────────────────────────────────────────
const JORDAN_TASK = `
You are Jordan, a confident and warm outreach specialist for Crown Media Group — an AI-powered marketing agency based in Columbia, South Carolina. Your founder is David King.

YOUR MISSION: Book a free 15-minute content audit call at crownmediagroup.co/book

YOUR PERSONALITY:
- Warm, unhurried, direct. Never robotic or scripted-sounding.
- Local Columbia SC angle — mention it naturally, it builds instant trust.
- Confident but never pushy. Lead with value, ask for nothing upfront.
- Faith-infused only when it arises naturally. Never forced.
- Keep every response to 1-3 short sentences — this is a phone call.

CALL FLOW:
1. Opening (already delivered): "Hey, is this [BUSINESS_NAME]? I'm Jordan — quick local question for you."
2. Permission ask: "I know you're busy — I just have one quick question. Is that okay?"
3. Pain discovery — ask ONE question based on their business type:
   - Barber/salon: "When someone in Columbia is looking for a barber, is your business the first name they see online?"
   - Restaurant: "When someone searches for food in Columbia tonight, does your business come up?"
   - Faith-based: "Is your ministry reaching the people in Columbia it was built to serve?"
   - General: "When a new customer in Columbia tries to find what you offer, how easy is it to find you?"
4. Reflect their pain back, then pitch: "That's exactly what we fix. We're a local AI marketing agency right here in Columbia. We already helped a faith-based juice business here go from invisible online to consistent customer attention in under 30 days. I'd love to offer you a completely FREE 15-minute content audit — no pitch, no pressure, yours to keep."
5. Close: "I can get you on the calendar right now. The link is crownmediagroup.co/book — C-R-O-W-N media group dot C-O slash book. David our founder will be on the call himself. Which day works for you this week?"

OBJECTION HANDLING (respond with confidence, never apologize):
- Too expensive → "The audit is completely free — no cost, no commitment. What's there to lose?"
- Not interested → "I respect that. Is it marketing in general, or just the timing right now?"
- Too busy → "That's exactly why we built it as 15 minutes flat. No prep on your end — you just show up."
- I do it myself → "That's great. The audit just shows you what AI can add. Free, so zero risk in seeing it."
- Let me think → "Of course. What would make you feel good about saying yes today?"

PRICING (only if asked): "The audit is free. If you ever want to talk about working together, packages start at $750 a month — but that's a later conversation."

IF THEY ASK IF YOU'RE REAL: "I'm an AI assistant — David King is a real Columbia local and he'll be on the call personally."

BOOKING CLOSE (when they agree): "Perfect. The link is crownmediagroup.co/book — that's C-R-O-W-N media group dot C-O slash book. David will be on the call himself. Talk soon — God bless."

OPT-OUT: If they firmly decline, say "I'll remove you right now. Have a blessed day." and end the call.

MAX 4 MINUTES. If no booking by then, offer the link warmly and close.
NEVER say: amazing, absolutely, certainly, I totally understand, or any filler phrases.
`;

// ── Make a call via Bland.ai ──────────────────────────────────────────────────
async function callWithJordan(phoneNumber, businessName = '') {
  const normalized = phoneNumber.startsWith('+')
    ? phoneNumber
    : `+1${phoneNumber.replace(/\D/g, '')}`;

  const task = businessName
    ? JORDAN_TASK.replace('[BUSINESS_NAME]', businessName)
    : JORDAN_TASK.replace('[BUSINESS_NAME]', 'there');

  const payload = {
    phone_number:           normalized,
    task:                   task,
    voice:                  'maya',
    first_sentence:         `Hey, is this ${businessName || 'there'}? I'm Jordan — quick local question for you.`,
    wait_for_greeting:      true,
    max_duration:           5,
    record:                 true,
    temperature:            0.7,
    interruption_threshold: 80,
    language:               'en',
    dispositions:           ['INTERESTED', 'NO_ANSWER', 'OPT_OUT', 'NO_RESPONSE', 'BUSY', 'CALLBACK'],
    summary_prompt:         'Did the prospect agree to book a free audit call? What objections did they raise? What was the outcome?',
    metadata: {
      business_name: businessName,
      phone:         normalized,
      campaign:      'outbound-cold-call',
      agent:         'jordan'
    }
  };

  // Add webhook if we have a public URL
  if (WEBHOOK_BASE && !WEBHOOK_BASE.includes('localhost')) {
    payload.webhook = `${WEBHOOK_BASE}/bland/outcome`;
  }

  console.log(`\n[JORDAN/BLAND] Calling ${normalized}${businessName ? ` (${businessName})` : ''}...`);

  const response = await axios.post('https://api.bland.ai/v1/calls', payload, {
    headers: { 'authorization': BLAND_KEY }
  });

  const callId = response.data.call_id || response.data.id;
  console.log(`[JORDAN/BLAND] Call fired. ID: ${callId}`);

  // Log to daily log
  const entry = `\n[${new Date().toISOString()}] BLAND CALL FIRED | ${normalized} | ${businessName} | Call ID: ${callId}\n`;
  fs.appendFileSync(LOG_FILE, entry);

  return { callId, phone: normalized };
}

// ── Get call outcome ──────────────────────────────────────────────────────────
async function getCallResult(callId) {
  const response = await axios.get(`https://api.bland.ai/v1/calls/${callId}`, {
    headers: { 'authorization': BLAND_KEY }
  });
  return response.data;
}

// ── Poll for result (optional — use if no webhook) ────────────────────────────
async function waitForResult(callId, maxWaitMin = 10) {
  const maxAttempts = maxWaitMin * 4; // check every 15s
  console.log(`[JORDAN/BLAND] Waiting for call result (up to ${maxWaitMin} min)...`);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const result = await getCallResult(callId);

    if (result.status === 'completed' || result.status === 'failed') {
      console.log(`\n[JORDAN/BLAND] CALL COMPLETE`);
      console.log(`Status:       ${result.status}`);
      console.log(`Duration:     ${result.call_length || 0}s`);
      console.log(`Disposition:  ${result.disposition_tag || 'none'}`);
      console.log(`Summary:      ${result.summary || 'N/A'}`);
      if (result.disposition_tag === 'INTERESTED') {
        console.log('\n🔥 HOT LEAD — Follow up NOW. King needs to call back.\n');
      }
      return result;
    }

    process.stdout.write('.');
  }

  console.log('\n[JORDAN/BLAND] Timed out waiting. Check app.bland.ai for result.');
  return null;
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const phone   = process.argv[2];
  const bizName = process.argv[3] || '';

  if (!phone) {
    console.log('Usage: node tools/calls/bland-jordan.js <phone> [business name]');
    console.log('Example: node tools/calls/bland-jordan.js +18038650233 "Anointed Cuts"');
    process.exit(1);
  }

  callWithJordan(phone, bizName)
    .then(({ callId }) => waitForResult(callId))
    .catch(e => {
      console.error('[ERROR]', e.response?.data || e.message);
      process.exit(1);
    });
}

module.exports = { callWithJordan, getCallResult };
