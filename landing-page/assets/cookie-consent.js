// Crown Media Group — lightweight cookie consent banner.
// Stores choice in `cmg_consent` cookie. Defers analytics scripts until the user accepts.
// Read by any analytics loader (look for the data-cmg-analytics attribute) — those scripts
// should set `data-cmg-analytics="true"` and `type="text/plain"`, and this script will swap
// them to `type="text/javascript"` once consent is given.
(function () {
  const COOKIE_NAME = 'cmg_consent';
  const COOKIE_DAYS = 365;

  function readCookie(name) {
    return document.cookie.split('; ').reduce((acc, c) => {
      const [k, ...v] = c.split('='); return k === name ? decodeURIComponent(v.join('=')) : acc;
    }, '');
  }
  function writeCookie(name, val) {
    const exp = new Date(Date.now() + COOKIE_DAYS * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(val)}; expires=${exp}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }

  function enableAnalytics() {
    document.querySelectorAll('script[data-cmg-analytics]').forEach(s => {
      if (s.dataset.cmgEnabled === '1') return;
      const replacement = document.createElement('script');
      for (const attr of s.attributes) {
        if (attr.name === 'type' || attr.name === 'data-cmg-analytics') continue;
        replacement.setAttribute(attr.name, attr.value);
      }
      replacement.dataset.cmgEnabled = '1';
      replacement.type = 'text/javascript';
      if (s.textContent) replacement.textContent = s.textContent;
      s.parentNode.replaceChild(replacement, s);
    });
  }

  function showBanner() {
    if (document.getElementById('cmg-consent-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'cmg-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;background:#1A1A3E;color:#E8E8F0;border-radius:10px;padding:18px 22px;box-shadow:0 16px 50px rgba(0,0,0,.35);z-index:9999;font-family:Inter,system-ui,sans-serif;font-size:.92rem;line-height:1.55;max-width:760px;margin:0 auto;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between';
    banner.innerHTML = `
      <div style="flex:1 1 320px;min-width:260px">
        <strong style="color:#C9981A">Cookies on Crown Media Group</strong><br>
        We use essential cookies to run the site. With your consent we also load analytics so we know what people read. See our <a href="/privacy.html" style="color:#E8B832;text-decoration:underline">Privacy Policy</a>.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" data-choice="essential" style="background:transparent;color:#E8E8F0;border:1px solid rgba(255,255,255,.3);padding:9px 16px;border-radius:4px;font-weight:600;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer">Essential only</button>
        <button type="button" data-choice="all" style="background:#C9981A;color:#1A1A3E;border:none;padding:9px 16px;border-radius:4px;font-weight:700;font-size:.82rem;letter-spacing:.06em;text-transform:uppercase;cursor:pointer">Accept all</button>
      </div>
    `;
    document.body.appendChild(banner);
    banner.querySelectorAll('button[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.choice;
        writeCookie(COOKIE_NAME, choice);
        banner.remove();
        if (choice === 'all') enableAnalytics();
      });
    });
  }

  const existing = readCookie(COOKIE_NAME);
  if (existing === 'all') {
    enableAnalytics();
  } else if (!existing) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showBanner);
    } else {
      showBanner();
    }
  }

  // Public API for "Change cookie choice" links elsewhere on the site
  window.cmgConsent = {
    reopen: () => { document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; showBanner(); },
    get:    () => readCookie(COOKIE_NAME),
  };
})();
