import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL } from '../test_helper.js';

test('Suite 34: Playwright E2E — Support Desk Ticketing & FutureMe Letter Composer', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Support Desk Test
    await page.goto(`${BASE_URL}/support`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const supportHeading = await page.locator('h1, h2').first().innerText();
    assert.ok(supportHeading.includes('Support') || supportHeading.includes('Desk'));

    // Check support form fields exist
    const emailInput = page.locator('#ticket-email');
    const subjectInput = page.locator('#ticket-subject');
    const messageInput = page.locator('#ticket-message');

    assert.ok(await emailInput.count() > 0, 'Support email input (#ticket-email) must be present');
    assert.ok(await subjectInput.count() > 0, 'Support subject input (#ticket-subject) must be present');
    assert.ok(await messageInput.count() > 0, 'Support message textarea (#ticket-message) must be present');

    // 2. FutureMe Page Test
    await page.goto(`${BASE_URL}/futureme`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const futureHeading = await page.locator('h1, h2').first().innerText();
    assert.ok(futureHeading.includes('Future') || futureHeading.includes('Letter') || futureHeading.includes('Time Capsule'));

    // 3. Public Epistles Feed
    await page.goto(`${BASE_URL}/futureme/public`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const publicHeading = await page.locator('h1, h2').first().innerText();
    assert.ok(publicHeading.includes('Public') || publicHeading.includes('Epistles') || publicHeading.includes('Reflections') || publicHeading.includes('Letters') || publicHeading.includes('Community'));
  } finally {
    await browser.close();
  }
});
