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
  if (!raw) return ['Sundays at 10:30 AM'];
  if (Array.isArray(raw)) return raw.map(s => escapeHtml(String(s)));
  return [escapeHtml(String(raw))];
}

// Map a pain point string to a value prop card { icon, title, body }
function painPointToValueProp(pt) {
  const p = String(pt).toLowerCase();
  if (p.includes('no website') || p.includes('website'))
    return { icon: '&#127760;', title: 'Find Us Easily Online', body: 'Our full website makes it simple for families to find service times, location, and connect with us instantly.' };
  if (p.includes('social media') || p.includes('no social'))
    return { icon: '&#128241;', title: 'Follow Our Community', body: 'Stay connected through social media — announcements, events, and Kingdom moments shared every week.' };
  if (p.includes('famil') || p.includes('reach') || p.includes('new member') || p.includes('grow'))
    return { icon: '&#128149;', title: 'Welcoming New Families Every Week', body: 'We make it easy for first-time visitors to find their place and feel at home from day one.' };
  if (p.includes('online giving') || p.includes('tithe') || p.includes('donat'))
    return { icon: '&#128184;', title: 'Simple Online Giving', body: 'Secure, easy giving online so your community can sow seeds from anywhere, anytime.' };
  if (p.includes('event') || p.includes('calendar'))
    return { icon: '&#128197;', title: 'Never Miss an Event', body: 'A live calendar keeps your congregation informed and engaged with every ministry event.' };
  // generic fallback
  return { icon: '&#10022;', title: 'Growing Together in Faith', body: 'Every resource and ministry designed to help our congregation grow stronger in Christ.' };
}

export function buildSiteHTML(data) {
  const churchName = escapeHtml(data.church_name || 'Our Church');
  const pastor     = escapeHtml(data.pastor_name || '');
  const tagline    = escapeHtml(data.tagline || 'A Place to Belong, Believe & Become');
  const phone      = escapeHtml(data.phone || '');
  const address    = escapeHtml(data.address || '');
  const city       = escapeHtml(data.city || 'Columbia, SC');
  const email      = escapeHtml(data.email || 'king@crownmediagroup.co');
  const website    = escapeHtml(data.website || '');
  const aboutLines = (data.notes || `${churchName} is a faith-driven community in ${city} where every soul is seen, every gift is celebrated, and every story matters.`);
  const about      = escapeHtml(aboutLines);
  const year       = new Date().getFullYear();

  const serviceTimes = normalizeServiceTimes(data.service_times);
  const firstService = serviceTimes[0];

  // Pain points → value props (up to 3 cards)
  const rawPains = Array.isArray(data.pain_points) ? data.pain_points : (data.pain_points ? [data.pain_points] : []);
  const valueProps = rawPains.slice(0, 3).map(painPointToValueProp);
  // Pad to 3 if fewer pain points provided
  while (valueProps.length < 3) {
    const defaults = [
      { icon: '&#10022;', title: 'Spirit-Filled Worship', body: 'Come as you are. Every service is designed to encounter God and leave transformed.' },
      { icon: '&#128149;', title: 'Real Community', body: 'Small groups, prayer partners, and friendships that walk with you through every season.' },
      { icon: '&#127775;', title: 'Serve & Grow', body: 'Discover your gifts, find your purpose, and build the Kingdom together.' },
    ];
    valueProps.push(defaults[valueProps.length]);
  }

  // JSON-LD schema
  const schemaAddress = address ? `{ "@type": "PostalAddress", "streetAddress": "${address.replace(/"/g, '\\"')}" }` : `{ "@type": "PostalAddress", "addressLocality": "${city.replace(/"/g, '\\"')}" }`;
  const schemaPhone   = phone   ? `"telephone": "${phone.replace(/"/g, '\\"')}",` : '';
  const schemaUrl     = website ? `"url": "${website.replace(/"/g, '\\"')}",` : '';
  const schemaHours   = serviceTimes.map(t => t.replace(/"/g, '\\"')).join(', ');

  // Service time cards HTML
  const serviceCardsHtml = serviceTimes.map((time, i) => {
    const icons = ['&#127929;', '&#128214;', '&#128591;', '&#127760;'];
    const icon  = icons[i % icons.length];
    return `        <div class="card svc-card">
          <div class="icon">${icon}</div>
          <h3>${time}</h3>
          <p>All are welcome. Come encounter God and connect with community.</p>
        </div>`;
  }).join('\n');

  // Value prop cards HTML
  const valuePropCardsHtml = valueProps.map(vp => `        <div class="card">
          <div class="icon">${vp.icon}</div>
          <h3>${vp.title}</h3>
          <p>${vp.body}</p>
        </div>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${churchName} — ${tagline}</title>

  <!-- SEO -->
  <meta name="description" content="${churchName} — ${tagline}. Serving ${city}. Join us ${firstService}.">
  <meta name="robots" content="index, follow">

  <!-- Open Graph -->
  <meta property="og:title" content="${churchName}">
  <meta property="og:description" content="${tagline}">
  <meta property="og:type" content="website">
  ${website ? `<meta property="og:url" content="${website}">` : ''}

  <!-- Schema.org JSON-LD -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Church",
    "name": "${churchName.replace(/"/g, '\\"')}",
    "address": ${schemaAddress},
    ${schemaPhone}
    ${schemaUrl}
    "openingHours": "${schemaHours}"
  }
  </script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
    :root {
      --royal:#1a3a8e; --royal-deep:#0f2452; --gold:#C9A84C;
      --ink:#0a1628; --paper:#ffffff; --soft:#f4f6fb;
    }
    html,body { font-family:'Inter',sans-serif; color:var(--ink); background:var(--paper); line-height:1.6; -webkit-font-smoothing:antialiased; }
    h1,h2,h3 { font-family:'Playfair Display',serif; line-height:1.2; }
    img { max-width:100%; display:block; }
    a { color:var(--royal); text-decoration:none; }
    a:hover { color:var(--royal-deep); }
    .container { max-width:1100px; margin:0 auto; padding:0 24px; }

    /* HEADER */
    header { background:var(--royal); color:#fff; padding:18px 0; position:sticky; top:0; z-index:50; box-shadow:0 2px 12px rgba(0,0,0,.1); }
    .nav { display:flex; justify-content:space-between; align-items:center; gap:24px; }
    .brand { font-family:'Playfair Display',serif; font-weight:800; font-size:22px; letter-spacing:.4px; }
    .nav-links { display:flex; gap:24px; flex-wrap:wrap; }
    .nav-links a { color:#fff; font-weight:500; font-size:15px; }
    .nav-links a:hover { color:var(--gold); }

    /* HERO */
    .hero { background:linear-gradient(135deg, var(--royal) 0%, var(--royal-deep) 100%); color:#fff; padding:96px 0 110px; text-align:center; position:relative; }
    .hero::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at top, rgba(201,168,76,.15), transparent 60%); pointer-events:none; }
    .hero h1 { font-size:clamp(38px,6vw,64px); font-weight:800; margin-bottom:18px; }
    .hero p.tag { font-size:clamp(18px,2.4vw,24px); color:#e8eef9; max-width:700px; margin:0 auto 32px; }
    .cta-row { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }
    .btn { display:inline-block; padding:16px 32px; border-radius:10px; font-weight:600; font-size:16px; transition:transform .2s, box-shadow .2s; }
    .btn-gold { background:var(--gold); color:var(--ink); }
    .btn-gold:hover { transform:translateY(-2px); box-shadow:0 8px 20px rgba(201,168,76,.4); color:var(--ink); }
    .btn-outline { background:transparent; color:#fff; border:2px solid #fff; }
    .btn-outline:hover { background:#fff; color:var(--royal); }

    /* SECTIONS */
    section { padding:80px 0; }
    section.alt { background:var(--soft); }
    .eyebrow { display:inline-block; color:var(--gold); font-weight:600; text-transform:uppercase; letter-spacing:2px; font-size:13px; margin-bottom:12px; }
    h2.section-title { font-size:clamp(30px,4vw,44px); margin-bottom:18px; color:var(--royal-deep); }
    .lead { font-size:18px; color:#3a4a6a; max-width:700px; margin:0 auto 36px; text-align:center; }

    /* CARDS */
    .grid-3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:24px; margin-top:40px; }
    .card { background:#fff; border:1px solid #e5e9f2; border-radius:14px; padding:32px 28px; transition:transform .2s, box-shadow .2s; }
    .card:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(15,36,82,.1); }
    .card .icon { width:48px; height:48px; border-radius:10px; background:linear-gradient(135deg,var(--royal),var(--royal-deep)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; margin-bottom:16px; }
    .card h3 { font-size:20px; color:var(--royal-deep); margin-bottom:8px; }
    .card p { color:#5a6a87; }
    .svc-card { border-top:3px solid var(--gold); }

    /* CONTACT INFO */
    .contact-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:32px; margin-top:32px; }
    .contact-card { text-align:center; padding:24px; }
    .contact-card .label { color:var(--gold); font-weight:600; text-transform:uppercase; letter-spacing:1.5px; font-size:12px; margin-bottom:8px; }
    .contact-card .value { font-size:18px; color:var(--royal-deep); font-weight:500; word-wrap:break-word; }

    /* CONTACT FORM */
    .form-wrap { max-width:640px; margin:40px auto 0; }
    .form-wrap input,
    .form-wrap textarea {
      display:block; width:100%; padding:14px 16px; margin-bottom:16px;
      border:1.5px solid #d0d8ee; border-radius:10px;
      font-family:'Inter',sans-serif; font-size:16px; color:var(--ink);
      background:#fff; transition:border-color .2s;
    }
    .form-wrap input:focus,
    .form-wrap textarea:focus { outline:none; border-color:var(--royal); }
    .form-wrap textarea { resize:vertical; }
    .form-wrap .btn-gold { width:100%; text-align:center; cursor:pointer; border:none; font-size:17px; padding:17px 32px; }
    .form-wrap .btn-gold:hover { transform:translateY(-2px); box-shadow:0 8px 20px rgba(201,168,76,.4); }

    /* FOOTER */
    footer { background:var(--royal-deep); color:#cfd8ee; padding:48px 0 28px; text-align:center; }
    footer .brand-foot { font-family:'Playfair Display',serif; font-weight:700; font-size:22px; color:#fff; margin-bottom:8px; }
    footer p { font-size:14px; margin:6px 0; }
    footer a { color:var(--gold); }

    @media (max-width:600px) {
      .nav-links { display:none; }
      .hero { padding:64px 0 76px; }
      section { padding:60px 0; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container nav">
      <div class="brand">${churchName}</div>
      <nav class="nav-links">
        <a href="#about">About</a>
        <a href="#services">Services</a>
        <a href="#why">Why Us</a>
        <a href="#contact">Contact</a>
      </nav>
    </div>
  </header>

  <section class="hero">
    <div class="container">
      <h1>${churchName}</h1>
      <p class="tag">${tagline}</p>
      <div class="cta-row">
        <a class="btn btn-gold" href="#services">Service Times</a>
        ${phone ? `<a class="btn btn-outline" href="tel:${phone.replace(/[^0-9+]/g, '')}">Call ${phone}</a>` : ''}
      </div>
    </div>
  </section>

  <section id="about">
    <div class="container">
      <div style="text-align:center">
        <span class="eyebrow">About Us</span>
        <h2 class="section-title">Welcome Home</h2>
        <p class="lead">${about}</p>
        ${pastor ? `<p style="margin-top:16px;color:var(--royal);font-weight:600">Led by ${pastor}</p>` : ''}
      </div>
    </div>
  </section>

  <section id="services" class="alt">
    <div class="container">
      <div style="text-align:center">
        <span class="eyebrow">Join Us</span>
        <h2 class="section-title">Service Times</h2>
        <p class="lead">All are welcome. Come as you are — there is a seat for you.</p>
      </div>
      <div class="grid-3">
${serviceCardsHtml}
      </div>
    </div>
  </section>

  <section id="why">
    <div class="container">
      <div style="text-align:center">
        <span class="eyebrow">Why ${churchName}?</span>
        <h2 class="section-title">What Sets Us Apart</h2>
        <p class="lead">We are not just a church — we are a family built on faith, love, and purpose.</p>
      </div>
      <div class="grid-3">
${valuePropCardsHtml}
      </div>
    </div>
  </section>

  <section id="contact" class="alt">
    <div class="container">
      <div style="text-align:center">
        <span class="eyebrow">Visit / Connect</span>
        <h2 class="section-title">Get In Touch</h2>
        <p class="lead">We would love to hear from you. Reach out below and we will get back to you shortly.</p>
      </div>
      <div class="contact-grid">
        ${address ? `<div class="contact-card"><div class="label">Location</div><div class="value">${address}</div></div>` : ''}
        ${phone   ? `<div class="contact-card"><div class="label">Phone</div><div class="value"><a href="tel:${phone.replace(/[^0-9+]/g, '')}">${phone}</a></div></div>` : ''}
        <div class="contact-card"><div class="label">Service Times</div><div class="value">${serviceTimes.join('<br>')}</div></div>
      </div>

      <div class="form-wrap">
        <h3 style="font-family:'Playfair Display',serif;font-size:24px;color:var(--royal-deep);text-align:center;margin-bottom:24px">Send Us a Message</h3>
        <form action="mailto:${email}" method="post" enctype="text/plain">
          <input type="text" name="name" placeholder="Your Name" required>
          <input type="email" name="email" placeholder="Your Email" required>
          <textarea name="message" placeholder="How can we help?" rows="4"></textarea>
          <button type="submit" class="btn btn-gold">Send Message</button>
        </form>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <div class="brand-foot">${churchName}</div>
      ${address ? `<p>${address}</p>` : ''}
      ${phone   ? `<p>${phone}</p>` : ''}
      <p style="margin-top:16px;font-size:13px;color:#8a96b8">&#169; ${year} ${churchName}. All rights reserved.</p>
      <p style="margin-top:8px;font-size:0.8rem;color:#aaa">
        Website by <a href="https://crownmediagroup.co" target="_blank" rel="noopener" style="color:#C9A84C">Crown Media Group</a> &mdash; Faith-Driven AI Marketing
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
