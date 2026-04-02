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

// ─── YouTube Playlist Player (matches index.html — shuffle + random song on reload) ──
const AMBIENT_CSS = `
#music-bar{position:fixed;bottom:32px;right:32px;z-index:9000;display:flex;flex-direction:column;align-items:center;padding:10px 10px 0;background:rgba(26,26,62,0.82);border:1px solid rgba(201,152,26,0.35);border-radius:40px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,.32)}
.music-vol-wrap{display:none;padding-bottom:10px;}
#music-vol{writing-mode:vertical-lr;direction:rtl;width:4px;height:80px;cursor:pointer;accent-color:var(--gold);display:block}
#music-btn{width:44px;height:44px;border-radius:50%;background:rgba(201,152,26,0.15);border:1.5px solid rgba(201,152,26,0.5);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .2s,background .2s,color .2s;font-size:1.2rem;color:rgba(232,184,50,.75);outline:none;margin-bottom:10px}
#music-btn:hover,#music-btn.music-on{background:rgba(201,152,26,0.25);border-color:var(--gold);color:var(--gold)}
#music-shuffle{width:36px;height:36px;border-radius:50%;background:transparent;border:1px solid rgba(201,152,26,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .2s,color .2s;font-size:1rem;color:rgba(232,184,50,.5);outline:none;margin-bottom:10px}
#music-shuffle:hover{border-color:var(--gold);color:var(--gold)}`;

const AMBIENT_HTML = `
<div id="music-bar">
  <div class="music-vol-wrap" id="music-vol-wrap">
    <input type="range" id="music-vol" min="0" max="100" value="18" aria-label="Music volume" title="Music volume">
  </div>
  <button type="button" id="music-btn" title="Play playlist" aria-label="Toggle playlist music">&#9835;</button>
  <button type="button" id="music-shuffle" title="Shuffle — next random song" aria-label="Next random song">&#8635;</button>
  <div id="yt-player-wrap" style="position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;bottom:0;right:0;"></div>
</div>
<script>
/* Crown Media Group — YouTube Playlist Player */
(function(){
  var musicOn=false,ytPlayer=null,ytReady=false;
  var btn=document.getElementById('music-btn');
  var vol=document.getElementById('music-vol');
  var wrap=document.getElementById('music-vol-wrap');
  var bar=document.getElementById('music-bar');
  var shuf=document.getElementById('music-shuffle');
  bar.addEventListener('mouseenter',function(){wrap.style.display='block';});
  bar.addEventListener('mouseleave',function(){wrap.style.display='none';});
  function setOn(){ytPlayer.unMute();ytPlayer.setVolume(parseInt(vol.value));ytPlayer.playVideo();musicOn=true;btn.classList.add('music-on');localStorage.setItem('cmg_music','on');}
  function setOff(){ytPlayer.mute();musicOn=false;btn.classList.remove('music-on');localStorage.setItem('cmg_music','off');}
  var tag=document.createElement('script');
  tag.src='https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady=function(){
    ytPlayer=new YT.Player('yt-player-wrap',{
      height:'1',width:'1',
      playerVars:{listType:'playlist',list:'PLPdK5nHr48s1mLIl6HL_qxJukitxpMkgY',autoplay:1,mute:1,loop:1,controls:0,playsinline:1,origin:window.location.origin},
      events:{onReady:function(e){
        ytReady=true;
        e.target.setShuffle(true);
        e.target.setVolume(18);
        e.target.playVideo();
        e.target.unMute();
        setTimeout(function(){
          if(!e.target.isMuted()){
            musicOn=true;btn.classList.add('music-on');
          } else {
            var unlock=function(){
              if(ytReady&&!musicOn){ytPlayer.unMute();ytPlayer.setVolume(parseInt(vol.value));musicOn=true;btn.classList.add('music-on');}
              ['click','scroll','keydown','touchstart'].forEach(function(ev){document.removeEventListener(ev,unlock);});
            };
            ['click','scroll','keydown','touchstart'].forEach(function(ev){document.addEventListener(ev,unlock,{once:true,passive:true});});
          }
        },400);
      }}
    });
  };
  btn.addEventListener('click',function(){if(!ytReady)return;if(!musicOn)setOn();else setOff();});
  shuf.addEventListener('click',function(){if(!ytReady)return;ytPlayer.setShuffle(true);ytPlayer.nextVideo();if(!musicOn)setOn();});
  vol.addEventListener('input',function(){if(ytReady)ytPlayer.setVolume(parseInt(this.value));});
  document.addEventListener('visibilitychange',function(){if(!ytReady)return;if(document.hidden)ytPlayer.mute();else if(musicOn)ytPlayer.unMute();});
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
  <button type="button" class="hamburger" id="hamburger" aria-label="Menu"><span></span><span></span><span></span></button>
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

function formatDate(dateStr, publishTime) {
  try {
    const d = parseISO(String(dateStr));
    if (isValid(d)) {
      const datePart = format(d, 'MMMM d, yyyy');
      if (publishTime) {
        const [h, m] = publishTime.split(':').map(Number);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${datePart} · ${h12}:${String(m).padStart(2,'0')} ${suffix}`;
      }
      return datePart;
    }
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

// ─── Service hyperlink injection ──────────────────────────────────────────────
// Scans post HTML for key phrases and injects contextual service hyperlinks.
// Only links the FIRST occurrence of each phrase per post (avoids over-linking).
// Skips text already inside an <a> tag.
const SERVICE_LINKS = [
  // Social media → social tab
  { phrase: 'social media management',   url: 'https://crownmediagroup.co/ai-tools.html#social',    title: 'Social media management — Crown Media Group' },
  { phrase: 'social media manager',      url: 'https://crownmediagroup.co/ai-tools.html#social',    title: 'Social media management — Crown Media Group' },
  // Paid ads → ads tab
  { phrase: 'Meta Ads',                  url: 'https://crownmediagroup.co/ai-tools.html#ads',       title: 'Paid advertising — Crown Media Group' },
  { phrase: 'Facebook Ads',              url: 'https://crownmediagroup.co/ai-tools.html#ads',       title: 'Paid advertising — Crown Media Group' },
  { phrase: 'Google Ads',                url: 'https://crownmediagroup.co/ai-tools.html#ads',       title: 'Paid advertising — Crown Media Group' },
  { phrase: 'paid advertising',          url: 'https://crownmediagroup.co/ai-tools.html#ads',       title: 'Paid advertising — Crown Media Group' },
  { phrase: 'ad management',             url: 'https://crownmediagroup.co/ai-tools.html#ads',       title: 'Paid ad management — Crown Media Group' },
  // SEO → ai-tools main
  { phrase: 'local SEO',                 url: 'https://crownmediagroup.co/ai-tools.html',           title: 'Local SEO — Crown Media Group' },
  { phrase: 'Google Business Profile',   url: 'https://crownmediagroup.co/ai-tools.html',           title: 'Local SEO & Google Business Profile — Crown Media Group' },
  // Brand → logos tab
  { phrase: 'brand identity',            url: 'https://crownmediagroup.co/ai-tools.html#logos',     title: 'Brand identity design — Crown Media Group' },
  { phrase: 'logo design',               url: 'https://crownmediagroup.co/ai-tools.html#logos',     title: 'Brand identity & logo design — Crown Media Group' },
  // Website → websites tab
  { phrase: 'landing page',              url: 'https://crownmediagroup.co/ai-tools.html#websites',  title: 'Website & landing page design — Crown Media Group' },
  // Email → ai-tools main
  { phrase: 'email marketing',           url: 'https://crownmediagroup.co/ai-tools.html',           title: 'Email marketing — Crown Media Group' },
  // AI tools → ai-tools main
  { phrase: 'AI-powered marketing',      url: 'https://crownmediagroup.co/ai-tools.html',           title: 'AI marketing tools — Crown Media Group' },
  { phrase: 'marketing automation',      url: 'https://crownmediagroup.co/ai-tools.html',           title: 'AI marketing automation — Crown Media Group' },
  // Content marketing → social tab
  { phrase: 'content marketing',         url: 'https://crownmediagroup.co/ai-tools.html#social',    title: 'Content marketing — Crown Media Group' },
  // Video → social tab
  { phrase: 'short-form video',          url: 'https://crownmediagroup.co/ai-tools.html#social',    title: 'Video & Reels — Crown Media Group' },
  // CTA
  { phrase: 'free strategy session',     url: 'https://calendly.com/crownmediagroupco',    title: 'Book a free strategy session — Crown Media Group' },
  { phrase: 'strategy session',          url: 'https://calendly.com/crownmediagroupco',    title: 'Book a free strategy session — Crown Media Group' },
  { phrase: 'Crown Media Group',         url: 'https://crownmediagroup.co',                title: 'Crown Media Group — AI-powered marketing, Columbia SC' },
];

function injectServiceLinks(html) {
  const linked = new Set(); // track which phrases have been linked (first-occurrence only)
  let result = html;

  for (const { phrase, url, title } of SERVICE_LINKS) {
    if (linked.has(phrase)) continue;
    // Case-insensitive match, but don't match text already inside an <a ...> tag
    const re = new RegExp(`(?<!<a[^>]*?>)(?<!href="[^"]*?)\\b(${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b(?![^<]*?</a>)`, 'i');
    if (re.test(result)) {
      result = result.replace(re, `<a href="${url}" title="${title}" target="_blank" rel="noopener" class="svc-link">$1</a>`);
      linked.add(phrase);
    }
  }
  return result;
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
    const html = injectServiceLinks(marked.parse(content));
    posts.push({
      slug,
      title: data.title || 'Untitled',
      date: data.date || '2026-01-01',
      publishTime: data.publishTime || null,
      dateFormatted: formatDate(data.date || '2026-01-01', data.publishTime || null),
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
nav{position:fixed;top:0;left:0;right:0;z-index:1000;padding:20px 64px;display:flex;align-items:center;justify-content:space-between;background:rgba(253,251,247,0.93);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-bottom:1px solid var(--border-soft);transition:box-shadow .3s}
nav.scrolled{box-shadow:0 4px 30px rgba(201,152,26,.08)}
.nav-logo{display:flex;align-items:center;gap:12px;text-decoration:none}
.nav-logo img{height:38px;width:38px;object-fit:contain;border-radius:8px}
.nav-logo-text{font-family:'Cormorant Garamond',serif;font-size:1.15rem;font-weight:700;color:var(--text);letter-spacing:.02em}
.nav-links{display:flex;align-items:center;gap:36px;list-style:none}
.nav-links a{color:var(--text-mid);text-decoration:none;font-size:.88rem;font-weight:500;transition:color .2s;letter-spacing:.02em}
.nav-links a:hover{color:var(--gold)}.nav-link-gold{color:var(--gold)!important;font-weight:700!important}
.btn-royal{background:var(--royal);color:var(--gold-light);border:none;padding:12px 28px;border-radius:4px;font-size:.85rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;display:inline-block;transition:background .2s,transform .2s,box-shadow .2s;cursor:pointer}
.btn-royal:hover{background:var(--royal-mid);transform:translateY(-2px);box-shadow:0 8px 24px rgba(26,26,62,.25)}
.nav-cta{flex-shrink:0;white-space:nowrap}
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
@media(max-width:900px){nav{padding:16px 24px}.nav-links,.nav-cta{display:none}.hamburger{display:flex}footer{padding:40px 24px;flex-direction:column;align-items:flex-start}.footer-links{flex-wrap:wrap;gap:16px}}
</style>
</head>
<body>
${NAV_HTML}
${body}
${FOOTER_HTML}
${NAV_SCRIPT}
${AMBIENT_HTML}
<style>
#support-btn{position:fixed;bottom:32px;left:32px;z-index:9000;width:52px;height:52px;border-radius:50%;background:#1A1A3E;border:1.5px solid rgba(201,152,26,0.5);display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 4px 24px rgba(0,0,0,.32);transition:border-color .2s,background .2s;outline:none}
#support-btn:hover,#support-btn.open{background:rgba(26,26,62,0.95);border-color:#C9981A}
#support-btn svg{width:22px;height:22px;fill:rgba(232,184,50,.8);transition:fill .2s}
#support-btn:hover svg,#support-btn.open svg{fill:#C9981A}
#support-pop{display:none;position:fixed;bottom:92px;left:32px;z-index:8999;background:rgba(26,26,62,0.97);border:1px solid rgba(201,152,26,0.4);border-radius:12px;padding:8px;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,.4);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
#support-pop.open{display:block}
#support-pop a{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;text-decoration:none;color:rgba(255,255,255,.85);font-family:'Inter',sans-serif;font-size:.82rem;font-weight:600;letter-spacing:.04em;transition:background .15s,color .15s}
#support-pop a:hover{background:rgba(201,152,26,.12);color:#C9981A}
#support-pop a svg{width:18px;height:18px;flex-shrink:0;fill:rgba(201,152,26,.7)}
#support-pop a:hover svg{fill:#C9981A}
#support-pop .sup-label{font-family:'Cormorant Garamond',serif;font-size:.7rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(201,152,26,.5);padding:8px 16px 4px;display:block}
#support-pop .sup-divider{height:1px;background:rgba(201,152,26,.15);margin:4px 8px}
</style>
<button type="button" id="support-btn" aria-label="Contact support" title="Get in touch">
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20 10.5C20 6.36 16.41 3 12 3S4 6.36 4 10.5v6c0 1.1.9 2 2 2h1c.55 0 1-.45 1-1v-5c0-.55-.45-1-1-1H6v-1c0-3.31 2.69-6 6-6s6 2.69 6 6v1h-1c-.55 0-1 .45-1 1v5c0 .55.45 1 1 1h1c1.1 0 2-.9 2-2v-6z"/></svg>
</button>
<div id="support-pop" role="dialog" aria-label="Contact options">
  <span class="sup-label">Customer Support</span>
  <a href="tel:9088481436">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.62 10.79a15.53 15.53 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.24c1.21.49 2.53.76 3.88.76a1 1 0 011 1v3.8a1 1 0 01-1 1C10.36 22.5 1.5 13.64 1.5 3a1 1 0 011-1H6.3a1 1 0 011 1c0 1.35.27 2.67.76 3.88a1 1 0 01-.24 1.11l-2.2 2.2z"/></svg>
    Call (908) 848-1436
  </a>
  <div class="sup-divider"></div>
  <button type="button" id="email-trigger-btn" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;color:rgba(255,255,255,.85);font-family:'Inter',sans-serif;font-size:.82rem;font-weight:600;letter-spacing:.04em;background:transparent;border:none;cursor:pointer;width:100%;text-align:left">
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;flex-shrink:0;fill:rgba(201,152,26,.7)"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
    Email Us
  </button>
  <div id="email-fallback" style="display:none;padding:8px 16px 4px;border-top:1px solid rgba(201,152,26,.15);margin-top:4px">
    <div style="font-size:.72rem;color:rgba(255,255,255,.45);margin-bottom:6px">king@crownmediagroup.co</div>
    <button type="button" id="copy-email-btn" style="display:block;width:100%;padding:6px 10px;margin-bottom:5px;background:rgba(201,152,26,.15);border:1px solid rgba(201,152,26,.3);border-radius:3px;color:#E8B832;font-size:.75rem;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;text-align:left">Copy Address</button>
    <a href="https://mail.google.com/mail/?view=cm&to=king%40crownmediagroup.co&su=Hello%20Crown%20Media%20Group" target="_blank" rel="noopener" style="display:block;padding:5px 10px;margin-bottom:2px;color:rgba(255,255,255,.65);font-size:.75rem;text-decoration:none;border-radius:3px">Open Gmail</a>
    <a href="https://outlook.live.com/mail/0/deeplink/compose?to=king%40crownmediagroup.co&subject=Hello%20Crown%20Media%20Group" target="_blank" rel="noopener" style="display:block;padding:5px 10px;margin-bottom:2px;color:rgba(255,255,255,.65);font-size:.75rem;text-decoration:none;border-radius:3px">Open Outlook</a>
    <a href="https://compose.mail.yahoo.com/?to=king%40crownmediagroup.co&subj=Hello%20Crown%20Media%20Group" target="_blank" rel="noopener" style="display:block;padding:5px 10px;color:rgba(255,255,255,.65);font-size:.75rem;text-decoration:none;border-radius:3px">Open Yahoo</a>
  </div>
</div>
<script>
(function(){
  var btn=document.getElementById('support-btn');
  var pop=document.getElementById('support-pop');
  btn.addEventListener('click',function(e){e.stopPropagation();pop.classList.toggle('open');btn.classList.toggle('open');});
  document.addEventListener('click',function(){pop.classList.remove('open');btn.classList.remove('open');});
  pop.addEventListener('click',function(e){e.stopPropagation();});
  var emailBtn=document.getElementById('email-trigger-btn');
  var emailFallback=document.getElementById('email-fallback');
  var copyBtn=document.getElementById('copy-email-btn');
  if(emailBtn&&emailFallback){emailBtn.addEventListener('click',function(e){e.stopPropagation();var opened=false,t;function onBlur(){opened=true;clearTimeout(t);window.removeEventListener('blur',onBlur);}window.addEventListener('blur',onBlur);window.location.href='mailto:king@crownmediagroup.co?subject=Hello%20Crown%20Media%20Group';t=setTimeout(function(){window.removeEventListener('blur',onBlur);if(!opened)emailFallback.style.display='block';},700);});}
  if(copyBtn){copyBtn.addEventListener('click',function(e){e.stopPropagation();var addr='king@crownmediagroup.co';function fb(){var ta=document.createElement('textarea');ta.value=addr;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');copyBtn.textContent='Copied!';}catch(ex){copyBtn.textContent='Failed';}document.body.removeChild(ta);setTimeout(function(){copyBtn.textContent='Copy Address';},2000);}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(addr).then(function(){copyBtn.textContent='Copied!';setTimeout(function(){copyBtn.textContent='Copy Address';},2000);}).catch(fb);}else{fb();}});}
})();
</script>
<script>(function(){try{var s=window.location.pathname.replace(/^\/blog\//,'').replace(/\/$/,'');if(!s||s==='blog')return;var ref='direct';try{if(document.referrer){var u=new URL(document.referrer);ref=u.hostname;}}catch(e){}fetch('/.netlify/functions/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:s,referrer:ref,title:document.title}),keepalive:true}).catch(function(){});}catch(e){}})();
function extractiveSummary(text){var sentences=text.replace(/\n+/g,' ').split(/(?<=[.!?])\s+/).filter(function(s){return s.trim().length>40&&s.trim().length<300;});if(sentences.length<=5)return sentences;var words=text.toLowerCase().split(/\W+/).filter(Boolean);var freq={};words.forEach(function(w){if(w.length>4)freq[w]=(freq[w]||0)+1;});var scored=sentences.map(function(s,i){var score=s.toLowerCase().split(/\W+/).reduce(function(a,w){return a+(freq[w]||0);},0);if(i<3||i>=sentences.length-3)score*=1.4;return{s:s,score:score};});scored.sort(function(a,b){return b.score-a.score;});return scored.slice(0,5).map(function(x){return x.s;});}
function renderBullets(bullets,label,color){var body=document.getElementById('ai-summary-body');var btn=document.getElementById('ai-summary-btn');if(bullets.length===0){body.innerHTML='<p style="color:#c33;font-size:.85rem;">Could not parse summary. Try again.</p>';btn.textContent='Retry';btn.disabled=false;return;}body.innerHTML=(label?'<p style="font-size:.75rem;color:#8A8AAA;margin:0 0 8px;letter-spacing:.06em;text-transform:uppercase;">'+label+'</p>':'')+' <ul>'+bullets.map(function(b){return'<li>'+b+'</li>';}).join('')+'</ul>';btn.textContent='Done';btn.style.background=color||'#4caf7d';}
function generateSummary(){var btn=document.getElementById('ai-summary-btn');var body=document.getElementById('ai-summary-body');if(!btn||!body)return;btn.disabled=true;btn.textContent='Thinking...';body.style.display='block';body.innerHTML='<div class="ai-summary-loading">Reading the article...</div>';var text=document.querySelector('.post-body')?.innerText||'';var title=document.querySelector('.post-title')?.innerText||document.title;if(!text||text.length<100){renderBullets(extractiveSummary(document.body.innerText),'Quick Summary','#C9981A');return;}fetch('/.netlify/functions/summarize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text,title:title})}).then(function(r){if(!r.ok)return r.json().then(function(e){throw new Error(e.error||('HTTP '+r.status));});return r.json();}).then(function(d){if(d.error){console.error('[Summarize] API error:',d.error);body.innerHTML='<p style="color:#c33;font-size:.85rem;">'+d.error+'</p>';btn.textContent='Try Again';btn.disabled=false;return;}var bullets=d.summary.split('\n').filter(function(l){return l.trim().startsWith('•')||l.trim().startsWith('-');}).map(function(l){return l.replace(/^[•\-]\s*/,'').trim();}).filter(Boolean);renderBullets(bullets,'',d.provider==='gemini'?'#4a90d9':'#4caf7d');}).catch(function(e){console.error('[Summarize] Fetch failed:',e.message,'— using extractive fallback');renderBullets(extractiveSummary(text),'Quick Summary (Offline)','#C9981A');});}
</script>
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
    <div class="ai-summary-widget" id="ai-summary-widget">
      <div class="ai-summary-header">
        <span class="ai-summary-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z"/><path d="M12 6v6l4 2"/></svg>
        </span>
        <span class="ai-summary-title">AI Summary</span>
        <span class="ai-summary-sub">Get the key takeaways in 5 bullets</span>
        <button class="ai-summary-btn" id="ai-summary-btn" type="button" onclick="generateSummary()">Summarize</button>
      </div>
      <div class="ai-summary-body" id="ai-summary-body" style="display:none;"></div>
    </div>
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
.ai-summary-widget{background:linear-gradient(135deg,rgba(26,26,62,.04) 0%,rgba(201,152,26,.06) 100%);border:1px solid rgba(201,152,26,.25);border-radius:12px;padding:20px 24px;margin:0 0 36px;position:relative;overflow:hidden}
.ai-summary-widget::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--gold) 0%,var(--royal,#1a1a3e) 100%)}
.ai-summary-header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ai-summary-icon{color:var(--gold);display:flex;align-items:center}
.ai-summary-title{font-family:'Cormorant Garamond',serif;font-size:1rem;font-weight:700;color:var(--text)}
.ai-summary-sub{font-size:.78rem;color:var(--text-light,#666);flex:1}
.ai-summary-btn{background:var(--gold,#C9981A);color:#fff;border:none;border-radius:6px;padding:8px 18px;font-size:.82rem;font-weight:600;cursor:pointer;letter-spacing:.04em;transition:opacity .2s,transform .15s}
.ai-summary-btn:hover{opacity:.88;transform:translateY(-1px)}
.ai-summary-btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.ai-summary-body{margin-top:16px;padding-top:16px;border-top:1px solid rgba(201,152,26,.15)}
.ai-summary-body ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px}
.ai-summary-body li{font-size:.9rem;line-height:1.55;color:var(--text);padding-left:20px;position:relative}
.ai-summary-body li::before{content:'→';position:absolute;left:0;color:var(--gold,#C9981A);font-weight:700}
.ai-summary-loading{display:flex;align-items:center;gap:8px;color:var(--text-light,#666);font-size:.88rem}
.ai-summary-loading::before{content:'';width:14px;height:14px;border:2px solid rgba(201,152,26,.3);border-top-color:var(--gold,#C9981A);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
.svc-link{color:var(--gold,#C9981A);text-decoration:underline;text-decoration-color:rgba(201,152,26,.35);text-underline-offset:2px;font-weight:600;transition:color .2s,text-decoration-color .2s}.svc-link:hover{color:var(--gold-deep,#9A720D);text-decoration-color:var(--gold,#C9981A)}
.blog-page-wrap{max-width:780px;margin:0 auto;padding:140px 24px 80px}
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
.post-nav-title{font-size:.88rem;font-weight:600;color:var(--text);line-height:1.3}
@media(max-width:600px){.blog-page-wrap{padding:100px 16px 60px}.post-cta{padding:32px 20px}.post-cta .btn-royal{display:block;width:100%;box-sizing:border-box;text-align:center}.post-nav-inner{flex-direction:column}.post-nav-link{max-width:100%}}`;

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
<article class="post-card" data-category="${slugify(p.category)}" data-date="${p.dateIso}">
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
.blog-index-wrap{max-width:1100px;margin:0 auto;padding:140px 48px 80px}
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
@media(max-width:768px){.blog-index-wrap{padding:120px 24px 60px}.blog-featured{padding:28px 24px}.posts-grid{grid-template-columns:1fr}}`;

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
.blog-index-wrap{max-width:1100px;margin:0 auto;padding:140px 48px 80px}
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
@media(max-width:768px){.blog-index-wrap{padding:120px 24px 60px}.posts-grid{grid-template-columns:1fr}}`;

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
