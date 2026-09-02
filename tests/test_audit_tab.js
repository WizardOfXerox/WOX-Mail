import { chromium } from 'playwright';

async function testAuditTab() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Login
  await page.goto('http://localhost:3001/login');
  await page.fill('#email', (process.env.ADMIN_EMAIL || ''));
  await page.fill('#password', (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, ''));
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard');

  // Go to /admin#audit
  await page.goto('http://localhost:3001/admin#audit', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'H:/Ideas/Mail/tests/screenshots/08_admin_audit_tab.png', fullPage: true });

  const rows = await page.locator('tbody tr').count();
  console.log(`✅ Audit Tab Loaded Successfully! Total rendered audit log rows: ${rows}`);
  await browser.close();
}

testAuditTab().catch(err => {
  console.error('Audit Tab Test Failed:', err);
  process.exit(1);
});
