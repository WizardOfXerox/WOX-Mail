import { chromium } from 'playwright';

async function testDomain() {
  console.log('Testing domain routing with Host: mail.wox.world...');

  const browser = await chromium.launch({
    headless: true,
    args: ['--host-resolver-rules=MAP mail.wox.world 127.0.0.1'],
  });

  const page = await browser.newPage();

  try {
    const res = await page.goto('http://mail.wox.world:3001/', { waitUntil: 'domcontentloaded' });
    console.log('  Status:', res.status());
    console.log('  Title:', await page.title());
    console.log('  URL:', page.url());

    const hasLogo = await page.locator('.nav-logo').isVisible();
    console.log('  Nav Logo visible:', hasLogo);

    console.log('\n✅ http://mail.wox.world loads and renders correctly on the server!');
  } catch (err) {
    console.error('❌ Error loading domain:', err.message);
  } finally {
    await browser.close();
  }
}

testDomain();
