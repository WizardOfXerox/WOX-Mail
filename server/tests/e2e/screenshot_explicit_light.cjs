const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('woxmail_theme', 'light');
  });
  await page.waitForTimeout(400);

  const navbar = page.locator('#main-nav');
  await navbar.screenshot({ path: path.join(__dirname, 'nav_explicit_light.png') });

  const faqSection = page.locator('text=Frequently Asked Questions').locator('xpath=ancestor::section[1]');
  await faqSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await faqSection.screenshot({ path: path.join(__dirname, 'faq_explicit_light.png') });

  const ctaSection = page.locator('.cta-banner-box');
  await ctaSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await ctaSection.screenshot({ path: path.join(__dirname, 'cta_explicit_light.png') });

  await browser.close();
  console.log('Explicit light screenshots captured.');
})();
