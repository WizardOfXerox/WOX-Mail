import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl } from '../../src/services/linkPreviewService.js';
import { isValidImageUrl } from '../../src/services/imageProxy.js';

test('Suite 18: Link Preview Metadata Scraper & Privacy Image Proxy SSRF Guard', async (t) => {
  await t.test('1. isSafeUrl() blocks dangerous SSRF internal IP targets and cloud metadata endpoints', async () => {
    const dangerousUrls = [
      'http://127.0.0.1:8080/admin',
      'http://localhost:3000',
      'http://169.254.169.254/latest/meta-data/', // AWS/GCP cloud metadata
      'http://10.0.0.1/router',
      'http://192.168.1.1/gateway',
      'http://0.0.0.0:5432',
      'file:///etc/passwd',
    ];

    for (const url of dangerousUrls) {
      const check = await isSafeUrl(url);
      assert.equal(check.safe, false, `SSRF check failed to block dangerous URL: ${url}`);
    }
  });

  await t.test('2. isSafeUrl() permits legitimate public internet URLs', async () => {
    const safeCheck = await isSafeUrl('https://example.com/blog/article');
    assert.equal(safeCheck.safe, true);
  });

  await t.test('3. isValidImageUrl() validates HTTP/HTTPS image schemes', () => {
    assert.equal(isValidImageUrl('https://cdn.example.com/banner.png'), true);
    assert.equal(isValidImageUrl('http://cdn.example.com/photo.jpg'), true);
    assert.equal(isValidImageUrl('javascript:alert(1)'), false);
    assert.equal(isValidImageUrl('data:image/png;base64,...'), false);
  });
});
