import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { query } from '../src/config/database.js';
import jwt from 'jsonwebtoken';

async function runTests() {
  console.log('--- 1. Testing Open Graph Social Preview Image & Meta Tags ---');
  const ogPngPath = path.resolve('public/assets/og-preview.png');
  if (!fs.existsSync(ogPngPath)) throw new Error('og-preview.png is missing from public/assets');
  const ogStat = fs.statSync(ogPngPath);
  console.log('og-preview.png exists! Size:', ogStat.size, 'bytes');

  const baseEjs = fs.readFileSync(path.resolve('server/views/layouts/base.ejs'), 'utf8');
  if (!baseEjs.includes('og:image') || !baseEjs.includes('twitter:image')) {
    throw new Error('base.ejs is missing Open Graph or Twitter image tags');
  }
  console.log('Open Graph & Twitter Card tags verified in base.ejs');

  console.log('\n--- 2. Testing PWA Manifest & Service Worker ---');
  const manifestRaw = fs.readFileSync(path.resolve('public/manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);
  console.log('Manifest name:', manifest.name);
  console.log('Manifest start_url:', manifest.start_url);
  if (!manifest.start_url.includes('/dashboard')) throw new Error('start_url should point to /dashboard');

  const swJs = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
  if (!swJs.includes('/dist/')) throw new Error('sw.js should cache /dist/ React bundles');
  if (!swJs.includes('woxmail-pwa-v3')) throw new Error('sw.js cache name should be updated');
  console.log('sw.js bundle caching & cache version verified');

  console.log('\n--- 3. Testing Contact Search & Alias Inclusion ---');
  const userRes = await query("SELECT id, email, username FROM users WHERE email = 'admin@wox.world'");
  const user = userRes.rows[0];
  const token = jwt.sign({ userId: user.id, type: 'access' }, process.env.JWT_SECRET);

  // Insert a test contact
  const testEmail = `contact-${Date.now()}@example.com`;
  await query(
    `INSERT INTO contacts (user_id, email, name, last_emailed)
     VALUES ($1, $2, 'Test Autocomplete Person', NOW())
     ON CONFLICT (user_id, email) DO NOTHING`,
    [user.id, testEmail]
  );

  const searchRes = await fetch(`http://localhost:3001/api/settings/contacts?q=Autocomplete`, {
    headers: { 'Cookie': `woxmail_token=${token}` }
  });
  const searchData = await searchRes.json();
  console.log('Contact search results count:', searchData.contacts?.length);
  const foundContact = searchData.contacts?.find((c) => c.email === testEmail);
  if (!foundContact) throw new Error('Created contact not found in search results');
  console.log('Found contact:', foundContact.name, foundContact.email);

  // Clean up test contact
  await query('DELETE FROM contacts WHERE user_id = $1 AND email = $2', [user.id, testEmail]);
  console.log('Cleaned up test contact');

  console.log('\n✅ All PWA, Social Preview Image, and Contact Autocomplete tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
