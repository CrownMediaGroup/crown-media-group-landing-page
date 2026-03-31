/**
 * gov-monitor.js — Daily Government Contract Opportunity Monitor
 * Crown Media Group | All Glory to Jesus Global LLC
 *
 * Checks daily:
 *   - SCBO (SC state contracts) — keyword search
 *   - SAM.gov API — NAICS code search
 *
 * Sends email digest to king@crownmediagroup.co via Resend
 * Deduplicates against Agency/personal/gov-opportunities/seen.json
 *
 * Usage:
 *   node Agency/tools/gov-monitor.js            (run once)
 *   node Agency/tools/gov-monitor.js --daemon   (run daily at 7 AM)
 */

const { chromium } = require('playwright');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config();

// ─── Config ─────────────────────────────────────────────────────────────────

const SEEN_FILE = path.join(__dirname, '../personal/gov-opportunities/seen.json');
const RESEND_KEY = process.env.RESEND_API_KEY;
const SAM_KEY = process.env.SAM_API_KEY || 'DEMO_KEY';
const EMAIL_TO = 'king@crownmediagroup.co';
const EMAIL_FROM = 'contracts@crownmediagroup.co';

const SCBO_KEYWORDS = ['marketing', 'advertising', 'branding', 'social media', 'digital marketing', 'communications', 'video production', 'public relations'];
const SAM_NAICS = ['541810', '541613', '541511', '541430', '512110', '541820', '518210'];

// ─── Deduplication ──────────────────────────────────────────────────────────

function loadSeen() {
  if (!fs.existsSync(SEEN_FILE)) {
    fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true });
    fs.writeFileSync(SEEN_FILE, JSON.stringify({ ids: [], lastRun: null }));
  }
  return JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
}

function saveSeen(seen) {
  seen.lastRun = new Date().toISOString();
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
}

// ─── SCBO Scraper ───────────────────────────────────────────────────────────

async function checkSCBO() {
  console.log('[gov-monitor] Checking SCBO...');
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    for (const keyword of SCBO_KEYWORDS) {
      try {
        // Navigate to SCBO text search
        await page.goto('https://webprod.cio.sc.gov/SCBOHome/adSearch.do', {
          waitUntil: 'domcontentloaded',
          timeout: 20000
        });

        // Find search input and submit
        const input = await page.$('input[name="searchText"], input[type="text"]');
        if (!input) continue;

        await input.fill(keyword);
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
          page.keyboard.press('Enter')
        ]);

        // Parse results table
        const rows = await page.$$eval('table tr', (trs) =>
          trs.slice(1).map(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length < 2) return null;
            const link = cells[1]?.querySelector('a');
            return {
              num: cells[0]?.textContent?.trim(),
              title: cells[1]?.textContent?.trim(),
              type: cells[2]?.textContent?.trim() || '',
              href: link?.href || ''
            };
          }).filter(r => r && r.title && r.title.length > 2)
        );

        // Only keep Universal Entry (open solicitations), skip Sole Source
        const open = rows.filter(r =>
          r.type && !r.type.toLowerCase().includes('sole source') && !r.type.toLowerCase().includes('emergency')
        );

        for (const r of open) {
          results.push({
            id: `scbo-${r.title.toLowerCase().replace(/\s+/g, '-').slice(0, 60)}`,
            title: r.title,
            type: r.type,
            source: 'SCBO',
            keyword,
            link: r.href || 'https://webprod.cio.sc.gov/SCBOHome/index.do'
          });
        }

        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.log(`[gov-monitor] SCBO keyword "${keyword}" error: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }

  // Deduplicate by title across keywords
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

// ─── SAM.gov API ────────────────────────────────────────────────────────────

async function checkSAMgov() {
  console.log('[gov-monitor] Checking SAM.gov...');
  const results = [];
  const today = new Date();
  const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
  const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;

  for (const naics of SAM_NAICS) {
    try {
      const res = await axios.get('https://api.sam.gov/opportunities/v2/search', {
        params: {
          api_key: SAM_KEY,
          ptype: 'presol,o,k,r',
          naics,
          postedFrom: fmt(weekAgo),
          postedTo: fmt(today),
          limit: 10,
          offset: 0,
          active: 'true'
        },
        timeout: 15000
      });

      const opps = res.data?.opportunitiesData || [];
      for (const o of opps) {
        results.push({
          id: o.noticeId || `sam-${o.title}-${o.postedDate}`,
          title: o.title,
          agency: o.department || o.subtierName || 'Federal Agency',
          type: o.type,
          naics,
          posted: o.postedDate,
          dueDate: o.responseDeadLine || 'See link',
          source: 'SAM.gov',
          link: `https://sam.gov/opp/${o.noticeId}/view`
        });
      }

      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      if (e.response?.status === 429) {
        console.log(`[gov-monitor] SAM.gov rate limit hit — upgrade from DEMO_KEY at api.sam.gov`);
      } else {
        console.log(`[gov-monitor] SAM.gov NAICS ${naics} error: ${e.message}`);
      }
    }
  }

  return results;
}

// ─── Email Builder ──────────────────────────────────────────────────────────

function buildEmail(newOpps) {
  const samOpps = newOpps.filter(o => o.source === 'SAM.gov');
  const scboOpps = newOpps.filter(o => o.source === 'SCBO');
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const oppCard = (o) => `
    <div style="background:#2a2a4e;padding:16px 20px;margin:10px 0;border-left:3px solid #B8860B;border-radius:2px;">
      <h3 style="color:#fff;margin:0 0 8px;font-size:15px;">${o.title}</h3>
      ${o.agency ? `<p style="color:#aaa;margin:3px 0;font-size:13px;">Agency: ${o.agency}</p>` : ''}
      ${o.naics ? `<p style="color:#aaa;margin:3px 0;font-size:13px;">NAICS: ${o.naics}</p>` : ''}
      ${o.dueDate ? `<p style="color:#E8B832;margin:3px 0;font-size:13px;">Due: ${o.dueDate}</p>` : ''}
      ${o.type ? `<p style="color:#aaa;margin:3px 0;font-size:13px;">Type: ${o.type}</p>` : ''}
      <a href="${o.link}" style="color:#B8860B;font-size:13px;font-weight:bold;">View Opportunity →</a>
    </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f0f1e;">
<div style="font-family:Georgia,serif;max-width:680px;margin:0 auto;background:#1a1a2e;padding:40px 36px;">

  <div style="border-bottom:2px solid #B8860B;padding-bottom:20px;margin-bottom:28px;">
    <h1 style="color:#B8860B;margin:0;font-size:22px;letter-spacing:.04em;">CROWN MEDIA GROUP</h1>
    <p style="color:#888;margin:6px 0 0;font-size:13px;">Daily Government Contract Monitor — ${date}</p>
  </div>

  <div style="background:#B8860B;color:#1a1a2e;padding:12px 20px;border-radius:2px;margin-bottom:28px;text-align:center;">
    <strong style="font-size:18px;">${newOpps.length} New Opportunit${newOpps.length === 1 ? 'y' : 'ies'} Found</strong>
  </div>

  ${samOpps.length > 0 ? `
    <h2 style="color:#B8860B;font-size:16px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:8px;">
      Federal — SAM.gov (${samOpps.length})
    </h2>
    ${samOpps.map(oppCard).join('')}
    <br>
  ` : ''}

  ${scboOpps.length > 0 ? `
    <h2 style="color:#B8860B;font-size:16px;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px solid #333;padding-bottom:8px;">
      SC State — SCBO (${scboOpps.length})
    </h2>
    ${scboOpps.map(oppCard).join('')}
    <br>
  ` : ''}

  ${newOpps.length === 0 ? `
    <div style="text-align:center;padding:32px;color:#666;">
      <p>No new opportunities today. System is running — check back tomorrow.</p>
    </div>
  ` : ''}

  <div style="border-top:1px solid #333;margin-top:32px;padding-top:20px;">
    <p style="color:#555;font-size:11px;margin:0;">
      All Glory to Jesus Global LLC · Crown Media Group · gov-monitor.js<br>
      SAM UEI: XLFXZQCQFTH7 · NAICS Primary: 541810<br>
      Next check: tomorrow 7:00 AM ET
    </p>
  </div>

</div>
</body>
</html>`;
}

// ─── Send Email ──────────────────────────────────────────────────────────────

async function sendEmail(html, count) {
  if (!RESEND_KEY) {
    console.log('[gov-monitor] No RESEND_API_KEY — skipping email. Add to .env');
    return;
  }

  const subject = count > 0
    ? `[${count} New] Gov Contract Opportunities — ${new Date().toLocaleDateString()}`
    : `Gov Monitor Running — No New Opps Today (${new Date().toLocaleDateString()})`;

  await axios.post('https://api.resend.com/emails', {
    from: EMAIL_FROM,
    to: EMAIL_TO,
    subject,
    html
  }, {
    headers: { Authorization: `Bearer ${RESEND_KEY}` }
  });

  console.log(`[gov-monitor] Email sent → ${EMAIL_TO}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n[gov-monitor] ${new Date().toISOString()} — starting daily check`);

  const seenData = loadSeen();
  const allNew = [];

  // SAM.gov
  try {
    const samResults = await checkSAMgov();
    for (const opp of samResults) {
      if (!seenData.ids.includes(opp.id)) {
        allNew.push(opp);
        seenData.ids.push(opp.id);
      }
    }
    console.log(`[gov-monitor] SAM.gov: ${samResults.length} found, ${allNew.filter(o => o.source === 'SAM.gov').length} new`);
  } catch (e) {
    console.log(`[gov-monitor] SAM.gov failed: ${e.message}`);
  }

  // SCBO
  try {
    const scboResults = await checkSCBO();
    for (const opp of scboResults) {
      if (!seenData.ids.includes(opp.id)) {
        allNew.push(opp);
        seenData.ids.push(opp.id);
      }
    }
    console.log(`[gov-monitor] SCBO: ${scboResults.length} found, ${allNew.filter(o => o.source === 'SCBO').length} new`);
  } catch (e) {
    console.log(`[gov-monitor] SCBO failed: ${e.message}`);
  }

  saveSeen(seenData);
  console.log(`[gov-monitor] Total new: ${allNew.length}`);

  const html = buildEmail(allNew);
  await sendEmail(html, allNew.length);

  console.log(`[gov-monitor] Done.\n`);
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

if (process.argv.includes('--daemon')) {
  console.log('[gov-monitor] Daemon mode — running daily at 7:00 AM ET');
  run(); // Run immediately on start
  cron.schedule('0 7 * * *', run, { timezone: 'America/New_York' });
} else {
  run().catch(e => {
    console.error('[gov-monitor] Fatal:', e.message);
    process.exit(1);
  });
}
