const XLSX = require('xlsx');
const fs = require('fs');

const wb = XLSX.readFile('Agency/ops/outreach/churches-columbia-sc.xlsx');
const ws = wb.Sheets['Master List'];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const tableRows = rows.map(r => {
  const tier = r.Tier || '';
  const social = r['Social Activity'] || '';
  const website = r.Website ? `<a href="https://${esc(r.Website)}" target="_blank" onclick="event.stopPropagation()">${esc(r.Website)}</a>` : '';
  const notes = esc(r.Notes || '');
  return `<tr onclick="toggleNote(this)" style="cursor:pointer" data-tier="${tier}" data-social="${social}" data-denom="${esc(r.Denomination)}">
  <td><span class="tier tier-${tier}">${tier}</span></td>
  <td><strong>${esc(r['Church Name'])}</strong></td>
  <td>${esc(r.Denomination)}</td>
  <td>${esc(r.ZIP)}</td>
  <td>${esc(r.Phone)}</td>
  <td>${website}</td>
  <td>${esc(r.Pastor)}</td>
  <td><span class="social social-${social}">${social}</span></td>
  <td>${esc(r['Best Service Fit'])}</td>
  <td><select onclick="event.stopPropagation()" onchange="updateStatus(this)">
    <option>Not Called</option><option>Called</option><option>Left Voicemail</option><option>Meeting Set</option><option>Not Interested</option>
  </select></td>
  <td class="notes-data" style="display:none">${notes}</td>
</tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Church Outreach â€” Columbia SC | Crown Media Group</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}
header{background:#1e293b;padding:20px 24px;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
header h1{font-size:20px;font-weight:700;color:#f8fafc}
header p{font-size:12px;color:#64748b;margin-top:2px}
.stats{display:flex;gap:12px}
.stat{background:#0f172a;padding:8px 14px;border-radius:8px;text-align:center;min-width:60px}
.stat strong{display:block;font-size:20px;font-weight:700;color:#f8fafc}
.stat span{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
.tabs{display:flex;gap:4px;padding:12px 24px 0;background:#0f172a;border-bottom:1px solid #334155}
.tab{padding:8px 16px;border-radius:6px 6px 0 0;font-size:13px;cursor:pointer;color:#64748b;background:#1e293b;border:1px solid #334155;border-bottom:none;transition:color .15s}
.tab.active{color:#f8fafc;background:#0f172a}
.panel{display:none}.panel.active{display:block}
.filters{padding:12px 24px;background:#1e293b;border-bottom:1px solid #334155;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.filters input{background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:6px 12px;border-radius:6px;font-size:13px;width:240px;outline:none}
.filters select{background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:6px 10px;border-radius:6px;font-size:13px;outline:none}
.count{font-size:12px;color:#64748b;margin-left:auto}
.table-wrap{overflow-x:auto;padding:0 24px 40px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th{background:#1e293b;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:2px solid #334155;white-space:nowrap;position:sticky;top:0;z-index:10}
td{padding:9px 12px;border-bottom:1px solid #1a2438;vertical-align:middle}
tr:hover td{background:#1e293b}
.tier{padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:.5px}
.tier-A{background:#064e3b;color:#10b981}
.tier-B{background:#1e3a5f;color:#60a5fa}
.tier-C{background:#451a03;color:#f59e0b}
.social{padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600}
.social-HIGH{background:#064e3b;color:#10b981}
.social-MEDIUM{background:#451a03;color:#f59e0b}
.social-LOW{background:#450a0a;color:#f87171}
.social-NONE{background:#1f2937;color:#6b7280}
.notes-row td{background:#162032!important;color:#94a3b8;font-size:12px;padding:8px 16px;border-left:3px solid #334155}
select{background:#1e293b;border:1px solid #334155;color:#e2e8f0;padding:4px 6px;border-radius:4px;font-size:12px}
a{color:#60a5fa;text-decoration:none}
a:hover{text-decoration:underline}
.script-box{background:#1e293b;margin:16px 24px;padding:20px;border-radius:8px;border:1px solid #334155}
.script-box h3{color:#f8fafc;font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #334155}
.script-box pre{white-space:pre-wrap;font-size:13px;color:#94a3b8;font-family:inherit;line-height:1.7}
.notes-data{display:none}
</style>
</head>
<body>

<header>
  <div>
    <h1>Church Outreach â€” Columbia SC</h1>
    <p>Crown Media Group &nbsp;|&nbsp; @mkdavidking &nbsp;|&nbsp; Generated 2026-04-30</p>
  </div>
  <div class="stats">
    <div class="stat"><strong style="color:#10b981">21</strong><span>Tier A</span></div>
    <div class="stat"><strong style="color:#60a5fa">48</strong><span>Tier B</span></div>
    <div class="stat"><strong style="color:#f59e0b">168</strong><span>Tier C</span></div>
    <div class="stat"><strong>237</strong><span>Total</span></div>
  </div>
</header>

<div class="tabs">
  <div class="tab active" onclick="showPanel('list',this)">All Churches</div>
  <div class="tab" onclick="showPanel('scripts',this)">Call Scripts</div>
  <div class="tab" onclick="showPanel('emails',this)">Email Templates</div>
  <div class="tab" onclick="showPanel('jobs',this)">Jobs Hiring Now</div>
</div>

<div id="list" class="panel active">
  <div class="filters">
    <input type="text" id="search" placeholder="Search church name, city, denomination..." oninput="filterTable()">
    <select id="tierFilter" onchange="filterTable()">
      <option value="">All Tiers</option>
      <option>A</option><option>B</option><option>C</option>
    </select>
    <select id="socialFilter" onchange="filterTable()">
      <option value="">All Social</option>
      <option>HIGH</option><option>MEDIUM</option><option>LOW</option><option>NONE</option>
    </select>
    <select id="denomFilter" onchange="filterTable()">
      <option value="">All Denominations</option>
      <option>Nondenominational</option><option>Southern Baptist</option><option>Baptist</option>
      <option>COGIC</option><option>AME</option><option>United Methodist</option>
      <option>Presbyterian (PCA)</option><option>Pentecostal</option><option>Apostolic</option>
      <option>Assemblies of God</option><option>Catholic</option><option>Lutheran</option>
    </select>
    <span class="count" id="count">237 churches</span>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Tier</th><th>Church Name</th><th>Denomination</th><th>ZIP</th><th>Phone</th>
        <th>Website</th><th>Pastor</th><th>Social</th><th>Best Fit</th><th>Status</th>
      </tr></thead>
      <tbody id="tableBody">
${tableRows}
      </tbody>
    </table>
  </div>
</div>

<div id="scripts" class="panel">
  <div class="script-box">
    <h3>Intro Script (Any Church)</h3>
    <pre>Hi, may I speak with the Pastor or Communications Director?

My name is David King. I'm a faith-aligned social media and marketing professional here in Columbia SC. I work with faith-based brands â€” including Shatiea, a faith-centered juice business â€” and I'm reaching out to churches in the area to see if I can be of service or if there are any opportunities to connect.

Do you have 10 minutes to talk this week?</pre>
  </div>
  <div class="script-box">
    <h3>Voicemail Script</h3>
    <pre>Hi, my name is David King. I'm a social media marketing professional based in Columbia SC at 29229. I specialize in working with faith-based organizations, and I'd love to connect with [Church Name] to see how I can serve your ministry. Please give me a call back or check out my work at crownmediagroup.co. God bless!</pre>
  </div>
  <div class="script-box">
    <h3>Objection: "We Already Have Someone"</h3>
    <pre>That's great! I completely understand. I'm not looking to replace anyone â€” I'd actually love to see how we could support or supplement what you're already doing, whether that's Reels production, ad campaigns, or content strategy. Even a quick conversation would be valuable. Is there a time that works?</pre>
  </div>
</div>

<div id="emails" class="panel">
  <div class="script-box">
    <h3>Email 1 â€” Cold Intro &nbsp;|&nbsp; Subject: Serving [Church Name]'s Ministry Through Social Media</h3>
    <pre>Hi [Pastor/Communications Director Name],

My name is David King. I'm a faith-aligned social media and marketing professional based right here in Columbia SC (29229).

I work with faith-based brands â€” including Shatiea, a faith-centered juice business â€” and I'm passionate about helping ministries expand their reach and impact online.

I'd love to offer [Church Name] a free 15-minute consultation to share a few ideas specific to your ministry. No pressure, no pitch â€” just Kingdom-focused conversation.

Would you be open to a quick call this week?

In His service,
David King
Crown Media Group | crownmediagroup.co | @mkdavidking</pre>
  </div>
  <div class="script-box">
    <h3>Email 2 â€” Follow-Up &nbsp;|&nbsp; Subject: Following Up â€” Serving [Church Name]</h3>
    <pre>Hi [Name],

Just following up on my note from last week. I know ministry is busy â€” I completely understand.

If now isn't the right time, I'm happy to reconnect whenever it works for you. I'm a local believer committed to serving the Columbia SC church community.

Would this week or next work for a 15-minute call?

Blessings,
David King</pre>
  </div>
  <div class="script-box">
    <h3>Email 3 â€” Proposal Request &nbsp;|&nbsp; Subject: Social Media Proposal for [Church Name]</h3>
    <pre>Hi [Name],

Thank you for our recent conversation! As promised, I've put together a quick overview of how I can serve [Church Name].

Services I offer:
â€¢ Social media content calendar (weekly posts + Reels)
â€¢ Paid ad campaigns (Meta/Google)
â€¢ Video production and scripting
â€¢ Monthly analytics report

Pricing starts at $300/mo for smaller ministries and scales from there.

I'd love to schedule a 30-minute Zoom to walk through the details. Does [Day/Time] work?

In His service,
David King</pre>
  </div>
</div>

<div id="jobs" class="panel">
  <div class="script-box">
    <h3 style="color:#10b981;font-size:16px">Church Jobs Hiring NOW â€” Top 50 | David King Skills: Social Media Â· Video Â· Content Â· Design</h3>
    <pre style="color:#64748b;font-size:12px">Updated: April 2026 &nbsp;|&nbsp; Ranked: SC Local first â†’ Remote â†’ Southeast â†’ National &nbsp;|&nbsp; Green = Apply Today Â· Blue = Strong Lead Â· Yellow = Inquire</pre>
  </div>

  <div class="script-box" style="background:#0a1f14;border:1px solid #10b981;border-radius:8px;margin:8px 24px">
    <h3 style="color:#10b981;text-transform:uppercase;letter-spacing:1px;font-size:12px">SC LOCAL â€” Apply Today (Within Driving Distance)</h3>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#1 â€” Riverland Hills Baptist Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">HOT â€” APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Content Creation &amp; Communication Associate (Part-Time)
<strong>Location:</strong> 201 Lake Murray Blvd, Irmo SC 29063 â€” ~20 min from 29229
<strong>Needs:</strong> Photo, video, Adobe Creative Suite, social media content, web support. Must be a believer in Jesus Christ.
<strong>Apply:</strong> bobbie@riverlandhills.org &nbsp;|&nbsp; (803) 753-6978 &nbsp;|&nbsp; riverlandhills.org/employment</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#2 â€” NewSpring Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Creative Video Specialist
<strong>Location:</strong> Anderson, SC (SC's largest church â€” 32,000+ weekly, 18 campuses)
<strong>Needs:</strong> Testimony + ministry videos, social media content, photography, video editing
<strong>Apply:</strong> newspring.cc/jobs &nbsp;|&nbsp; Also on churchstaffing.com/job/277474</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#3 â€” Seacoast Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Director of Social Media (Full-Time, 30 hrs/week)
<strong>Location:</strong> Mount Pleasant / Charleston, SC â€” 2 hrs from Columbia
<strong>Needs:</strong> Instagram, Facebook, YouTube, analytics, content calendar, photo/video oversight, ad campaigns
<strong>Apply:</strong> jobs.weekday.works/seacoast-church-director-of-social-media</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#4 â€” Concord Baptist Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">HOT â€” 3 DAYS OLD</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Director of Media &amp; Digital Communications
<strong>Location:</strong> Anderson, SC â€” 90 min from Columbia
<strong>Needs:</strong> AVL, social media (FB/IG/Twitter), graphic design, website, marketing strategy, volunteer teams
<strong>Apply:</strong> justchurchjobs.com/job/3036</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#5 â€” Transformation Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Communications Director (Full-Time)
<strong>Location:</strong> Indian Land, SC â€” near Charlotte border, 1.5 hrs from Columbia
<strong>Needs:</strong> 5+ yrs communications/marketing, Adobe Creative Suite, video editing, social media, web, email
<strong>Apply:</strong> churchstaffing.com/job/279062</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#6 â€” Mt. Horeb Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Director of Communications (Full-Time)
<strong>Location:</strong> Lexington, SC â€” 30 MINUTES FROM 29229
<strong>Needs:</strong> 5+ yrs, Adobe Creative Cloud, WordPress, social media strategy, team leadership
<strong>Apply:</strong> linkedin.com â†’ search "Mt Horeb Church Lexington SC Director Communications"</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#7 â€” Fellowship Greenville &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Communications Coordinator (Full-Time, 40 hrs/week)
<strong>Location:</strong> 3161 S Highway 14, Greenville SC 29615 â€” 90 min from Columbia
<strong>Needs:</strong> Social media, graphic design tools, writing, project management, media production workflow
<strong>Apply:</strong> fellowshipgreenville.org/application/employment/1</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#8 â€” Saxe Gotha Presbyterian &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Communications Associate (Part-Time)
<strong>Location:</strong> 5503 Sunset Blvd, Lexington SC 29072 â€” 20 min from 29229
<strong>Needs:</strong> Social media, marketing, newsletters, web, campaign coordination across ministries
<strong>Apply:</strong> tealhq.com/job/communications-associate_8e96f169-6509-4e63-85ba-7fb1d5a74400 &nbsp;|&nbsp; (803) 359-7770</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#9 â€” Pointe North Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">$60â€“70K</span></h3>
    <pre><strong>Role:</strong> Worship / Creative / Technology Director (Full-Time)
<strong>Location:</strong> Moncks Corner, SC â€” 90 min from Columbia (Lowcountry SC)
<strong>Needs:</strong> ProPresenter, Adobe Creative Suite, sermon series visuals, livestream, podcast, YouTube, social
<strong>Apply:</strong> careers@pointenorth.org &nbsp;|&nbsp; churchstaffing.com/job/285725</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#10 â€” Creative Church Marketing &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">$16/HR Â· REMOTE-FRIENDLY</span></h3>
    <pre><strong>Role:</strong> Social Media Manager (Agency serving multiple church clients)
<strong>Location:</strong> Greenville SC â€” hybrid/remote friendly
<strong>Needs:</strong> Agorapulse, Facebook/IG/Twitter/YouTube/TikTok, schedule content for multiple church accounts
<strong>Note:</strong> Agency role = managing multiple churches simultaneously. Great portfolio builder.
<strong>Apply:</strong> career.com/job/creative-church-marketing/social-media-manager/j202310130538427207925</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#11 â€” Redemption Church &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#1f2937;color:#9ca3af;padding:2px 8px;border-radius:4px;font-size:11px">PART-TIME 18 HRS</span></h3>
    <pre><strong>Role:</strong> Social Media Lead (Part-Time, 18 hrs/week â€” Sun/Mon/Tue)
<strong>Location:</strong> Greenville SC 29610 â€” 90 min from Columbia
<strong>Needs:</strong> IG, FB, Twitter, LinkedIn, TikTok, LinkTree, content strategy, analytics, video editing preferred
<strong>Apply:</strong> mediabistro.com/jobs/1010935879</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#12 â€” Hammond School &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">VERIFY OPEN</span></h3>
    <pre><strong>Role:</strong> Digital Media Coordinator (Columbia SC)
<strong>Needs:</strong> Social media, short-form video, Canva/CapCut/Adobe CC, photography
<strong>Apply:</strong> hammondschool.isolvedhire.com/jobs &nbsp;|&nbsp; hdrapeau@hammondschool.org &nbsp;|&nbsp; (803) 776-0295 ext. 1009</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #f59e0b">
    <h3>#13 â€” Eastminster Presbyterian &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">INQUIRE DIRECTLY</span> &nbsp;<span style="background:#0f172a;color:#64748b;padding:2px 8px;border-radius:4px;font-size:11px">ON YOUR CHURCH LIST</span></h3>
    <pre><strong>Role:</strong> Communications Creative Specialist (verify availability)
<strong>Location:</strong> 3200 Trenholm Rd, Columbia SC 29204
<strong>Needs:</strong> Graphic design, social media, photography, video, WordPress, content writing, MailChimp
<strong>Contact:</strong> info@eastminsterpres.org &nbsp;|&nbsp; (803) 256-1654 &nbsp;|&nbsp; eastminsterpres.org/careers</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #f59e0b">
    <h3>#14 â€” Mt. Horeb Lutheran Church (Chapin) &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">INQUIRE DIRECTLY</span></h3>
    <pre><strong>Role:</strong> Outreach Coordinator (Part-Time) â€” Chapin SC, ~25 min from 29229
<strong>Needs:</strong> Social media, newsletter/email, graphics, website updates
<strong>Apply:</strong> frontdesk@mthoreb.net â€” cover letter + resume + 3 references</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #f59e0b">
    <h3>#15 â€” 4 Points Church &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">POSTED APR 20</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Creative Arts Director / Pastor
<strong>Location:</strong> 2355 Hwy 101 South, Greer SC 29651 â€” 2 hrs from Columbia (fast-growing 300â†’1,000+ church)
<strong>Needs:</strong> Worship leadership, content development, creative direction, volunteer team building
<strong>Apply:</strong> 4points.org/jobs &nbsp;|&nbsp; austin@4points.org</pre>
  </div>

  <div class="script-box" style="background:#0a1f14;border:1px solid #10b981;border-radius:8px;margin:8px 24px">
    <h3 style="color:#10b981;text-transform:uppercase;letter-spacing:1px;font-size:12px">SC / SOUTHEAST â€” Faith Orgs &amp; Major Ministries (Priority A Adds)</h3>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#16 â€” NewSpring Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">$49â€“77K + HOUSING</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Production Director
<strong>Location:</strong> Anderson, SC â€” SC's largest church, 32,000+ weekly, 18 campuses
<strong>Needs:</strong> Oversee all production â€” video, lighting, audio, live streams, studio recordings. Staff leadership, volunteer training.
<strong>Pay:</strong> $49,000â€“$77,000 + housing allowance
<strong>Apply:</strong> newspring.cc/jobs</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#17 â€” NewSpring Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Creative Design Director
<strong>Location:</strong> Anderson, SC
<strong>Needs:</strong> Brand creative, motion graphics, print/digital design, social assets, campaign concepting. Lead a creative team.
<strong>Apply:</strong> newspring.cc/jobs</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#18 â€” Samaritan's Purse &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">FAITH NONPROFIT</span></h3>
    <pre><strong>Role:</strong> Social Media Strategist
<strong>Location:</strong> Boone, NC (Franklin Graham's global relief org â€” massive reach)
<strong>Needs:</strong> Content strategy, campaign execution across all platforms, analytics, audience growth, donor engagement
<strong>Apply:</strong> careers.samaritanspurse.org</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#19 â€” Samaritan's Purse &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">FAITH NONPROFIT</span></h3>
    <pre><strong>Role:</strong> Media Relations Specialist
<strong>Location:</strong> Boone, NC
<strong>Needs:</strong> Press releases, media pitching, story development, crisis communications, international mission media coverage
<strong>Apply:</strong> careers.samaritanspurse.org</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#20 â€” Billy Graham Evangelistic Association &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">HYBRID Â· CHARLOTTE NC</span></h3>
    <pre><strong>Role:</strong> Project Lead, Communications
<strong>Location:</strong> Charlotte, NC â€” hybrid (3 hrs from Columbia)
<strong>Needs:</strong> Communications project management, content coordination, cross-team campaigns, digital + print deliverables
<strong>Apply:</strong> careers.billygraham.org</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #93c5fd">
    <h3>#21 â€” LifeWay Christian Resources &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#0f172a;color:#64748b;padding:2px 8px;border-radius:4px;font-size:11px">SEASONAL REMOTE</span></h3>
    <pre><strong>Role:</strong> Seasonal Social Media Coordinator
<strong>Location:</strong> Fully remote â€” seasonal contract
<strong>Needs:</strong> Platform scheduling, content creation, community engagement, campaign support across Baptist church network
<strong>Apply:</strong> lifeway.com/careers (search Social Media on iCIMS)</pre>
  </div>

  <div class="script-box" style="background:#0a1220;border:1px solid #60a5fa;border-radius:8px;margin:8px 24px">
    <h3 style="color:#60a5fa;text-transform:uppercase;letter-spacing:1px;font-size:12px">REMOTE â€” Work From 29229, Get Paid</h3>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#22 â€” Church Media Squad &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">$60â€“65K W2 REMOTE</span></h3>
    <pre><strong>Role:</strong> Social Media Director (100% remote, MacBook provided)
<strong>Needs:</strong> Social media strategy for multiple church clients, content planning, captions, scheduling, analytics
<strong>Note:</strong> Manage social for multiple churches â€” runs parallel with your own agency
<strong>Apply:</strong> christiantechjobs.io/christian-jobs/remote-social-media-director-church-media-squad-1146</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#23 â€” TBN (Trinity Broadcasting Network) &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#0f172a;color:#64748b;padding:2px 8px;border-radius:4px;font-size:11px">FULLY REMOTE</span></h3>
    <pre><strong>Role:</strong> Social Media Manager (Fully Remote)
<strong>Needs:</strong> Adobe Premiere Pro, Photoshop, video editing, Instagram/FB/TikTok/YouTube/X/Snapchat, YouTube SEO
<strong>Apply:</strong> tbn.org/careers/remote/social-media-manager</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#24 â€” Desiring God &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#0f172a;color:#64748b;padding:2px 8px;border-radius:4px;font-size:11px">HYBRID REMOTE</span></h3>
    <pre><strong>Role:</strong> Social Media Specialist (hybrid, prefers local Minneapolis but flexible)
<strong>Needs:</strong> FB/IG/X/LinkedIn/YouTube, copywriting, content repurposing, cross-department
<strong>Apply:</strong> christiantechjobs.io/christian-jobs/remote-social-media-specialist-desiring-god-1108</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#25 â€” The Church Co &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#0f172a;color:#64748b;padding:2px 8px;border-radius:4px;font-size:11px">FULLY REMOTE</span></h3>
    <pre><strong>Role:</strong> Content Creator (Remote)
<strong>Needs:</strong> 3 yrs content creation, social media management, short-form video, graphic design, videography
<strong>Apply:</strong> christiantechjobs.io/christian-jobs/remote-content-creator-the-church-co-626</pre>
  </div>

  <div class="script-box" style="background:#1a0f2e;border:1px solid #8b5cf6;border-radius:8px;margin:8px 24px">
    <h3 style="color:#a78bfa;text-transform:uppercase;letter-spacing:1px;font-size:12px">SOUTHEAST â€” Drive Distance (NC Â· GA)</h3>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#26 â€” Elevation Church (Main Campus) &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">35K MEMBERS</span></h3>
    <pre><strong>Role:</strong> Social Media Manager
<strong>Location:</strong> Matthews, NC (Charlotte metro) â€” 3 hrs from Columbia
<strong>Needs:</strong> IG, FB, X, TikTok, LinkedIn, YouTube â€” managing 500K+ accounts, content calendars, short-form video editing
<strong>Apply:</strong> elevationchurch.org/jobs â†’ search Social Media Manager</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#27 â€” Elevation Worship Records &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">4M+ FOLLOWERS</span></h3>
    <pre><strong>Role:</strong> Social Media Manager (Elevation Worship Records)
<strong>Location:</strong> Matthews, NC â€” Mon-Thu office, Sunday campus
<strong>Needs:</strong> Managing all Elevation Worship platforms (4M+ Instagram), influencer campaigns, Premiere/CapCut
<strong>Apply:</strong> elevationchurch.org/jobs/be4ab819c759</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#28 â€” Elevation Church â€” Videographer (Worship Records) &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span></h3>
    <pre><strong>Role:</strong> Videographer â€” music videos, live performance, lyric videos, visualizers for major Christian label
<strong>Location:</strong> Matthews, NC
<strong>Needs:</strong> DaVinci Resolve, multi-camera, lighting, 3+ yrs, After Effects preferred
<strong>Apply:</strong> elevationchurch.org/jobs/42f10c4bbbcf</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#29 â€” Cornerstone Church Athens &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">FRESHEST POST â€” APR 13</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Social / Digital Media Coordinator (Full-Time)
<strong>Location:</strong> Athens, GA â€” ~3 hrs from Columbia
<strong>Needs:</strong> 3-5+ yrs, IG Reels, Stories, real-time Sunday content, photo/video, graphic design, paid ads (FB/IG/Google)
<strong>Apply:</strong> churchstaffing.com/job/286371</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#30 â€” 2819 Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Creative / Social Media Director (Full-Time)
<strong>Location:</strong> Stockbridge, GA â€” 3 hrs from Columbia
<strong>Needs:</strong> Adobe CC (Premiere, After Effects, Photoshop, Lightroom), DaVinci, social strategy, video production, branding
<strong>Apply:</strong> christiantechjobs.io/christian-jobs/creative-social-media-director-2819-church-1010</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#31 â€” First Redeemer Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">FAITH REQUIRED</span></h3>
    <pre><strong>Role:</strong> Graphic Designer &amp; Social Media Manager (Full-Time)
<strong>Location:</strong> Cumming, GA â€” ~3.5 hrs from Columbia
<strong>Needs:</strong> Adobe CC (PS/LR/AI/Premiere), IG/FB/YouTube/TikTok, content calendar, analytics, photo/video
<strong>Apply:</strong> churchstaffing.com/job/285567</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#32 â€” New Life Church Canton &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span></h3>
    <pre><strong>Role:</strong> Creative Director (Media) â€” Full-Time
<strong>Location:</strong> Canton, GA â€” ~3.5 hrs from Columbia
<strong>Needs:</strong> Adobe Premiere/Final Cut, sermon clips (2-3/week), announcement videos, livestream (Resi), brand
<strong>Apply:</strong> churchstaffing.com/job/280996</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #10b981">
    <h3>#33 â€” Gateway Church Bloomingdale &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">APPLY NOW</span></h3>
    <pre><strong>Role:</strong> Creative Content Manager (Full-Time) â€” strong portfolio required
<strong>Location:</strong> Bloomingdale, GA (Savannah area) â€” ~3.5 hrs from Columbia
<strong>Needs:</strong> 5+ yrs videography/content, Adobe Premiere/FCP/DaVinci, photography, podcast, team leadership
<strong>Apply:</strong> churchjobsonline.com/jobs/creative-content-manager-bloomingdale-ga/1926</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#34 â€” Elevation Church â€” Content Creator (NextGen) &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span></h3>
    <pre><strong>Role:</strong> Content Creator â€” eKidz + YTH Ministries
<strong>Location:</strong> Matthews, NC
<strong>Needs:</strong> Adobe CC (PS/AI/InDesign/Figma), IG/YouTube/TikTok, 3-second hooks, motion graphics a plus
<strong>Apply:</strong> elevationchurch.org/jobs/85cf681181e2</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#35 â€” Elevation Church â€” Video Producer &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span></h3>
    <pre><strong>Role:</strong> Video Producer (Media Creative Team)
<strong>Location:</strong> Matthews, NC
<strong>Needs:</strong> Production logistics, location scouting, budget, shoot coordination, cross-functional creative team
<strong>Apply:</strong> builtincharlotte.com/job/video-producer-media-creative-team/6177632</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#36 â€” Access Church &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span></h3>
    <pre><strong>Role:</strong> Content Specialist (Multi-Campus)
<strong>Needs:</strong> Photo/video across all campuses, volunteer photography team lead, Reels, sermon clips, Planning Center
<strong>Apply:</strong> access.tv/careers/videographer-filmmaker</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#37 â€” Hope Church Richmond &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span></h3>
    <pre><strong>Role:</strong> Videographer + Content Creator
<strong>Location:</strong> Richmond, VA â€” 5 hrs from Columbia
<strong>Needs:</strong> High-quality video for social + digital, photography, light graphic design, Adobe Premiere/DaVinci
<strong>Apply:</strong> jobs.crtvchurch.com/2e349b7959a280d0b60ec0e5736cdfcd</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#38 â€” Forest Hills Baptist Church &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span></h3>
    <pre><strong>Role:</strong> Communications &amp; Multi-Media Coordinator (Full-Time)
<strong>Location:</strong> 201 Dixie Trail, Raleigh NC 27612 â€” ~3 hrs from Columbia
<strong>Needs:</strong> Print + digital communications, multimedia deliverables, ministry coordination, publicity
<strong>Apply:</strong> careers@foresthills.org</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#39 â€” Alive Church Orlando &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px">$50â€“55K SALARY LISTED</span></h3>
    <pre><strong>Role:</strong> Graphic Design / Videographer (Full-Time)
<strong>Location:</strong> Orlando, FL â€” 6.5 hrs from Columbia
<strong>Needs:</strong> Brand graphics + video, Adobe CC, motion support, ministry content across platforms. Salary: $50-55K.
<strong>Apply:</strong> jobs.crtvchurch.com/content/graphic-design-videographer</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#40 â€” Southeast Christian Church &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span> &nbsp;<span style="background:#1e1035;color:#a78bfa;padding:2px 8px;border-radius:4px;font-size:11px">20K MEMBERS</span></h3>
    <pre><strong>Role:</strong> Video Content Creator (Central Ministry)
<strong>Location:</strong> Louisville, KY
<strong>Needs:</strong> Central ministry video content, social media clips, multi-platform delivery
<strong>Apply:</strong> jobs.crtvchurch.com/content/video-content-creator-central-ministry</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#41 â€” Long Hollow Church &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">FEATURED NOW</span></h3>
    <pre><strong>Role:</strong> Social Media Content Creator
<strong>Location:</strong> Hendersonville, TN (Nashville metro)
<strong>Needs:</strong> Platform content, social-first video, photography, graphic design support
<strong>Apply:</strong> jobs.crtvchurch.com â†’ search Long Hollow Church</pre>
  </div>

  <div class="script-box" style="background:#0f172a;border:1px solid #334155;border-radius:8px;margin:8px 24px">
    <h3 style="color:#94a3b8;text-transform:uppercase;letter-spacing:1px;font-size:12px">NATIONAL / MAJOR BRANDS (Relocate or Long-Shot Apply)</h3>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#42 â€” Life.Church (YouVersion) â€” Brand Filmmaker &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">500M USERS</span></h3>
    <pre><strong>Role:</strong> Brand Filmmaker â€” content for the YouVersion Bible App (500M+ downloads)
<strong>Location:</strong> Edmond, OK
<strong>Needs:</strong> Sony cinema cameras, directing small crews, color grading, pre-prod through post, managing contractors
<strong>Apply:</strong> jobs.lever.co/life/ae224d36-28dc-405e-9e9f-5b7375c162eb</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#43 â€” Life.Church â€” Filmmaker &nbsp;<span style="background:#1e3a5f;color:#60a5fa;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">STRONG LEAD</span></h3>
    <pre><strong>Role:</strong> Filmmaker (Creative Media Group â€” internal ministry teams)
<strong>Location:</strong> Edmond, OK &nbsp;|&nbsp; Apply: life.church/careers/find-a-role</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #60a5fa">
    <h3>#44 â€” Generation Church &nbsp;<span style="background:#064e3b;color:#10b981;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">POSTED APR 1</span></h3>
    <pre><strong>Role:</strong> Social Media &amp; Content Manager â€” manage Lead Pastor's personal platforms
<strong>Location:</strong> Mesa, AZ &nbsp;|&nbsp; Needs: Pastor's IG/YouTube/FB/podcast, record + edit + post + analyze
<strong>Apply:</strong> preaching.churchstaffing.com/job/286195</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #f59e0b">
    <h3>#45 â€” Frisco Bible Church &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">$65K SALARY</span></h3>
    <pre><strong>Role:</strong> Communications Director â€” Frisco, TX &nbsp;|&nbsp; Salary: $65,000
<strong>Needs:</strong> DaVinci/Premiere, social media, web, project management, branding
<strong>Apply:</strong> churchstaffing.com/job/286228</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #f59e0b">
    <h3>#46 â€” Eagle Creek Church &nbsp;<span style="background:#451a03;color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">$40â€“45K SALARY</span></h3>
    <pre><strong>Role:</strong> Social Media Manager / Graphic Designer â€” Lee's Summit, MO (Kansas City)
<strong>Needs:</strong> Social media strategy + graphic design, storytelling, brand management
<strong>Apply:</strong> jobs.crtvchurch.com/content/social-media-manager-graphic-designer</pre>
  </div>

  <div class="script-box" style="border-left:3px solid #334155">
    <h3>#47â€“50 â€” Additional Open Positions</h3>
    <pre>#47 Peachtree Church Atlanta â€” Video Production Manager | mediabistro.com/jobs/1279683400
#42 Hermitage Hills Baptist Nashville â€” Communications Director | churchstaffing.com (search)
#43 Westminster Presbyterian Spartanburg SC â€” Communications Coordinator | Contact Cathy Hyatt
#44 Fellowship of Montgomery Houston TX â€” Social Media Manager | jobs.crtvchurch.com
#45 Covenant Church NC Greenville NC â€” Communications Director | thegospelcoalition.org/job/communication-director-3
#46 The Island Church Orange Beach AL â€” Digital Marketing Brand Manager | matt@theislandchurch.tv
#47 Faith Outreach Church Hephzibah GA â€” Multimedia Specialist | wafj.com/jobs/job-listings/?job=392433
#48 Dalton First UMC Dalton GA â€” Director of Worship &amp; Media | justchurchjobs.com/job/4024
#49 Walterboro First Baptist SC â€” Worship &amp; Media Director | shepherd-staff.app.loxo.co
#50 Life.Church â€” Director of Social Media (senior, 7+ yrs) | jobs.lever.co/life/8743f85e-833c-41c8-87a7-27363cd8168c</pre>
  </div>

  <div class="script-box" style="background:#0a1220">
    <h3 style="color:#60a5fa">Bookmark These Job Boards â€” Check Weekly</h3>
    <pre>jobs.crtvchurch.com â€” #1 board for church creatives. Subscribe for email alerts.
churchstaffing.com/jobs/category/communications-marketing â€” Deep inventory, updated daily
elevationchurch.org/jobs â€” Direct from Elevation, no aggregator delay
newspring.cc/jobs â€” Direct from NewSpring SC
life.church/careers/find-a-role â€” Direct from Life.Church
christiantechjobs.io â€” Remote + tech-forward church roles
jobs.sbc.net â€” Southern Baptist nationwide
justchurchjobs.com â€” Growing board, fresh posts
weekday.works â€” Curated church jobs, quality over quantity
mediabistro.com â€” Broader but catches major church listings</pre>
  </div>
</div>

<script>
function filterTable() {
  const q = (document.getElementById('search').value || '').toLowerCase();
  const tier = document.getElementById('tierFilter').value;
  const social = document.getElementById('socialFilter').value;
  const denom = document.getElementById('denomFilter').value;
  const rows = document.querySelectorAll('#tableBody tr:not(.notes-row)');
  let visible = 0;
  rows.forEach(r => {
    const text = r.textContent.toLowerCase();
    const show = (
      (!q || text.includes(q)) &&
      (!tier || r.dataset.tier === tier) &&
      (!social || r.dataset.social === social) &&
      (!denom || r.dataset.denom.includes(denom))
    );
    r.style.display = show ? '' : 'none';
    const next = r.nextElementSibling;
    if (next && next.classList.contains('notes-row')) next.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  document.getElementById('count').textContent = visible + ' churches';
}

function toggleNote(row) {
  if (row.classList.contains('notes-row')) return;
  const next = row.nextElementSibling;
  if (next && next.classList.contains('notes-row')) { next.remove(); return; }
  const notesCell = row.querySelector('.notes-data');
  const notesText = notesCell ? notesCell.textContent.trim() : '';
  if (!notesText) return;
  const nr = document.createElement('tr');
  nr.className = 'notes-row';
  nr.innerHTML = '<td colspan="10">' + notesText + '</td>';
  row.after(nr);
}

function updateStatus(sel) {
  const colors = {
    'Not Called': '#6b7280', 'Called': '#3b82f6', 'Left Voicemail': '#8b5cf6',
    'Meeting Set': '#10b981', 'Not Interested': '#ef4444'
  };
  sel.style.color = colors[sel.value] || '#e2e8f0';
}

function showPanel(id, tab) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  tab.classList.add('active');
}
</script>
</body>
</html>`;

fs.writeFileSync('Agency/ops/outreach/churches-columbia-sc.html', html);
console.log('done â€” ' + rows.length + ' churches');
