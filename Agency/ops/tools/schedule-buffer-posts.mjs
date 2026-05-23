#!/usr/bin/env node
// schedule-buffer-posts.mjs — autonomous Buffer scheduling for Kingdom Reach launch
// Reads social captions from social-2026-05-22-kingdom-reach.md and queues them.
//
// Requires BUFFER_ACCESS_TOKEN in .env (already set).

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

function loadEnv() {
  const envPath = join(ROOT, '.env');
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue;
    const [k, ...rest] = line.split('=');
    env[k.trim()] = rest.join('=').trim();
  }
  return env;
}
const env = loadEnv();
const TOKEN = env.BUFFER_ACCESS_TOKEN;
if (!TOKEN) { console.error('BUFFER_ACCESS_TOKEN missing in .env'); process.exit(1); }

// Get connected profiles
console.log('Fetching Buffer profiles...');
const profilesResp = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${TOKEN}`);
if (!profilesResp.ok) {
  console.error('Buffer profiles fetch failed: HTTP ' + profilesResp.status);
  console.error(await profilesResp.text());
  process.exit(1);
}
const profiles = await profilesResp.json();
console.log('Found ' + profiles.length + ' Buffer profile(s):');
for (const p of profiles) {
  console.log('  ' + p.formatted_service + ' — ' + (p.formatted_username || p.service_username || '(unnamed)') + ' [id=' + p.id + ']');
}

// Index by service
const byService = {};
for (const p of profiles) {
  const svc = (p.service || '').toLowerCase();
  if (!byService[svc]) byService[svc] = [];
  byService[svc].push(p);
}

// 5 captions to schedule
// (Hard-coded matching the social-2026-05-22-kingdom-reach.md file — keeps this script self-contained
// in case the markdown structure changes later)
const posts = [
  {
    label: 'IG carousel #1 (Behind the build)',
    services: ['instagram'],
    schedule_for: '2026-05-23T13:00:00Z', // 8am EST
    text: `168 personalized pitches sent to faith-based organizations across Columbia and the Pee Dee tonight.

Not a blast. Not a template. 168 individually generated PDFs. 168 unique email bodies.

How it works in 6 slides ↓

Built on a Kingdom assignment, not a sales playbook. (Luke 6:38)

Crown Media Group — faith-aligned marketing & media. Columbia, SC.

If anything we offer would actually serve what you're building, the line is open. king@crownmediagroup.co · (908) 848-1436

#ColumbiaSC #FaithBasedMarketing #ChurchMarketing #BehindTheBuild #KingdomBusiness #ChristianEntrepreneur #ContentMarketing`
  },
  {
    label: 'Facebook long-form story',
    services: ['facebook'],
    schedule_for: '2026-05-23T17:00:00Z', // 12pm EST
    text: `We just did something tonight that I've been planning for six months.

Crown Media Group sent 168 personalized pitches to faith-based organizations across Columbia, SC and the Pee Dee region. Real organizations. Real pastors. Real ministries.

Not a blast. Not a templated mail merge. 168 individually generated PDFs, each tied to a single organization's record in our CRM. Each email body referenced that specific church or ministry. Each PDF had an audit ID that made cross-contamination impossible by design.

The offer is simple: Pick one thing from our stack — a 60-90 second video reel, a landing page mockup, a social media audit + 30-day content plan, anything else we do — and we'll build it for you free. First project. No strings.

This is Kingdom economy in business form (Luke 6:38). Give first. Trust the relationship to form when the value lands.

The whole system runs on autopilot now. Replies get scanned every 6 hours. Unsubscribes get honored automatically. The next wave fires Monday morning. I get to sleep while the Kingdom moves.

If you're a pastor or ministry leader who got tonight's email, the response is on you whenever you're ready. If you didn't get one and you want to talk, the line is always open. king@crownmediagroup.co or (908) 848-1436.

In Christ's service —
King`
  },
  {
    label: 'IG single #2 (The offer)',
    services: ['instagram'],
    schedule_for: '2026-05-23T22:00:00Z', // 5pm EST
    text: `If you got an email from us tonight, here's the short version one more time:

→ Pick one thing you want from our stack.
→ We build it. Free. First project.
→ No commitment. No upsell pressure.
→ You see the work. If it serves your ministry, we talk. If not, you keep the work.

This is Kingdom economy in business form. Give first. Trust the relationship to form.

(908) 848-1436 · king@crownmediagroup.co · crownmediagroup.co

#ChurchMarketing #FaithDriven #ColumbiaSC #CrownMediaGroup`
  },
  {
    label: 'LinkedIn 5 lessons',
    services: ['linkedin'],
    schedule_for: '2026-05-24T13:00:00Z', // Tuesday 9am EST
    text: `5 lessons from sending 168 personalized PDFs to faith-based organizations in one night:

1. Cross-contamination is the silent killer. Built our pitch generator to only see one record at a time — no batch merge fields, no shared state. The system literally can't write Church A's pastor name into Church B's PDF.

2. Personalization beats volume every time. We could have sent 5,000 templated emails. We sent 168 with everything from pastor's first name to org-type-specific language. Reply rate will tell us which strategy compounds.

3. Build for stewardship, not for stats. Every bounce, every unsubscribe, every reply gets logged with intent — not just to optimize, but to honor the human on the other end of the message.

4. Autopilot is the multiplier. Once the system was built, sending 168 emails took 65 minutes of automated throttled delivery. Next Monday it fires the next wave without me touching anything.

5. Give first. Always.

The free offer is the offer. There is no second offer hiding behind it. We build something useful for the first organization that says yes. If it helps their ministry, we talk about ongoing work. If not, they keep what we built.

Kingdom economy in business form (Luke 6:38).

Building Crown Media Group — faith-aligned marketing and media — from Columbia, SC.

#KingdomBusiness #B2BMarketing #ChurchMarketing #AIPersonalization #SmallBusiness #ColumbiaSC`
  },
  {
    label: 'IG reel #3 (Faith pillar)',
    services: ['instagram'],
    schedule_for: '2026-05-25T17:00:00Z', // Wednesday 12pm EST
    text: `I'm building a marketing agency the way the early church built ministries.

Give first.
Truth before tactics.
Excellence as worship (Col 3:23).
No false urgency, no manipulation, no over-promising.

Tonight 168 organizations got a free-project offer from us. No catch. No second offer hidden behind the first.

I'm not running a hustle. I'm running a calling.

If you're a pastor, school director, or ministry leader in Columbia or the Pee Dee, and anything we offer would help — call (908) 848-1436. We're here to serve.

#KingdomBusiness #FaithDriven #ColumbiaSC #SevenMountains #MarketplaceMinistry`
  },
];

// Schedule each post
const results = { scheduled: 0, failed: 0, errors: [] };
for (const post of posts) {
  // Pick first matching profile for each service requested
  const profileIds = [];
  for (const svc of post.services) {
    if (byService[svc] && byService[svc][0]) profileIds.push(byService[svc][0].id);
  }
  if (!profileIds.length) {
    console.log('SKIP: ' + post.label + ' — no Buffer profile for service(s) ' + post.services.join(', '));
    results.failed++;
    results.errors.push({ label: post.label, error: 'no profile' });
    continue;
  }

  // Buffer expects scheduled_at as Unix epoch in seconds
  const scheduledAtUnix = Math.floor(new Date(post.schedule_for).getTime() / 1000);

  const form = new URLSearchParams();
  form.set('access_token', TOKEN);
  for (const id of profileIds) form.append('profile_ids[]', id);
  form.set('text', post.text);
  form.set('scheduled_at', String(scheduledAtUnix));

  const resp = await fetch('https://api.bufferapp.com/1/updates/create.json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = await resp.json();
  if (resp.ok && data.success) {
    const updateIds = (data.updates || []).map(u => u.id);
    console.log('SCHEDULED: ' + post.label + ' at ' + post.schedule_for + ' (' + post.services.join(',') + ') updateIds=' + updateIds.join(','));
    results.scheduled++;
  } else {
    console.log('FAILED: ' + post.label + ' — ' + JSON.stringify(data));
    results.failed++;
    results.errors.push({ label: post.label, error: data });
  }
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('SCHEDULED: ' + results.scheduled);
console.log('FAILED:    ' + results.failed);
console.log('═══════════════════════════════════════════════════════════════');
