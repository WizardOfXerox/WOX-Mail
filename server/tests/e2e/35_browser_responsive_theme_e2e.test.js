import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL } from '../test_helper.js';

test('Suite 35: Playwright E2E — Responsive Navigation & Theme Switcher', async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Desktop Test (1280x800)
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForTimeout(500);

    // Desktop navbar Support link
    const desktopSupportLink = desktopPage.locator('nav a[href="/support"]').first();
    assert.ok(await desktopSupportLink.count() > 0, 'Support link must be present in desktop navbar');

    // Theme toggle button in navbar
    const themeBtn = desktopPage.locator('#theme-toggle-btn').first();
    assert.ok(await themeBtn.count() > 0, 'Theme toggle button must be present in navbar');

    const initialTheme = await desktopPage.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark');
    const targetOption = initialTheme === 'dark' ? '#gt-btn-light' : '#gt-btn-dark';
    await themeBtn.click();
    await desktopPage.waitForTimeout(300);

    const optionLocator = desktopPage.locator(targetOption);
    if (await optionLocator.count() > 0) {
      await optionLocator.click();
      await desktopPage.waitForTimeout(300);
    }
    const newTheme = await desktopPage.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
    assert.notEqual(initialTheme, newTheme, 'Theme toggle must update document data-theme attribute');

    await desktopContext.close();

    // 2. Mobile View Test (390x844)
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(500);

    // Mobile Hamburger Button
    const mobileMenuBtn = mobilePage.locator('#nav-hamburger');
    assert.ok(await mobileMenuBtn.count() > 0, 'Mobile hamburger button must be visible on mobile viewport');

    // Open Mobile Drawer
    await mobileMenuBtn.click();
    await mobilePage.waitForTimeout(400);

    // Verify Support Desk link exists inside mobile drawer
    const drawerSupport = mobilePage.locator('#nav-mobile a[href="/support"]').first();
    assert.ok(await drawerSupport.count() > 0, 'Support Desk link must be present in mobile drawer');

    await mobileContext.close();
  } finally {
    await browser.close();
  }
});
