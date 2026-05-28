// tools/kingdom-reach/inkwell-smoke.js
// CC — INKWELL end-to-end validation test.
// Pre-flights Friday Touch-2 fire safety.
//
// Usage: GEMINI_API_KEY=... node tools/kingdom-reach/inkwell-smoke.js

import { refine } from './inkwell.js';
import { emit } from './herald.js';

const SAMPLE_SUBJECT = 'Helping First Baptist Columbia reach more families';
const SAMPLE_BODY = `Hi Pastor,

My name is David King. I'm a faith-aligned marketing professional based right here in Columbia, SC.

I work with churches across the area, and I noticed that First Baptist Columbia could probably benefit from a fresh approach to social media — more reels, more consistent posts, and a clearer way for families to find you on Google.

I'd love to share a few ideas I've put together specifically for First Baptist Columbia. Takes 10 minutes, zero commitment.

In Christ and in service,
King
Crown Media Group | king@crownmediagroup.co
crownmediagroup.co`;

async function main() {
  console.log('INKWELL smoke test');
  console.log('==================');
  console.log('');

  const start = Date.now();
  let result;
  try {
    result = await refine({
      subject: SAMPLE_SUBJECT,
      body: SAMPLE_BODY,
      agent_origin: 'WORDSMITH',
      context: 'church=First Baptist Columbia city=Columbia',
    });
  } catch (e) {
    console.error('CALL FAILED:', e.message);
    try {
      emit({ agent: 'INKWELL', severity: 'P0', action: 'INKWELL smoke FAILED', detail: e.message, next: 'Investigate before Friday Touch-2 fire' });
    } catch {}
    process.exit(1);
  }
  const elapsed = Date.now() - start;

  console.log(`Elapsed: ${elapsed}ms`);
  console.log('');

  // Assertions
  const checks = [
    { name: 'critique field present',        pass: !!result.critique && result.critique.length > 10 },
    { name: 'revised_body field present',    pass: !!result.revised_body && result.revised_body.length > 50 },
    { name: 'quality_gap is number 0-30',    pass: typeof result.quality_gap_estimate === 'number' && result.quality_gap_estimate >= 0 && result.quality_gap_estimate <= 30 },
    { name: 'revised_body differs from input', pass: result.revised_body && result.revised_body.trim() !== SAMPLE_BODY.trim() },
    { name: 'no JSON parse error',           pass: !result.parse_error },
  ];

  let allPass = true;
  for (const c of checks) {
    const icon = c.pass ? '✓' : '✗';
    console.log(`  ${icon} ${c.name}`);
    if (!c.pass) allPass = false;
  }
  console.log('');

  if (allPass) {
    console.log('━━━ ALL CHECKS PASSED ━━━');
    console.log('');
    console.log('Sample output:');
    console.log(`  Critique: ${result.critique}`);
    console.log(`  Revised subject: ${result.revised_subject}`);
    console.log(`  Quality gap estimate: ${result.quality_gap_estimate}%`);
    console.log(`  Revised body (first 200 chars): ${result.revised_body.slice(0, 200)}…`);
    try {
      emit({
        agent: 'INKWELL',
        severity: 'P2',
        action: 'INKWELL smoke PASSED',
        detail: `${elapsed}ms elapsed · quality_gap_estimate ${result.quality_gap_estimate}%`,
        next: 'Safe to fire INKWELL on Friday Touch-2 cold sends',
      });
    } catch {}
    process.exit(0);
  } else {
    console.log('━━━ SOME CHECKS FAILED ━━━');
    console.log('Raw result:', JSON.stringify(result, null, 2));
    try {
      emit({
        agent: 'INKWELL',
        severity: 'P0',
        action: 'INKWELL smoke FAILED',
        detail: `${checks.filter(c=>!c.pass).map(c=>c.name).join(', ')}`,
        next: 'DO NOT enable inkwell_enabled flag on Friday Touch-2 fire',
      });
    } catch {}
    process.exit(1);
  }
}

const argv1 = process.argv[1] || '';
if (argv1.endsWith('inkwell-smoke.js') || argv1.endsWith('inkwell-smoke.mjs')) {
  main();
}
