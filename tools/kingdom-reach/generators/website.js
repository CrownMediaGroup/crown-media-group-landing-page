// generators/website.js — Builds a starter church website from extracted JSON
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { slugify } from '../schema.js';

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildSiteHTML(data) {
  const churchName  = escapeHtml(data.church_name || 'Our Church');
  const pastor      = escapeHtml(data.pastor_name || '');
  const tagline     = escapeHtml(data.tagline || 'A Place to Belong, Believe & Become');
  const phone       = escapeHtml(data.phone || '');
  const address     = escapeHtml(data.address || '');
  const services    = escapeHtml(data.service_times || 'Sundays at 10:30 AM');
  const aboutLines  = (data.notes || `${churchName} is a faith-driven community in Columbia, SC where every soul is seen, every gift is celebrated, and every story matters.`);
  const about       = escapeHtml(aboutLines);
  const year        = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${churchName} — ${tagline}</title>
  <meta name="description" content="${churchName}. ${tagline}. ${address ? 'Located at ' + address + '.' : ''}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
    :root {
      --royal:#1a3a8e; --royal-deep:#0f2452; --gold:#d4a73c;
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
    .hero::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at top, rgba(212,167,60,.15), transparent 60%); pointer-events:none; }
    .hero h1 { font-size:clamp(38px,6vw,64px); font-weight:800; margin-bottom:18px; }
    .hero p.tag { font-size:clamp(18px,2.4vw,24px); color:#e8eef9; max-width:700px; margin:0 auto 32px; }
    .cta-row { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }
    .btn { display:inline-block; padding:16px 32px; border-radius:10px; font-weight:600; font-size:16px; transition:transform .2s, box-shadow .2s; }
    .btn-gold { background:var(--gold); color:var(--ink); }
    .btn-gold:hover { transform:translateY(-2px); box-shadow:0 8px 20px rgba(212,167,60,.4); color:var(--ink); }
    .btn-outline { background:transparent; color:#fff; border:2px solid #fff; }
    .btn-outline:hover { background:#fff; color:var(--royal); }

    /* SECTIONS */
    section { padding:80px 0; }
    section.alt { background:var(--soft); }
    .eyebrow { display:inline-block; color:var(--gold); font-weight:600; text-transform:uppercase; letter-spacing:2px; font-size:13px; margin-bottom:12px; }
    h2.section-title { font-size:clamp(30px,4vw,44px); margin-bottom:18px; color:var(--royal-deep); }
    .lead { font-size:18px; color:#3a4a6a; max-width:700px; margin:0 auto 36px; text-align:center; }

    /* SERVICE CARD */
    .grid-3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:24px; margin-top:40px; }
    .card { background:#fff; border:1px solid #e5e9f2; border-radius:14px; padding:32px 28px; transition:transform .2s, box-shadow .2s; }
    .card:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(15,36,82,.1); }
    .card .icon { width:48px; height:48px; border-radius:10px; background:linear-gradient(135deg,var(--royal),var(--royal-deep)); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:22px; margin-bottom:16px; }
    .card h3 { font-size:20px; color:var(--royal-deep); margin-bottom:8px; }
    .card p { color:#5a6a87; }

    /* CONTACT */
    .contact-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:32px; margin-top:32px; }
    .contact-card { text-align:center; padding:24px; }
    .contact-card .label { color:var(--gold); font-weight:600; text-transform:uppercase; letter-spacing:1.5px; font-size:12px; margin-bottom:8px; }
    .contact-card .value { font-size:18px; color:var(--royal-deep); font-weight:500; word-wrap:break-word; }

    /* FOOTER */
    footer { background:var(--royal-deep); color:#cfd8ee; padding:48px 0 28px; text-align:center; }
    footer .brand-foot { font-family:'Playfair Display',serif; font-weight:700; font-size:22px; color:#fff; margin-bottom:8px; }
    footer p { font-size:14px; margin:6px 0; }
    footer .built { color:var(--gold); font-weight:600; margin-top:16px; }
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
        ${phone ? `<a class="btn btn-outline" href="tel:${phone.replace(/[^0-9+]/g,'')}">Call ${phone}</a>` : ''}
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
        <p class="lead">${services}</p>
      </div>
      <div class="grid-3">
        <div class="card">
          <div class="icon">✦</div>
          <h3>Worship Together</h3>
          <p>Spirit-filled worship every week. Come as you are — there's a seat for you.</p>
        </div>
        <div class="card">
          <div class="icon">✦</div>
          <h3>Real Community</h3>
          <p>Small groups, prayer, and friendships that walk with you through every season.</p>
        </div>
        <div class="card">
          <div class="icon">✦</div>
          <h3>Serve & Grow</h3>
          <p>Use your gifts. Find your purpose. Build the Kingdom together.</p>
        </div>
      </div>
    </div>
  </section>

  <section id="contact">
    <div class="container">
      <div style="text-align:center">
        <span class="eyebrow">Visit / Connect</span>
        <h2 class="section-title">Get In Touch</h2>
      </div>
      <div class="contact-grid">
        ${address ? `<div class="contact-card"><div class="label">Location</div><div class="value">${address}</div></div>` : ''}
        ${phone   ? `<div class="contact-card"><div class="label">Phone</div><div class="value"><a href="tel:${phone.replace(/[^0-9+]/g,'')}">${phone}</a></div></div>` : ''}
        <div class="contact-card"><div class="label">Service Times</div><div class="value">${services}</div></div>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <div class="brand-foot">${churchName}</div>
      <p>${address}</p>
      <p>${phone}</p>
      <p class="built">Website by <a href="https://crownmediagroup.co" target="_blank" rel="noopener">Crown Media Group</a></p>
      <p style="font-size:12px;color:#8a96b8;margin-top:12px">© ${year} ${churchName}. All rights reserved.</p>
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
