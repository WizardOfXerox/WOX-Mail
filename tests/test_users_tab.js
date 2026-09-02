import { chromium } from 'playwright';

async function testScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Login
  await page.goto('http://localhost:3001/login');
  await page.fill('#email', (process.env.ADMIN_EMAIL || ''));
  await page.fill('#password', (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, ''));
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');

  // Go to /admin#users
  await page.goto('http://localhost:3001/admin#users', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'H:/Ideas/Mail/tests/screenshots/09_admin_users_populated.png', fullPage: true });

  const rows = await page.locator('tbody tr').count();
  console.log(`✅ Users Tab Loaded! Total user rows rendered: ${rows}`);
  await browser.close();
}

testScreenshots().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
