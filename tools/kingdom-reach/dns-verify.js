// tools/kingdom-reach/dns-verify.js
// LIGHTHOUSE (Agent 45) — DNS verification for a sending subdomain.
// Checks SPF (TXT v=spf1), DKIM (TXT under selector), DMARC (TXT _dmarc.<domain>).
// Returns green/yellow/red per record.
//
// Usage: node tools/kingdom-reach/dns-verify.js reach.crownmediagroup.co

import { promises as dnsAsync } from 'dns';
import { appendEvent } from './archive.js';
import { emit } from './herald.js';

const DKIM_SELECTORS_TO_TRY = ['resend', 'resend1', 'resend2', 'k1', 'mail', 'default', 's1', 's2'];

async function txt(name) {
  try {
    const records = await dnsAsync.resolveTxt(name);
    return records.map(r => r.join(''));
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA') return [];
    throw err;
  }
}

async function checkSPF(domain) {
  const records = await txt(domain);
  const spf = records.find(r => r.toLowerCase().startsWith('v=spf1'));
  if (!spf) return { status: 'red', record: null, msg: 'No SPF record found' };
  const ok = spf.includes('include:') && (spf.includes('-all') || spf.includes('~all'));
  return {
    status: ok ? 'green' : 'yellow',
    record: spf,
    msg: ok ? 'SPF present and complete' : 'SPF present but missing strict policy (-all/~all)',
  };
}

async function checkDKIM(domain) {
  const found = [];
  for (const selector of DKIM_SELECTORS_TO_TRY) {
    const records = await txt(`${selector}._domainkey.${domain}`);
    const dkim = records.find(r => r.startsWith('v=DKIM1') || r.startsWith('k='));
    if (dkim) found.push({ selector, record: dkim.slice(0, 80) + (dkim.length > 80 ? '…' : '') });
  }
  if (!found.length) return { status: 'red', records: [], msg: 'No DKIM record found across common selectors' };
  return { status: 'green', records: found, msg: `DKIM found for ${found.length} selector(s)` };
}

async function checkDMARC(domain) {
  const records = await txt(`_dmarc.${domain}`);
  const dmarc = records.find(r => r.startsWith('v=DMARC1'));
  if (!dmarc) return { status: 'red', record: null, msg: 'No DMARC record found' };
  const policy = (dmarc.match(/p=(\w+)/) || [])[1];
  const ok = policy === 'reject' || policy === 'quarantine';
  return {
    status: ok ? 'green' : 'yellow',
    record: dmarc,
    msg: policy ? `DMARC policy: ${policy}` : 'DMARC present but policy missing',
  };
}

export async function verifyDomain(domain) {
  const result = { domain, checked_at: new Date().toISOString() };
  result.spf   = await checkSPF(domain);
  result.dkim  = await checkDKIM(domain);
  result.dmarc = await checkDMARC(domain);

  const allGreen = [result.spf, result.dkim, result.dmarc].every(r => r.status === 'green');
  const anyRed   = [result.spf, result.dkim, result.dmarc].some(r => r.status === 'red');
  result.overall = allGreen ? 'green' : (anyRed ? 'red' : 'yellow');

  try {
    appendEvent({
      agent: 'LIGHTHOUSE',
      entity_type: 'domain',
      entity_id: domain,
      action: 'dns_verify',
      fields: {
        overall: result.overall,
        spf: result.spf.status,
        dkim: result.dkim.status,
        dmarc: result.dmarc.status,
      },
      source: 'dns-verify.js',
    });
    emit({
      agent: 'LIGHTHOUSE',
      severity: result.overall === 'green' ? 'P1' : (result.overall === 'red' ? 'P0' : 'P2'),
      action: `DNS check for ${domain} = ${result.overall}`,
      detail: `SPF:${result.spf.status} DKIM:${result.dkim.status} DMARC:${result.dmarc.status}`,
      next: result.overall === 'green' ? 'Safe to flip outbound to this domain' : 'Add missing DNS records before flipping',
    });
  } catch { /* archive/herald optional */ }

  return result;
}

// CLI
const argv1 = process.argv[1] || '';
if (argv1.endsWith('dns-verify.js') || argv1.endsWith('dns-verify.mjs')) {
  const domain = process.argv[2] || 'reach.crownmediagroup.co';
  console.log(`\nDNS verification for ${domain}\n${'─'.repeat(50)}\n`);
  const result = await verifyDomain(domain);
  for (const key of ['spf', 'dkim', 'dmarc']) {
    const r = result[key];
    const icon = r.status === 'green' ? '✓' : (r.status === 'yellow' ? '~' : '✗');
    console.log(`  ${icon} ${key.toUpperCase().padEnd(6)} ${r.status.padEnd(6)} ${r.msg}`);
    if (r.record) console.log(`         "${r.record.slice(0, 100)}${r.record.length > 100 ? '…' : ''}"`);
    if (r.records) for (const rec of r.records) console.log(`         [${rec.selector}] ${rec.record}`);
  }
  console.log(`\n  OVERALL: ${result.overall.toUpperCase()}\n`);
  if (result.overall === 'green') {
    console.log('  → Safe to set REACH_FROM_ADDRESS in Fly secrets and flip outbound.\n');
  } else {
    console.log('  → Add missing DNS records via Cloudflare before flipping outbound.\n');
    console.log('  Required Resend records (from https://resend.com/domains):');
    console.log('  • SPF:   TXT @  "v=spf1 include:amazonses.com ~all"');
    console.log('  • DKIM:  Three CNAMEs under resend._domainkey, etc. (Resend dashboard provides exact values)');
    console.log('  • DMARC: TXT _dmarc  "v=DMARC1; p=none; rua=mailto:king@crownmediagroup.co; sp=none; aspf=r;"\n');
  }
}
