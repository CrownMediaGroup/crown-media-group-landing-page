#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');
const { format, parseISO, isValid } = require('date-fns');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const OUTPUT_DIR = path.join(ROOT, 'blog');
const SITE_URL = 'https://crownmediagroup.co';
const SITE_NAME = 'Crown Media Group';

// ─── Brand constants (from brand.json + index.html) ───────────────────────────
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">`;

const BRAND_VARS = `--white:#FFFFFF;--cream:#FDFBF7;--warm:#F9F5EE;--gold:#C9981A;--gold-light:#E8B832;--gold-deep:#9A720D;--gold-pale:#F5E6B8;--royal:#1A1A3E;--royal-mid:#2D2D5A;--royal-deep:#0F0F28;--text:#1A1A2E;--text-mid:#4A4A6A;--text-light:#8A8AAA;--border:rgba(201,152,26,0.2);--border-soft:rgba(201,152,26,0.1)`;

// ─── Ambient music snippet (Tone.js CDN — C major worship pad) ────────────────
const AMBIENT_CSS = `
#ambient-toggle{position:fixed;bottom:32px;right:32px;z-index:9000;width:52px;height:52px;border-radius:50%;background:rgba(26,26,62,0.82);border:1px solid rgba(201,152,26,0.4);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .2s,background .2s;box-shadow:0 4px 24px rgba(0,0,0,.32)}
#ambient-toggle:hover{border-color:var(--gold);background:rgba(26,26,62,.95)}
#ambient-toggle svg{width:22px;height:22px;color:var(--gold-light)}
.ambient-playing svg{color:var(--gold)!important}
.vol-wrap{display:none;position:absolute;bottom:60px;right:0;background:rgba(26,26,62,.9);border:1px solid rgba(201,152,26,.3);border-radius:8px;padding:12px 10px;backdrop-filter:blur(12px)}
#ambient-toggle:hover .vol-wrap{display:block}
#vol-slider{writing-mode:vertical-lr;direction:rtl;width:4px;height:80px;cursor:pointer;accent-color:var(--gold)}`;

const AMBIENT_HTML = `
<div id="ambient-toggle" title="Ambient music" aria-label="Toggle ambient music">
  <div class="vol-wrap"><input type="range" id="vol-slider" min="0" max="1" step="0.01" value="0.18"></div>
  <svg id="ambient-icon-play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
  <svg id="ambient-icon-pause" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
</div>
<script src="https://cdn.jsdelivr.net/npm/tone@14.7.77/build/Tone.js"></script>
<script>
(function(){
  var isMobile=/Mobi|Android/i.test(navigator.userAgent);
  var btn=document.getElementById('ambient-toggle');
  var iconPlay=document.getElementById('ambient-icon-play');
  var iconPause=document.getElementById('ambient-icon-pause');
  var volSlider=document.getElementById('vol-slider');
  var started=false,playing=false;
  var savedPref=localStorage.getItem('cmg_ambient');
  var shouldAutoPlay=!isMobile&&savedPref!=='off';
  function buildPad(){
    var reverb=new Tone.Reverb({decay:8,wet:0.7}).toDestination();
    var chorus=new Tone.Chorus(1.5,2.5,0.4).connect(reverb);chorus.start();
    var vol=new Tone.Volume(-14).connect(chorus);
    new Tone.LFO({frequency:'0.05',min:-24,max:-10}).connect(vol.volume).start();
    ['C3','E3','G3','C4'].forEach(function(note){
      new Tone.Synth({oscillator:{type:'sine'},envelope:{attack:4,decay:2,sustain:0.8,release:6},volume:-8}).connect(vol).triggerAttack(note,Tone.now());
      new Tone.Synth({oscillator:{type:'triangle'},envelope:{attack:6,decay:4,sustain:0.6,release:8},volume:-16}).connect(vol).triggerAttack(note,Tone.now()+0.5);
    });
  }
  function setPlaying(state){
    playing=state;
    if(state){Tone.getDestination().volume.rampTo(parseFloat(volSlider.value)*6-14,1.5);btn.classList.add('ambient-playing');iconPlay.style.display='none';iconPause.style.display='block';localStorage.setItem('cmg_ambient','on');}
    else{Tone.getDestination().volume.rampTo(-Infinity,2);btn.classList.remove('ambient-playing');iconPlay.style.display='block';iconPause.style.display='none';localStorage.setItem('cmg_ambient','off');}
  }
  btn.addEventListener('click',async function(e){
    if(e.target.id==='vol-slider')return;
    await Tone.start();
    if(!started){started=true;buildPad();}
    setPlaying(!playing);
  });
  volSlider.addEventListener('input',function(){Tone.getDestination().volume.rampTo(parseFloat(this.value)*6-14,0.3);});
  if(shouldAutoPlay){document.addEventListener('click',async function autoStart(){document.removeEventListener('click',autoStart);await Tone.start();if(!started){started=true;buildPad();}setPlaying(true);},{once:true});}
  document.addEventListener('visibilitychange',function(){if(!started)return;if(document.hidden){Tone.getDestination().volume.rampTo(-Infinity,1);}else if(playing){Tone.getDestination().volume.rampTo(parseFloat(volSlider.value)*6-14,1);}});
})();
</script>`;

// ─── Navigation HTML (absolute URLs for blog subpages) ───────────────────────
const NAV_HTML = `<nav id="navbar">
  <a href="/" class="nav-logo">
    <img src="/logo.png" alt="Crown Media Group logo">
    <span class="nav-logo-text">Crown Media Group</span>
  </a>
  <ul class="nav-links">
    <li><a href="/#about">About</a></li>
    <li><a href="/#services">Services</a></li>
    <li><a href="/#pricing">Pricing</a></li>
    <li><a href="/#serve">Columbia SC</a></li>
    <li><a href="/blog/">Blog</a></li>
    <li><a href="/ai-tools.html" class="nav-link-gold">AI Tools</a></li>
  </ul>
  <a href="https://calendly.com/crownmediagroupco" target="_blank" rel="noopener" class="btn-royal nav-cta">Book a Call</a>
  <button class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
</nav>
<div class="mobile-menu" id="mobile-menu">
  <a href="/#about">About</a>
  <a href="/#services">Services</a>
  <a href="/#pricing">Pricing</a>
  <a href="/#serve">Columbia SC</a>
  <a href="/blog/">Blog</a>
  <a href="/ai-tools.html">AI Tools</a>
  <a href="https://calendly.com/crownmediagroupco" target="_blank" rel="noopener" class="mobile-cta">Book a Call</a>
</div>`;

const FOOTER_HTML = `<footer>
  <div class="footer-brand">
    <img src="/logo.png" alt="Crown Media Group logo">
    <div><span class="footer-name">Crown Media Group</span><span class="footer-tagline">All Glory to Jesus</span></div>
  </div>
  <ul class="footer-links">
    <li><a href="/#about">About</a></li>
    <li><a href="/#services">Services</a></li>
    <li><a href="/blog/">Blog</a></li>
    <li><a href="https://calendly.com/crownmediagroupco" target="_blank" rel="noopener">Book a Call</a></li>
  </ul>
  <div class="footer-copy">
    Crown Media Group &middot; Columbia, SC &middot;
    <a href="mailto:king@crownmediagroup.co" style="color:inherit;text-decoration:none;">king@crownmediagroup.co</a>
    &middot; &copy; 2026
  </div>
</footer>`;

// ─── Nav toggle script ─────────────────────────────────────────────────────────
const NAV_SCRIPT = `<script>
(function(){
  var btn=document.getElementById('hamburger');
  var menu=document.getElementById('mobile-menu');
  if(!btn||!menu)return;
  btn.addEventListener('click',function(e){e.stopPropagation();menu.classList.toggle('open');});
  document.addEventListener('click',function(e){if(!menu.contains(e.target)&&e.target!==btn)menu.classList.remove('open');});
  window.addEventListener('scroll',function(){document.getElementById('navbar').classList.toggle('scrolled',window.scrollY>10);});
})();
</script>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readingTime(content) {
  const words = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatDate(dateStr) {
  try {
    const d = parseISO(String(dateStr));
    if (isValid(d)) return format(d, 'MMMM d, yyyy');
  } catch (_) {}
  return String(dateStr);
}

function isoDate(dateStr) {
  try {
    const d = parseISO(String(dateStr));
    if (isValid(d)) return d.toISOString().split('T')[0];
  } catch (_) {}
  return String(dateStr);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getRelatedPosts(post, allPosts, count = 3) {
  return allPosts
    .filter(p => p.slug !== post.slug)
    .map(p => {
      const sharedTags = (p.tags || []).filter(t => (post.tags || []).includes(t)).length;
      const sameCategory = p.category === post.category ? 2 : 0;
      return { post: p, score: sharedTags + sameCategory };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(x => x.post);
}

// ─── Load posts ───────────────────────────────────────────────────────────────
function loadPosts() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log('No content/blog directory found — skipping blog build.');
    return [];
  }
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    if (data.draft && process.env.BUILD_DRAFTS !== '1') continue;
    const slug = data.slug || slugify(data.title || path.basename(file, '.md'));
    const html = marked.parse(content);
    posts.push({
      slug,
      title: data.title || 'Untitled',
      date: data.date || '2026-01-01',
      dateFormatted: formatDate(data.date || '2026-01-01'),
      dateIso: isoDate(data.date || '2026-01-01'),
      category: data.category || 'General',
      tags: data.tags || [],
      excerpt: data.excerpt || content.replace(/[#*\[\]]/g, '').split('\n').find(l => l.trim()) || '',
      author: data.author || 'David King',
      image: data.image || null,
      faq: data.faq || null,
      draft: data.draft || false,
      readTime: readingTime(content),
      content,
      html,
      sourceFile: file,
    });
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts;
}

// ─── JSON-LD builder ──────────────────────────────────────────────────────────
function buildPostJsonLd(post) {
  const graph = [
    {
      '@type': 'BlogPosting',
      '@id': `${SITE_URL}/blog/${post.slug}/`,
      headline: post.title,
      description: post.excerpt.slice(0, 160),
      author: { '@type': 'Person', name: post.author, '@id': `${SITE_URL}/#founder` },
      publisher: { '@type': 'Organization', name: SITE_NAME, '@id': `${SITE_URL}/#business`, logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png` } },
      datePublished: post.dateIso,
      dateModified: post.dateIso,
      mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/blog/${post.slug}/` },
      image: post.image ? `${SITE_URL}${post.image}` : `${SITE_URL}/logo.png`,
      keywords: post.tags.join(', '),
      articleSection: post.category,
      url: `${SITE_URL}/blog/${post.slug}/`,
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog/` },
        { '@type': 'ListItem', position: 3, name: post.category, item: `${SITE_URL}/blog/category/${slugify(post.category)}/` },
        { '@type': 'ListItem', position: 4, name: post.title, item: `${SITE_URL}/blog/${post.slug}/` },
      ],
    },
  ];
  if (post.faq && post.faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: post.faq.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }
  return `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2)}\n</script>`;
}

// ─── Page HTML builders ───────────────────────────────────────────────────────
function buildPageShell({ title, description, canonical, ogImage, jsonLd, body, extraCss = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow">
<link rel="icon" type="image/png" href="/logo.png">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${ogImage || SITE_URL + '/logo.png'}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@mkdavidking">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${ogImage || SITE_URL + '/logo.png'}">
${jsonLd || ''}
${FONTS}
<style>
:root{${BRAND_VARS}}
*{margin:0;padding:0;box-sizing:border-box}html{scroll-behavior:smooth}
body{background:var(--cream);color:var(--text);font-family:'Inter',sans-serif;overflow-x:hidden}
.display{font-family:'Cormorant Garamond',serif;font-weight:700;letter-spacing:-.02em;line-height:1.05}
.grad-gold{background:linear-gradient(135deg,var(--gold-deep) 0%,var(--gold-light) 50%,var(--gold-deep) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
nav{position:fixed;top:0;left:0;right:0;z-index:1000;padding:20px 64px;display:flex;align-items:center;justify-content:space-between;background:rgba(253,251,247,0.93);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-soft);transition:box-shadow .3s}
nav.scrolled{box-shadow:0 4px 30px rgba(201,152,26,.08)}
.nav-logo{display:flex;align-items:center;gap:12px;text-decoration:none}
.nav-logo img{height:38px;width:38px;object-fit:contain;border-radius:8px}
.nav-logo-text{font-family:'Cormorant Garamond',serif;font-size:1.15rem;font-weight:700;color:var(--text);letter-spacing:.02em}
.nav-links{display:flex;align-items:center;gap:36px;list-style:none}
.nav-links a{color:var(--text-mid);text-decoration:none;font-size:.88rem;font-weight:500;transition:color .2s;letter-spacing:.02em}
.nav-links a:hover{color:var(--gold)}.nav-link-gold{color:var(--gold)!important;font-weight:700!important}
.btn-royal{background:var(--royal);color:var(--gold-light);border:none;padding:12px 28px;border-radius:4px;font-size:.85rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;display:inline-block;transition:background .2s,transform .2s,box-shadow .2s;cursor:pointer}
.btn-royal:hover{background:var(--royal-mid);transform:translateY(-2px);box-shadow:0 8px 24px rgba(26,26,62,.25)}
.hamburger{display:none;flex-direction:column;gap:5px;cursor:pointer;background:none;border:none;padding:4px;z-index:1001;position:relative}
.hamburger span{width:24px;height:2px;background:var(--text);border-radius:2px;display:block}
.mobile-menu{display:none;position:fixed;top:70px;left:0;right:0;background:var(--cream);border-bottom:1px solid rgba(201,152,26,.15);padding:24px 32px;flex-direction:column;gap:20px;z-index:999;box-shadow:0 8px 32px rgba(0,0,0,.08)}
.mobile-menu.open{display:flex}
.mobile-menu a{color:var(--text-mid);text-decoration:none;font-size:.95rem;font-weight:500;letter-spacing:.02em;transition:color .2s}
.mobile-menu a:hover{color:var(--gold)}
.mobile-cta{background:var(--royal);color:var(--gold-light)!important;padding:14px 24px;text-align:center;border-radius:4px;font-weight:600!important;letter-spacing:.06em;text-transform:uppercase;font-size:.82rem!important}
footer{background:#0F0F28;padding:56px 64px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:24px}
.footer-brand{display:flex;align-items:center;gap:14px}
.footer-brand img{height:34px;width:34px;object-fit:contain;border-radius:6px}
.footer-name{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:700;color:#fff;display:block}
.footer-tagline{font-size:.72rem;color:var(--gold);letter-spacing:.08em;font-style:italic}
.footer-links{display:flex;gap:32px;list-style:none}
.footer-links a{color:rgba(255,255,255,.4);font-size:.82rem;text-decoration:none;transition:color .2s}
.footer-links a:hover{color:rgba(255,255,255,.8)}
.footer-copy{color:rgba(255,255,255,.25);font-size:.78rem}
${AMBIENT_CSS}
${extraCss}
@media(max-width:768px){nav{padding:16px 24px}.nav-links,.nav-cta{display:none}.hamburger{display:flex}footer{padding:40px 24px;flex-direction:column;align-items:flex-start}.footer-links{flex-wrap:wrap;gap:16px}}
</style>
</head>
<body>
${NAV_HTML}
${body}
${FOOTER_HTML}
${NAV_SCRIPT}
${AMBIENT_HTML}
</body>
</html>`;
}

// ─── Blog post page ───────────────────────────────────────────────────────────
function buildPostPage(post, allPosts) {
  const related = getRelatedPosts(post, allPosts);
  const idx = allPosts.findIndex(p => p.slug === post.slug);
  const prev = allPosts[idx + 1] || null;
  const next = allPosts[idx - 1] || null;

  const faqHtml = post.faq && post.faq.length > 0 ? `
<section class="post-faq">
  <h2>Frequently Asked Questions</h2>
  ${post.faq.map(item => `
  <div class="faq-item">
    <h3>${escapeHtml(item.q)}</h3>
    <p>${escapeHtml(item.a)}</p>
  </div>`).join('')}
</section>` : '';

  const relatedHtml = related.length > 0 ? `
<section class="related-posts">
  <h2>Related Articles</h2>
  <div class="related-grid">
    ${related.map(p => `
    <a href="/blog/${p.slug}/" class="related-card">
      <span class="related-cat">${escapeHtml(p.category)}</span>
      <span class="related-title">${escapeHtml(p.title)}</span>
      <span class="related-meta">${p.dateFormatted} &middot; ${p.readTime}</span>
    </a>`).join('')}
  </div>
</section>` : '';

  const prevNextHtml = `
<nav class="post-nav" aria-label="Post navigation">
  <div class="post-nav-inner">
    ${prev ? `<a href="/blog/${prev.slug}/" class="post-nav-link post-nav-prev">
      <span class="post-nav-label">Previous</span>
      <span class="post-nav-title">${escapeHtml(prev.title)}</span>
    </a>` : '<div></div>'}
    ${next ? `<a href="/blog/${next.slug}/" class="post-nav-link post-nav-next">
      <span class="post-nav-label">Next</span>
      <span class="post-nav-title">${escapeHtml(next.title)}</span>
    </a>` : '<div></div>'}
  </div>
</nav>`;

  const tagsHtml = post.tags.length > 0 ? `
<div class="post-tags">
  ${post.tags.map(t => `<a href="/blog/tag/${slugify(t)}/" class="post-tag">${escapeHtml(t)}</a>`).join('')}
</div>` : '';

  const body = `
<div class="blog-page-wrap">
  <div class="breadcrumb">
    <a href="/">Home</a> &rsaquo;
    <a href="/blog/">Blog</a> &rsaquo;
    <a href="/blog/category/${slugify(post.category)}/">${escapeHtml(post.category)}</a> &rsaquo;
    <span>${escapeHtml(post.title)}</span>
  </div>
  <article class="post-article">
    <header class="post-header">
      <div class="post-eyebrow">
        <a href="/blog/category/${slugify(post.category)}/" class="post-category">${escapeHtml(post.category)}</a>
        <span class="post-dot">&middot;</span>
        <time datetime="${post.dateIso}">${post.dateFormatted}</time>
        <span class="post-dot">&middot;</span>
        <span>${post.readTime}</span>
      </div>
      <h1 class="post-title">${escapeHtml(post.title)}</h1>
      <p class="post-excerpt">${escapeHtml(post.excerpt)}</p>
      <div class="post-author">
        <div class="author-info">
          <span class="author-name">${escapeHtml(post.author)}</span>
          <span class="author-role">CEO &amp; Founder, Crown Media Group</span>
        </div>
      </div>
    </header>
    <div class="post-body">
      ${post.html}
    </div>
    ${tagsHtml}
    ${faqHtml}
    <div class="post-cta">
      <h2>Ready to Grow Your Business?</h2>
      <p>Crown Media Group brings AI-powered marketing to Columbia SC businesses. Social media, paid ads, brand strategy — results in 30 days.</p>
      <a href="https://calendly.com/crownmediagroupco" target="_blank" rel="noopener" class="btn-royal">Book a Free Strategy Session</a>
    </div>
    ${relatedHtml}
    ${prevNextHtml}
  </article>
</div>`;

  const extraCss = `
.blog-page-wrap{max-width:780px;margin:0 auto;padding:120px 24px 80px}
.breadcrumb{font-size:.8rem;color:var(--text-light);margin-bottom:32px}
.breadcrumb a{color:var(--text-light);text-decoration:none;transition:color .2s}
.breadcrumb a:hover{color:var(--gold)}
.post-article{}
.post-eyebrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:20px;font-size:.82rem;color:var(--text-light)}
.post-category{color:var(--gold);font-weight:700;text-decoration:none;text-transform:uppercase;letter-spacing:.08em;font-size:.72rem}
.post-dot{color:var(--border)}
.post-title{font-family:'Cormorant Garamond',serif;font-size:clamp(2rem,5vw,3.2rem);font-weight:700;line-height:1.1;margin-bottom:20px;letter-spacing:-.02em;color:var(--text)}
.post-excerpt{font-size:1.1rem;color:var(--text-mid);line-height:1.7;margin-bottom:28px;font-style:italic}
.post-author{display:flex;align-items:center;gap:14px;padding:20px 0;border-top:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft);margin-bottom:40px}
.author-name{font-weight:600;color:var(--text);display:block;font-size:.9rem}
.author-role{font-size:.78rem;color:var(--text-light);display:block}
.post-body{line-height:1.85;font-size:1rem;color:var(--text)}
.post-body h2{font-family:'Cormorant Garamond',serif;font-size:1.8rem;font-weight:700;margin:2.5rem 0 1rem;color:var(--text)}
.post-body h3{font-size:1.2rem;font-weight:600;margin:2rem 0 .75rem;color:var(--text)}
.post-body p{margin-bottom:1.25rem}
.post-body ul,.post-body ol{margin:1rem 0 1.25rem 1.5rem}
.post-body li{margin-bottom:.5rem}
.post-body blockquote{margin:1.5rem 0;padding:20px 24px;border-left:3px solid var(--gold);background:var(--warm);font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-style:italic;color:var(--gold-deep);border-radius:0 8px 8px 0}
.post-body a{color:var(--gold);text-decoration:underline}
.post-body strong{font-weight:700;color:var(--text)}
.post-body code{background:var(--warm);padding:2px 6px;border-radius:4px;font-size:.88em;font-family:monospace}
.post-body pre{background:var(--royal);color:var(--gold-pale);padding:20px;border-radius:8px;overflow-x:auto;margin:1.5rem 0}
.post-body pre code{background:transparent;padding:0}
.post-body hr{border:none;border-top:1px solid var(--border-soft);margin:2rem 0}
.post-tags{display:flex;flex-wrap:wrap;gap:8px;margin:2rem 0}
.post-tag{background:var(--warm);color:var(--text-mid);font-size:.75rem;font-weight:600;letter-spacing:.05em;padding:5px 12px;border-radius:2px;text-decoration:none;border:1px solid var(--border-soft);transition:border-color .2s,color .2s}
.post-tag:hover{border-color:var(--gold);color:var(--gold)}
.post-faq{margin:3rem 0;padding:40px;background:var(--warm);border-radius:12px;border:1px solid var(--border-soft)}
.post-faq h2{font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:700;margin-bottom:24px;color:var(--text)}
.faq-item{margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border-soft)}
.faq-item:last-child{border-bottom:none;margin-bottom:0;padding-bottom:0}
.faq-item h3{font-size:.95rem;font-weight:700;color:var(--text);margin-bottom:8px}
.faq-item p{font-size:.9rem;color:var(--text-mid);line-height:1.7}
.post-cta{background:var(--royal);color:#fff;padding:48px;border-radius:12px;margin:3rem 0;text-align:center}
.post-cta h2{font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:700;color:#fff;margin-bottom:12px}
.post-cta p{color:rgba(255,255,255,.7);margin-bottom:28px;line-height:1.6}
.related-posts{margin:3rem 0}
.related-posts h2{font-family:'Cormorant Garamond',serif;font-size:1.6rem;font-weight:700;margin-bottom:20px;color:var(--text)}
.related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.related-card{display:flex;flex-direction:column;gap:6px;padding:20px;background:var(--white);border:1px solid var(--border-soft);border-radius:8px;text-decoration:none;transition:border-color .2s,transform .2s}
.related-card:hover{border-color:var(--gold);transform:translateY(-2px)}
.related-cat{font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}
.related-title{font-size:.9rem;font-weight:600;color:var(--text);line-height:1.4}
.related-meta{font-size:.75rem;color:var(--text-light)}
.post-nav{margin:3rem 0}
.post-nav-inner{display:flex;justify-content:space-between;gap:16px}
.post-nav-link{display:flex;flex-direction:column;gap:4px;padding:16px 20px;background:var(--white);border:1px solid var(--border-soft);border-radius:8px;text-decoration:none;max-width:48%;transition:border-color .2s}
.post-nav-link:hover{border-color:var(--gold)}
.post-nav-next{text-align:right;margin-left:auto}
.post-nav-label{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--gold)}
.post-nav-title{font-size:.88rem;font-weight:600;color:var(--text);line-height:1.3}`;

  return buildPageShell({
    title: `${post.title} | Crown Media Group`,
    description: post.excerpt.slice(0, 160),
    canonical: `${SITE_URL}/blog/${post.slug}/`,
    ogImage: post.image ? `${SITE_URL}${post.image}` : null,
    jsonLd: buildPostJsonLd(post),
    body,
    extraCss,
  });
}

// ─── Blog index page ──────────────────────────────────────────────────────────
function buildIndexPage(posts) {
  const categories = [...new Set(posts.map(p => p.category))];
  const featured = posts[0];
  const rest = posts.slice(1);

  const featuredHtml = featured ? `
<div class="blog-featured">
  <div class="featured-meta">
    <a href="/blog/category/${slugify(featured.category)}/" class="featured-cat">${escapeHtml(featured.category)}</a>
    <span>&middot;</span>
    <time datetime="${featured.dateIso}">${featured.dateFormatted}</time>
    <span>&middot;</span>
    <span>${featured.readTime}</span>
  </div>
  <h2><a href="/blog/${featured.slug}/">${escapeHtml(featured.title)}</a></h2>
  <p class="featured-excerpt">${escapeHtml(featured.excerpt)}</p>
  <a href="/blog/${featured.slug}/" class="btn-royal">Read Article</a>
</div>` : '';

  const cardsHtml = rest.map(p => `
<article class="post-card">
  <div class="card-meta">
    <a href="/blog/category/${slugify(p.category)}/" class="card-cat">${escapeHtml(p.category)}</a>
    <span class="card-dot">&middot;</span>
    <time datetime="${p.dateIso}">${p.dateFormatted}</time>
  </div>
  <h3><a href="/blog/${p.slug}/">${escapeHtml(p.title)}</a></h3>
  <p class="card-excerpt">${escapeHtml(p.excerpt)}</p>
  <div class="card-footer">
    <span class="card-read">${p.readTime}</span>
    <a href="/blog/${p.slug}/" class="card-link">Read &rarr;</a>
  </div>
</article>`).join('');

  const catFilterHtml = categories.length > 1 ? `
<div class="cat-filter">
  <a href="/blog/" class="cat-btn active">All</a>
  ${categories.map(c => `<a href="/blog/category/${slugify(c)}/" class="cat-btn">${escapeHtml(c)}</a>`).join('')}
</div>` : '';

  const body = `
<div class="blog-index-wrap">
  <header class="blog-index-header">
    <div class="label-tag">Crown Media Group</div>
    <h1 class="blog-index-title display">Insights &amp; <em class="grad-gold">Strategy</em></h1>
    <p class="blog-index-sub">AI marketing, local SEO, faith &amp; business — written for Columbia SC entrepreneurs.</p>
  </header>
  ${catFilterHtml}
  ${featuredHtml}
  <div class="posts-grid">
    ${cardsHtml}
  </div>
  ${posts.length === 0 ? '<p style="text-align:center;color:var(--text-light);padding:80px 0;">No posts published yet. Check back soon.</p>' : ''}
</div>`;

  const extraCss = `
.blog-index-wrap{max-width:1100px;margin:0 auto;padding:120px 48px 80px}
.label-tag{font-size:.7rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:16px}
.blog-index-header{text-align:center;margin-bottom:56px}
.blog-index-title{font-size:clamp(2.5rem,5vw,4rem);margin-bottom:16px;color:var(--text)}
.blog-index-title em{font-style:italic}
.blog-index-sub{color:var(--text-mid);font-size:1.05rem;max-width:520px;margin:0 auto;line-height:1.7}
.cat-filter{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:40px}
.cat-btn{padding:7px 18px;border-radius:2px;border:1.5px solid var(--border);color:var(--text-mid);font-size:.8rem;font-weight:600;letter-spacing:.05em;text-decoration:none;transition:border-color .2s,color .2s,background .2s}
.cat-btn:hover,.cat-btn.active{border-color:var(--gold);color:var(--gold);background:var(--gold-pale)}
.blog-featured{background:var(--royal);color:#fff;padding:48px 56px;border-radius:12px;margin-bottom:56px}
.featured-meta{display:flex;align-items:center;gap:10px;font-size:.8rem;color:rgba(255,255,255,.5);margin-bottom:16px}
.featured-cat{color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;text-decoration:none}
.blog-featured h2{font-family:'Cormorant Garamond',serif;font-size:clamp(1.8rem,3vw,2.8rem);font-weight:700;line-height:1.15;margin-bottom:16px}
.blog-featured h2 a{color:#fff;text-decoration:none}
.blog-featured h2 a:hover{color:var(--gold-light)}
.featured-excerpt{color:rgba(255,255,255,.65);font-size:1rem;line-height:1.7;margin-bottom:28px;max-width:600px}
.posts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:28px}
.post-card{background:var(--white);border:1px solid var(--border-soft);border-radius:10px;padding:28px;display:flex;flex-direction:column;transition:border-color .2s,transform .2s}
.post-card:hover{border-color:var(--gold);transform:translateY(-3px)}
.card-meta{display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--text-light);margin-bottom:12px}
.card-cat{color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;text-decoration:none}
.card-dot{color:var(--border)}
.post-card h3{font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:700;line-height:1.25;margin-bottom:10px}
.post-card h3 a{color:var(--text);text-decoration:none;transition:color .2s}
.post-card h3 a:hover{color:var(--gold)}
.card-excerpt{font-size:.88rem;color:var(--text-mid);line-height:1.65;flex:1;margin-bottom:16px}
.card-footer{display:flex;align-items:center;justify-content:space-between}
.card-read{font-size:.75rem;color:var(--text-light)}
.card-link{font-size:.82rem;font-weight:700;color:var(--gold);text-decoration:none;letter-spacing:.04em}
.card-link:hover{color:var(--gold-deep)}
@media(max-width:768px){.blog-index-wrap{padding:100px 24px 60px}.blog-featured{padding:28px 24px}.posts-grid{grid-template-columns:1fr}}`;

  return buildPageShell({
    title: `Blog | Crown Media Group`,
    description: 'AI marketing insights, local SEO strategy, faith and business — written for Columbia SC entrepreneurs by Crown Media Group.',
    canonical: `${SITE_URL}/blog/`,
    ogImage: null,
    jsonLd: `<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Blog', '@id': `${SITE_URL}/blog/`, name: `${SITE_NAME} Blog`, url: `${SITE_URL}/blog/`, publisher: { '@type': 'Organization', name: SITE_NAME } }, null, 2)}\n</script>`,
    body,
    extraCss,
  });
}

// ─── Category / tag pages ─────────────────────────────────────────────────────
function buildArchivePage({ label, title, description, canonical, posts }) {
  const cardsHtml = posts.map(p => `
<article class="post-card">
  <div class="card-meta">
    <a href="/blog/category/${slugify(p.category)}/" class="card-cat">${escapeHtml(p.category)}</a>
    <span class="card-dot">&middot;</span>
    <time datetime="${p.dateIso}">${p.dateFormatted}</time>
  </div>
  <h3><a href="/blog/${p.slug}/">${escapeHtml(p.title)}</a></h3>
  <p class="card-excerpt">${escapeHtml(p.excerpt)}</p>
  <div class="card-footer">
    <span class="card-read">${p.readTime}</span>
    <a href="/blog/${p.slug}/" class="card-link">Read &rarr;</a>
  </div>
</article>`).join('');

  const body = `
<div class="blog-index-wrap">
  <header class="blog-index-header">
    <div class="label-tag">${escapeHtml(label)}</div>
    <h1 class="blog-index-title display">${escapeHtml(title)}</h1>
    <p class="blog-index-sub">${escapeHtml(description)}</p>
    <a href="/blog/" style="display:inline-block;margin-top:16px;color:var(--gold);font-size:.85rem;font-weight:600;text-decoration:none;">&larr; All Articles</a>
  </header>
  <div class="posts-grid">${cardsHtml}</div>
</div>`;

  const extraCss = `
.blog-index-wrap{max-width:1100px;margin:0 auto;padding:120px 48px 80px}
.label-tag{font-size:.7rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:16px}
.blog-index-header{text-align:center;margin-bottom:56px}
.blog-index-title{font-size:clamp(2rem,5vw,3.5rem);margin-bottom:16px;color:var(--text)}
.blog-index-sub{color:var(--text-mid);font-size:1rem;max-width:520px;margin:0 auto;line-height:1.7}
.posts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:28px}
.post-card{background:var(--white);border:1px solid var(--border-soft);border-radius:10px;padding:28px;display:flex;flex-direction:column;transition:border-color .2s,transform .2s}
.post-card:hover{border-color:var(--gold);transform:translateY(-3px)}
.card-meta{display:flex;align-items:center;gap:8px;font-size:.78rem;color:var(--text-light);margin-bottom:12px}
.card-cat{color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;text-decoration:none}
.card-dot{color:var(--border)}
.post-card h3{font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:700;line-height:1.25;margin-bottom:10px}
.post-card h3 a{color:var(--text);text-decoration:none;transition:color .2s}
.post-card h3 a:hover{color:var(--gold)}
.card-excerpt{font-size:.88rem;color:var(--text-mid);line-height:1.65;flex:1;margin-bottom:16px}
.card-footer{display:flex;align-items:center;justify-content:space-between}
.card-read{font-size:.75rem;color:var(--text-light)}
.card-link{font-size:.82rem;font-weight:700;color:var(--gold);text-decoration:none;letter-spacing:.04em}
@media(max-width:768px){.blog-index-wrap{padding:100px 24px 60px}.posts-grid{grid-template-columns:1fr}}`;

  return buildPageShell({ title, description, canonical, body, extraCss });
}

// ─── Sitemap & RSS ────────────────────────────────────────────────────────────
function buildSitemap(posts) {
  const staticPages = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/ai-tools.html', priority: '0.9', changefreq: 'monthly' },
    { loc: '/blog/', priority: '0.9', changefreq: 'daily' },
  ];
  const postEntries = posts.map(p => ({
    loc: `/blog/${p.slug}/`,
    lastmod: p.dateIso,
    priority: '0.8',
    changefreq: 'monthly',
  }));
  const cats = [...new Set(posts.map(p => p.category))];
  const catEntries = cats.map(c => ({ loc: `/blog/category/${slugify(c)}/`, priority: '0.6', changefreq: 'weekly' }));
  const allEntries = [...staticPages, ...postEntries, ...catEntries];
  const urlElements = allEntries.map(e => `  <url>
    <loc>${SITE_URL}${e.loc}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlElements}\n</urlset>`;
}

function buildFeed(posts) {
  const recent = posts.slice(0, 20);
  const items = recent.map(p => `  <item>
    <title><![CDATA[${p.title}]]></title>
    <link>${SITE_URL}/blog/${p.slug}/</link>
    <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}/</guid>
    <pubDate>${new Date(p.dateIso).toUTCString()}</pubDate>
    <description><![CDATA[${p.excerpt}]]></description>
    <category>${p.category}</category>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${SITE_NAME} Blog</title>
    <link>${SITE_URL}/blog/</link>
    <description>AI marketing insights, local SEO, faith and business — Crown Media Group, Columbia SC</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}

// ─── Ensure directory ─────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Main build ───────────────────────────────────────────────────────────────
async function build() {
  console.log('Crown Media Group — Building blog...');
  const posts = loadPosts();
  console.log(`Found ${posts.length} published post(s).`);

  ensureDir(OUTPUT_DIR);

  // Blog index
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), buildIndexPage(posts));

  // Individual post pages
  for (const post of posts) {
    const postDir = path.join(OUTPUT_DIR, post.slug);
    ensureDir(postDir);
    fs.writeFileSync(path.join(postDir, 'index.html'), buildPostPage(post, posts));
    console.log(`  Built: /blog/${post.slug}/`);
  }

  // Category pages
  const categories = [...new Set(posts.map(p => p.category))];
  const catDir = path.join(OUTPUT_DIR, 'category');
  ensureDir(catDir);
  for (const cat of categories) {
    const catPosts = posts.filter(p => p.category === cat);
    const slug = slugify(cat);
    const dir = path.join(catDir, slug);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'index.html'), buildArchivePage({
      label: 'Category',
      title: `${cat} Articles | Crown Media Group`,
      description: `Browse ${cat} articles from Crown Media Group — AI marketing insights for Columbia SC businesses.`,
      canonical: `${SITE_URL}/blog/category/${slug}/`,
      posts: catPosts,
    }));
  }

  // Tag pages
  const allTags = [...new Set(posts.flatMap(p => p.tags))];
  const tagDir = path.join(OUTPUT_DIR, 'tag');
  ensureDir(tagDir);
  for (const tag of allTags) {
    const tagPosts = posts.filter(p => p.tags.includes(tag));
    const slug = slugify(tag);
    const dir = path.join(tagDir, slug);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'index.html'), buildArchivePage({
      label: 'Tag',
      title: `${tag} | Crown Media Group Blog`,
      description: `Articles tagged "${tag}" from Crown Media Group.`,
      canonical: `${SITE_URL}/blog/tag/${slug}/`,
      posts: tagPosts,
    }));
  }

  // Sitemap
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, buildSitemap(posts));
  console.log('  Built: sitemap.xml');

  // RSS feed
  const feedPath = path.join(ROOT, 'feed.xml');
  fs.writeFileSync(feedPath, buildFeed(posts));
  console.log('  Built: feed.xml');

  console.log(`\nBlog build complete. ${posts.length} posts, ${categories.length} categories, ${allTags.length} tags.`);
}

build().catch(err => { console.error('Build failed:', err); process.exit(1); });
