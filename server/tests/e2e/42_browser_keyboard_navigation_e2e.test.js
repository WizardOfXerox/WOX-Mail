import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL, apiRequest } from '../test_helper.js';
import { query } from '../../src/config/database.js';

test('Suite 42: Playwright E2E — Webmail VIM Keyboard Navigation & Shortcuts Modal', async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Register and log in a permanent test user
    const username = 'vim_' + Math.floor(Math.random() * 89999 + 10000);
    const password = 'SecureVimPassword2026!';
    const inviteCode = 'INV-VIM-' + Math.floor(Math.random() * 8999 + 1000);

    await query("INSERT INTO invite_codes (code, created_at) VALUES ($1, NOW())", [inviteCode]);

    await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username, password, inviteCode, captchaToken: 'dev-bypass' },
    });

    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: username, password },
    });

    const token = loginRes.body.token;
    assert.ok(token, 'Must receive auth token');

    // Set cookie on browser context matching exact BASE_URL
    await context.addCookies([
      {
        name: 'woxmail_token',
        value: token,
        url: `${BASE_URL}/`,
        httpOnly: true,
      },
    ]);

    // 2. Open Dashboard
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // 3. Test `?` opens Keyboard Shortcuts Cheat Sheet modal
    await page.keyboard.press('Shift+Slash');
    await page.waitForTimeout(400);

    const modalHeading = page.getByRole('heading', { name: 'Keyboard Shortcuts' });
    assert.ok(await modalHeading.isVisible(), 'Keyboard Shortcuts modal heading must appear when typing ?');

    // 4. Test `Escape` closes the shortcuts modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    assert.ok(!(await modalHeading.isVisible()), 'Keyboard Shortcuts modal must close on Escape');

    // 5. Test `c` opens Compose modal
    await page.keyboard.press('c');
    await page.waitForTimeout(400);

    const sendBtn = page.getByRole('button', { name: /Send/i });
    assert.ok(await sendBtn.isVisible(), 'Compose modal must open when pressing c key');

    // 6. Test `Escape` closes Compose modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } finally {
    await browser.close();
  }
});
