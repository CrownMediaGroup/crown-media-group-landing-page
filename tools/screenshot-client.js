// screenshot-client.js
// Takes a screenshot of any website — use for client audits, competitor research, portfolio
// Usage: node tools/screenshot-client.js https://example.com

const { chromium } = require('playwright');

const url = process.argv[2];

if (!url) {
  console.log('Usage: node tools/screenshot-client.js https://example.com');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle' });

  const filename = `screenshot-${Date.now()}.png`;
  await page.screenshot({ path: filename, fullPage: true });

  console.log(`Saved: ${filename}`);
  await browser.close();
})();
