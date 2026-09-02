const { chromium } = require('playwright');
const path = require('path');
const jwt = require('jsonwebtoken');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await context.newPage();

  const token = jwt.sign(
    { userId: 1, type: 'access' },
    process.env.JWT_SECRET || '8dba6967a54f6749ad4bd32e1b66a9e810d1d08e9a5be5872ca99b9d606c9a21',
    { expiresIn: '1h' }
  );

  await context.addCookies([
    {
      name: 'woxmail_token',
      value: token,
      url: 'http://127.0.0.1:3001/',
    },
  ]);

  // 1. Capture Dark Mode Desktop Navbar
  await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const navbar = page.locator('#main-nav');
  await navbar.screenshot({ path: path.join(__dirname, 'nav_desktop_spaced_dark.png') });

  // 2. Switch to Light Mode and screenshot Navbar & FAQ
  await page.click('#theme-toggle-btn');
  await page.waitForTimeout(400);

  await navbar.screenshot({ path: path.join(__dirname, 'nav_desktop_spaced_light.png') });

  // Scroll to FAQ section and take screenshot
  const faqSection = page.locator('text=Frequently Asked Questions').locator('xpath=ancestor::section[1]');
  await faqSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await faqSection.screenshot({ path: path.join(__dirname, 'faq_section_light_mode.png') });

  // Mobile viewport screenshot of drawer with Tor button
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(400);
  await mobilePage.click('#nav-hamburger');
  await mobilePage.waitForTimeout(500);
  await mobilePage.screenshot({ path: path.join(__dirname, 'mobile_drawer_tor.png') });

  await browser.close();
  console.log('Screenshots captured successfully.');
})();
