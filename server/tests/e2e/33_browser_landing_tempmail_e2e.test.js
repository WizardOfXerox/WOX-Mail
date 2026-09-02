import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL } from '../test_helper.js';

test('Suite 33: Playwright E2E — Landing Page Mode Toggle & Temp Mail Toolbar', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Landing Page Test
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Verify Title & Hero elements
    const pageTitle = await page.title();
    assert.ok(pageTitle.includes('WoxMail') || pageTitle.includes('Home') || pageTitle.includes('Privacy'));

    // Check Instant Pool mode vs Custom Handle mode toggle
    const customBtn = page.locator('#mode-btn-custom');
    assert.ok(await customBtn.count() > 0, 'Custom handle mode button must exist');

    await customBtn.click();
    await page.waitForTimeout(300);

    // Check lifespan selector row appears
    const lifespanRow = page.locator('#hero-lifespan-selector-row');
    const isVisible = await lifespanRow.isVisible();
    assert.ok(isVisible, 'Lifespan selector must be visible when Custom Handle is selected');

    // Switch back to Instant Pool mode
    const poolBtn = page.locator('#mode-btn-pool');
    await poolBtn.click();
    await page.waitForTimeout(300);
    const isHidden = !(await lifespanRow.isVisible());
    assert.ok(isHidden, 'Lifespan selector must be hidden in Instant Pool mode');

    // 2. Temp Mail Page Test
    await page.goto(`${BASE_URL}/tempmail`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    // Verify address box exists
    const addressBox = page.locator('#temp-address, #address-input, .address-display, input[readonly]').first();
    assert.ok(await addressBox.count() > 0, 'Temp mail address display element must be present');

    // Verify Action Toolbar buttons exist
    const copyBtn = page.locator('#copy-btn, #btn-copy, button:has-text("Copy")').first();
    assert.ok(await copyBtn.count() > 0, 'Copy button must be present in toolbar');
  } finally {
    await browser.close();
  }
});
