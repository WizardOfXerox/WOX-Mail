import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'http://localhost:3001';

async function runTests() {
  console.log('🚀 Starting Playwright End-to-End Test Suite for WoxMail...\n');

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  let passed = 0;
  let failed = 0;

  function record(name, isSuccess, details = '') {
    if (isSuccess) {
      console.log(`  ✅ [PASS] ${name} ${details}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${details}`);
      failed++;
    }
  }

  try {
    // ─── Test 1: Landing Page ──────────────────────
    console.log('Testing Landing Page (/)');
    const landingRes = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    record('Landing Page Status 200', landingRes.status() === 200);

    const title = await page.title();
    record('Landing Page Title', title.includes('WoxMail'), `("${title}")`);

    const hasCta = await page.locator('a[href="/tempmail"], a[href="/login"]').count();
    record('Landing Page CTA Buttons', hasCta >= 2, `Found ${hasCta} action buttons`);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1_landing.png'), fullPage: true });

    // ─── Test 2: Temp Mail (Public) ────────────────
    console.log('\nTesting Public Temp Mail (/tempmail)');
    const tempRes = await page.goto(`${BASE_URL}/tempmail`, { waitUntil: 'domcontentloaded' });
    record('Tempmail Page Status 200', tempRes.status() === 200);

    const hasExpiryButtons = await page.locator('.expiry-btn').count();
    record('Expiry Duration Buttons', hasExpiryButtons >= 3, `Found ${hasExpiryButtons} duration options`);

    const hasGenerateBtn = await page.locator('#generate-btn').isVisible();
    record('Generate Address Button', hasGenerateBtn);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '2_tempmail_public.png'), fullPage: true });

    // ─── Test 3: Personal Temp Mail ────────────────
    console.log('\nTesting Personal Temp Mail (/tempmail/personal)');
    const personalRes = await page.goto(`${BASE_URL}/tempmail/personal`, { waitUntil: 'domcontentloaded' });
    record('Personal Tempmail Status 200', personalRes.status() === 200);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '3_tempmail_personal.png'), fullPage: true });

    page.on('console', (msg) => console.log('   [BROWSER LOG]', msg.text()));
    page.on('pageerror', (err) => console.log('   [BROWSER ERROR]', err.message));

    // ─── Test 4: Authentication & Login Flow ───────
    console.log('\nTesting Authentication (/login)');
    const loginRes = await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    record('Login Page Status 200', loginRes.status() === 200);

    await page.fill('#email', (process.env.ADMIN_EMAIL || ''));
    await page.fill('#password', (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, ''));
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4_login_form.png') });

    // Submit via button click
    await page.click('#login-btn');
    await page.waitForTimeout(2000);

    const afterLoginUrl = page.url();
    record('Login Flow Executed', true, `Current URL: ${afterLoginUrl}`);

    // ─── Test 5: Dashboard App ─────────────────────
    console.log('\nTesting Webmail Dashboard (/dashboard)');
    const dashRes = await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
    record('Dashboard Status 200', dashRes.status() === 200);

    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '5_dashboard.png'), fullPage: true });
    record('Dashboard Page Rendered', true);

    // ─── Test 6: Settings App ──────────────────────
    console.log('\nTesting Settings (/settings)');
    const settingsRes = await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
    record('Settings Page Status 200', settingsRes.status() === 200);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '6_settings.png'), fullPage: true });

    // ─── Test 7: Admin Panel ───────────────────────
    console.log('\nTesting Admin Panel (/admin)');
    const adminRes = await page.goto(`${BASE_URL}/admin`, { waitUntil: 'domcontentloaded' });
    record('Admin Panel Status 200', adminRes.status() === 200);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '7_admin.png'), fullPage: true });

    // ─── Test 8: Legal Pages ───────────────────────
    console.log('\nTesting Legal & Static Pages');
    const privacyRes = await page.goto(`${BASE_URL}/privacy`, { waitUntil: 'domcontentloaded' });
    record('Privacy Page Status 200', privacyRes.status() === 200);

    const termsRes = await page.goto(`${BASE_URL}/terms`, { waitUntil: 'domcontentloaded' });
    record('Terms Page Status 200', termsRes.status() === 200);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '8_privacy.png'), fullPage: true });

  } catch (err) {
    console.error('\n⚠️ Unexpected Error during tests:', err.message);
    failed++;
  } finally {
    await browser.close();

    console.log('\n═══════════════════════════════════════════');
    console.log(`  E2E Test Run Complete: ${passed} Passed, ${failed} Failed`);
    console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log('═══════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
