// generators/website.js — Builds a starter church website from extracted JSON
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { slugify } from '../schema.js';

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Normalize service_times to always be an array of escaped strings
function normalizeServiceTimes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(s => escapeHtml(String(s)));
  return [escapeHtml(String(raw))];
}

// Map denomination to worship style label
function worshipStyle(denomination = '') {
  const d = denomination.toLowerCase();
  if (d.includes('baptist') || d.includes('southern')) return 'Traditional';
  if (d.includes('pentecost') || d.includes('charismatic') || d.includes('apostolic')) return 'Spirit-led Worship';
  if (d.includes('methodist') || d.includes('presbyterian') || d.includes('lutheran')) return 'Traditional';
  if (d.includes('cogic') || d.includes('church of god') || d.includes('holiness')) return 'Gospel Worship';
  return 'Contemporary';
}

// Parse a service time string into parts { day, time, type }
function parseServiceTime(raw) {
  const s = String(raw);
  // Try to extract a day
  const dayMatch = s.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i);
  const day = dayMatch ? dayMatch[1] : '';
  // Try to extract a time
  const timeMatch = s.match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)/i);
  const time = timeMatch ? timeMatch[0] : '';
  // Whatever is left is the type label
  let label = s.replace(day, '').replace(time, '').replace(/[,\-–|]/g, '').trim();
  if (!label) label = 'Worship Service';
  return { day, time, label };
}

export function buildSiteHTML(data) {
  const churchName = escapeHtml(data.church_name || 'Our Church');
  const pastor     = escapeHtml(data.pastor_name || '');
  const churchDna  = escapeHtml(data.church_dna || '');
  const phone      = escapeHtml(data.phone || '');
  const rawAddress = escapeHtml(data.address || '');
  const city       = escapeHtml(data.city || '');
  const email      = escapeHtml(data.email || 'king@crownmediagroup.co');
  const instagram  = escapeHtml(data.instagram || '');
  const facebook   = escapeHtml(data.facebook || '');
  const denomination = escapeHtml(data.denomination || '');
  const year       = new Date().getFullYear();

  const rawQuotes  = Array.isArray(data.key_quotes) ? data.key_quotes : (data.key_quotes ? [data.key_quotes] : []);
  const firstQuote = rawQuotes.length ? escapeHtml(String(rawQuotes[0])) : '';

  const rawTimes   = normalizeServiceTimes(data.service_times);

  // Full address string for maps embed
  const fullAddress = [rawAddress, city].filter(Boolean).join(', ');
  const mapsQuery   = encodeURIComponent(fullAddress || churchName);

  // Worship style based on denomination
  const worshipLabel = worshipStyle(denomination);

  // Build service time cards (3-col grid)
  let serviceCardsHtml = '';
  if (rawTimes.length === 0) {
    serviceCardsHtml = `<div class="svc-empty">Contact us for current service times.</div>`;
  } else {
    serviceCardsHtml = rawTimes.map(t => {
      const { day, time, label } = parseServiceTime(t);
      return `<div class="svc-card">
          <div class="svc-day">${day || 'Weekly'}</div>
          <div class="svc-time">${time || t}</div>
          <div class="svc-label">${label}</div>
        </div>`;
    }).join('\n        ');
  }

  // Social buttons
  const igBtn = instagram
    ? `<a class="social-btn ig" href="${instagram}" target="_blank" rel="noopener">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
        Instagram
      </a>`
    : '';

  const fbBtn = facebook
    ? `<a class="social-btn fb" href="${facebook}" target="_blank" rel="noopener">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
        Facebook
      </a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${churchName}${churchDna ? ' — ' + churchDna : ''}</title>

  <!-- SEO -->
  <meta name="description" content="${churchName}${churchDna ? ' — ' + churchDna : ''}. ${city ? 'Serving ' + city + '.' : ''}">
  <meta name="robots" content="index, follow">

  <!-- Open Graph -->
  <meta property="og:title" content="${churchName}">
  <meta property="og:description" content="${churchDna || churchName}">
  <meta property="og:type" content="website">

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Church",
    "name": "${churchName.replace(/"/g, '\\"')}",
    "address": { "@type": "PostalAddress", "streetAddress": "${rawAddress.replace(/"/g, '\\"')}", "addressLocality": "${city.replace(/"/g, '\\"')}" }
    ${phone ? `, "telephone": "${phone.replace(/"/g, '\\"')}"` : ''}
  }
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --royal: #1a3a8e;
      --deep:  #0f2452;
      --gold:  #d4a73c;
      --ink:   #0a1628;
      --soft:  #f4f6fb;
      --white: #ffffff;
    }

    html, body {
      font-family: 'Inter', sans-serif;
      color: var(--ink);
      background: var(--white);
      line-height: 1.65;
      -webkit-font-smoothing: antialiased;
    }

    h1, h2, h3 { font-family: 'Playfair Display', serif; line-height: 1.2; }
    a { color: var(--royal); text-decoration: none; }
    a:hover { opacity: .85; }
    img { max-width: 100%; display: block; }

    .container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

    /* ── NAV ── */
    header {
      background: var(--deep);
      color: #fff;
      padding: 16px 0;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 16px rgba(0,0,0,.18);
    }
    .nav { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
    .brand { font-family: 'Playfair Display', serif; font-weight: 800; font-size: 21px; color: #fff; letter-spacing: .3px; }
    .nav-links { display: flex; gap: 28px; flex-wrap: wrap; }
    .nav-links a { color: #d0d8f0; font-weight: 500; font-size: 15px; transition: color .2s; }
    .nav-links a:hover { color: var(--gold); opacity: 1; }

    /* ── HERO ── */
    @keyframes shimmer {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    .hero {
      background: linear-gradient(135deg, #0f2452 0%, #1a3a8e 60%, #0f2452 100%);
      background-size: 200% 200%;
      animation: shimmer 8s ease infinite;
      color: #fff;
      padding: 110px 0 120px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 30% 20%, rgba(212,167,60,.18) 0%, transparent 55%),
                  radial-gradient(ellipse at 70% 80%, rgba(26,58,142,.3) 0%, transparent 50%);
      pointer-events: none;
    }
    .hero .container { position: relative; z-index: 1; }
    .hero h1 {
      font-size: clamp(32px, 6vw, 64px);
      font-weight: 800;
      margin-bottom: 18px;
      text-shadow: 0 2px 24px rgba(0,0,0,.25);
    }
    .hero .tagline {
      font-style: italic;
      color: var(--gold);
      font-size: clamp(16px, 2.4vw, 22px);
      max-width: 680px;
      margin: 0 auto 36px;
      opacity: .92;
    }
    .btn {
      display: inline-block;
      padding: 15px 34px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 16px;
      transition: transform .2s, box-shadow .2s;
      cursor: pointer;
    }
    .btn-gold {
      background: var(--gold);
      color: var(--ink);
    }
    .btn-gold:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 28px rgba(212,167,60,.45);
      color: var(--ink);
      opacity: 1;
    }

    /* ── SECTION BASE ── */
    section { padding: 84px 0; }
    section.alt { background: var(--soft); }
    .eyebrow {
      display: inline-block;
      color: var(--gold);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 2.5px;
      font-size: 12px;
      margin-bottom: 10px;
    }
    h2.sec-title {
      font-size: clamp(28px, 4vw, 44px);
      color: var(--deep);
      margin-bottom: 14px;
    }
    .sec-lead {
      font-size: 18px;
      color: #3a4a6a;
      max-width: 680px;
      margin: 0 auto 40px;
      text-align: center;
    }
    .sec-head { text-align: center; }

    /* ── SERVICE TIMES ── */
    .svc-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-top: 36px;
    }
    .svc-card {
      background: var(--white);
      border-radius: 14px;
      border-top: 4px solid var(--gold);
      padding: 28px 24px;
      text-align: center;
      box-shadow: 0 4px 18px rgba(15,36,82,.07);
      transition: transform .2s, box-shadow .2s;
    }
    .svc-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(15,36,82,.12); }
    .svc-day  { font-weight: 700; color: var(--royal); font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; }
    .svc-time { font-family: 'Playfair Display', serif; font-size: 26px; color: var(--deep); font-weight: 700; margin-bottom: 6px; }
    .svc-label { font-size: 14px; color: #5a6a87; }
    .svc-empty { text-align: center; padding: 28px; color: #5a6a87; font-style: italic; font-size: 17px; grid-column: 1/-1; }

    /* ── PASTOR SECTION ── */
    .pastor-wrap { max-width: 760px; margin: 0 auto; }
    .pastor-quote {
      border-left: 4px solid var(--gold);
      padding: 24px 32px;
      background: rgba(212,167,60,.06);
      border-radius: 0 12px 12px 0;
      margin-bottom: 28px;
    }
    .pastor-quote blockquote {
      font-style: italic;
      font-size: 20px;
      color: var(--deep);
      line-height: 1.6;
      margin-bottom: 14px;
      font-family: 'Playfair Display', serif;
    }
    .pastor-quote cite { font-size: 14px; color: var(--gold); font-weight: 600; font-style: normal; }
    .pastor-intro { font-size: 17px; color: #3a4a6a; text-align: center; margin-top: 20px; }

    /* ── WHAT TO EXPECT ── */
    .expect-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
      margin-top: 40px;
    }
    .expect-tile {
      background: var(--white);
      border-top: 4px solid var(--gold);
      border-radius: 14px;
      padding: 32px 24px 28px;
      box-shadow: 0 4px 18px rgba(15,36,82,.07);
      transition: transform .2s, box-shadow .2s;
    }
    .expect-tile:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(15,36,82,.12); }
    .expect-icon { font-size: 34px; margin-bottom: 14px; }
    .expect-tile h3 { font-size: 20px; color: var(--deep); margin-bottom: 10px; }
    .expect-tile p  { font-size: 15px; color: #5a6a87; line-height: 1.65; }

    /* ── CONTACT SECTION ── */
    .contact-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 28px;
      margin-top: 36px;
      margin-bottom: 36px;
    }
    .contact-item { text-align: center; }
    .contact-label { font-size: 11px; color: var(--gold); font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px; }
    .contact-value { font-size: 17px; color: var(--deep); font-weight: 500; word-break: break-word; }
    .contact-value a { color: var(--royal); }

    .map-wrap { border-radius: 14px; overflow: hidden; margin-bottom: 36px; box-shadow: 0 4px 24px rgba(15,36,82,.1); }

    .social-row { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 44px; }
    .social-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 11px 22px; border-radius: 8px;
      font-weight: 600; font-size: 14px;
      transition: transform .2s, box-shadow .2s;
      color: #fff;
    }
    .social-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,.2); opacity: 1; color: #fff; }
    .social-btn.ig { background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); }
    .social-btn.fb { background: #1877f2; }

    /* ── CONTACT FORM ── */
    .form-wrap { max-width: 640px; margin: 0 auto; }
    .form-wrap h3 {
      font-family: 'Playfair Display', serif;
      font-size: 26px;
      color: var(--deep);
      text-align: center;
      margin-bottom: 28px;
    }
    .form-wrap input,
    .form-wrap textarea {
      display: block; width: 100%;
      padding: 14px 16px; margin-bottom: 16px;
      border: 1.5px solid #d0d8ee; border-radius: 10px;
      font-family: 'Inter', sans-serif; font-size: 16px; color: var(--ink);
      background: var(--white); transition: border-color .2s;
    }
    .form-wrap input:focus,
    .form-wrap textarea:focus { outline: none; border-color: var(--royal); }
    .form-wrap textarea { resize: vertical; min-height: 120px; }
    .form-wrap .btn-submit {
      display: block; width: 100%;
      padding: 17px 32px; border: none; border-radius: 10px;
      background: var(--gold); color: var(--ink);
      font-family: 'Inter', sans-serif; font-size: 17px; font-weight: 700;
      cursor: pointer; transition: transform .2s, box-shadow .2s;
    }
    .form-wrap .btn-submit:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 28px rgba(212,167,60,.4);
    }

    /* ── FOOTER ── */
    footer {
      background: var(--ink);
      color: #8a97b8;
      padding: 52px 0 32px;
      text-align: center;
    }
    footer .foot-brand {
      font-family: 'Playfair Display', serif;
      font-weight: 700; font-size: 24px;
      color: #fff; margin-bottom: 10px;
    }
    footer p { font-size: 14px; margin: 5px 0; }
    footer .attribution { margin-top: 20px; font-size: 13px; color: #5a6a87; }
    footer .attribution a { color: var(--gold); }

    /* ── RESPONSIVE ── */
    @media (max-width: 760px) {
      .nav-links { display: none; }
      .hero { padding: 72px 0 80px; }
      section { padding: 60px 0; }
      .svc-grid { grid-template-columns: 1fr; }
      .expect-grid { grid-template-columns: 1fr; }
      .contact-details { grid-template-columns: 1fr; }
    }
    @media (min-width: 761px) and (max-width: 1024px) {
      .svc-grid { grid-template-columns: repeat(2, 1fr); }
      .expect-grid { grid-template-columns: repeat(2, 1fr); }
    }
  </style>
</head>
<body>

  <!-- NAV -->
  <header>
    <div class="container nav">
      <div class="brand">${churchName}</div>
      <nav class="nav-links">
        <a href="#services">Service Times</a>
        ${pastor ? '<a href="#pastor">Our Pastor</a>' : ''}
        <a href="#expect">What To Expect</a>
        <a href="#contact">Visit Us</a>
      </nav>
    </div>
  </header>

  <!-- HERO -->
  <section class="hero">
    <div class="container">
      <h1>${churchName}</h1>
      ${churchDna ? `<p class="tagline">${churchDna}</p>` : ''}
      <a class="btn btn-gold" href="#contact">Plan Your Visit</a>
    </div>
  </section>

  <!-- SERVICE TIMES -->
  <section id="services" class="alt">
    <div class="container">
      <div class="sec-head">
        <span class="eyebrow">Gather With Us</span>
        <h2 class="sec-title">Join Us</h2>
        <p class="sec-lead">All are welcome. Come as you are — there is a seat for you.</p>
      </div>
      <div class="svc-grid">
        ${serviceCardsHtml}
      </div>
    </div>
  </section>

  ${pastor ? `<!-- PASTOR SECTION -->
  <section id="pastor">
    <div class="container">
      <div class="sec-head">
        <span class="eyebrow">Leadership</span>
        <h2 class="sec-title">About Our Pastor</h2>
      </div>
      <div class="pastor-wrap">
        ${firstQuote ? `<div class="pastor-quote">
          <blockquote>"${firstQuote}"</blockquote>
          <cite>— Pastor ${pastor}</cite>
        </div>` : ''}
        <p class="pastor-intro">Pastor ${pastor} leads ${churchName} with a heart for the community.</p>
      </div>
    </div>
  </section>` : ''}

  <!-- WHAT TO EXPECT -->
  <section id="expect" class="alt">
    <div class="container">
      <div class="sec-head">
        <span class="eyebrow">First Time Here?</span>
        <h2 class="sec-title">What To Expect</h2>
        <p class="sec-lead">Here is what a Sunday at ${churchName} looks like.</p>
      </div>
      <div class="expect-grid">
        <div class="expect-tile">
          <div class="expect-icon">&#x1F64F;</div>
          <h3>Welcome</h3>
          <p>You will be greeted like family the moment you walk through our doors.</p>
        </div>
        <div class="expect-tile">
          <div class="expect-icon">&#x1F3B5;</div>
          <h3>Worship</h3>
          <p>${worshipLabel} worship that ushers you into the presence of God — come ready to encounter Him.</p>
        </div>
        <div class="expect-tile">
          <div class="expect-icon">&#x1F4D6;</div>
          <h3>The Word</h3>
          <p>Biblical teaching that is relevant to your everyday life — practical, powerful, and grounded in Scripture.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CONNECT / CONTACT -->
  <section id="contact">
    <div class="container">
      <div class="sec-head">
        <span class="eyebrow">Visit / Connect</span>
        <h2 class="sec-title">Connect With Us</h2>
        <p class="sec-lead">We would love to meet you. Reach out or stop by — you are always welcome.</p>
      </div>

      <div class="contact-details">
        ${fullAddress ? `<div class="contact-item">
          <div class="contact-label">Location</div>
          <div class="contact-value">${fullAddress}</div>
        </div>` : ''}
        ${phone ? `<div class="contact-item">
          <div class="contact-label">Phone</div>
          <div class="contact-value"><a href="tel:${phone.replace(/[^0-9+]/g, '')}">${phone}</a></div>
        </div>` : ''}
        ${email ? `<div class="contact-item">
          <div class="contact-label">Email</div>
          <div class="contact-value"><a href="mailto:${email}">${email}</a></div>
        </div>` : ''}
      </div>

      ${fullAddress ? `<div class="map-wrap">
        <iframe
          src="https://maps.google.com/maps?q=${mapsQuery}&output=embed"
          style="border:0;width:100%;height:300px"
          loading="lazy"
          title="Map to ${churchName}"
          allowfullscreen></iframe>
      </div>` : ''}

      ${(igBtn || fbBtn) ? `<div class="social-row">
        ${igBtn}
        ${fbBtn}
      </div>` : ''}

      <div class="form-wrap">
        <h3>Send Us a Message</h3>
        <form action="mailto:${email}" method="post" enctype="text/plain">
          <input type="text"  name="name"    placeholder="Your Name"    required>
          <input type="email" name="email"   placeholder="Your Email"   required>
          <textarea           name="message" placeholder="How can we help you?" rows="5"></textarea>
          <button type="submit" class="btn-submit">Send Message</button>
        </form>
      </div>
    </div>
  </section>

  <!-- FOOTER -->
  <footer>
    <div class="container">
      <div class="foot-brand">${churchName}</div>
      ${fullAddress ? `<p>${fullAddress}</p>` : ''}
      ${phone ? `<p>${phone}</p>` : ''}
      <p style="margin-top:12px;color:#6a7a9a">&#169; ${year} ${churchName}. All rights reserved.</p>
      <p class="attribution">
        Website by <a href="https://crownmediagroup.co" target="_blank" rel="noopener">Crown Media Group</a> &middot; crownmediagroup.co
      </p>
    </div>
  </footer>

</body>
</html>`;
}

export function writeSite(outputRoot, data) {
  const slug = slugify(data.church_name);
  const dir  = join(outputRoot, 'websites', slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(dir, 'index.html');
  writeFileSync(file, buildSiteHTML(data), 'utf8');
  return { slug, path: file, relPath: `output/websites/${slug}/index.html` };
}
