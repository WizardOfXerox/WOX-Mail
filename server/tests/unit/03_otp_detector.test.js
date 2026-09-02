import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOTP, isOtpMessage } from '../../src/utils/otpDetector.js';

test('Suite 03: OTP & Verification Code Extraction Engine', async (t) => {
  await t.test('1. Extracts standard verification patterns (4 to 8 digits)', () => {
    const cases = [
      { text: 'Your verification code is 849201.', expected: '849201' },
      { text: 'Security alert: Your WoxMail OTP is 928374', expected: '928374' },
      { text: '394821 is your confirmation code', expected: '394821' },
      { text: 'Use 4829 to confirm your login', expected: '4829' },
      { text: 'Enter passcode 10928374 to proceed', expected: '10928374' },
    ];

    for (const c of cases) {
      const result = extractOTP(c.text);
      assert.equal(result.isOtp, true, `Failed detecting OTP in: "${c.text}"`);
      assert.equal(result.code, c.expected, `Incorrect code extracted from: "${c.text}"`);
    }
  });

  await t.test('2. Extracts Google-style (G-XXXXXX) codes', () => {
    const text = 'G-748291 is your Google verification code.';
    const result = extractOTP(text);
    assert.equal(result.isOtp, true);
    assert.equal(result.code, '748291');
  });

  await t.test('3. Multilingual and international OTP formats', () => {
    const es = 'Tu código de seguridad es 819203';
    assert.equal(extractOTP(es).code, '819203');

    const fr = '918234 est votre code de confirmation';
    assert.equal(extractOTP(fr).code, '918234');
  });

  await t.test('4. Rejects false positives (Phone numbers, dates, addresses, general numbers)', () => {
    const nonOtps = [
      'Hey, let us meet tomorrow at 4pm with 5 people.',
      'Order #982910 has shipped and will arrive on 2026-08-30.',
      'Please call my office line at +1 (555) 234-5678.',
      'The package dimensions are 12x14x18 cm.',
    ];

    for (const text of nonOtps) {
      const isOtp = isOtpMessage(text);
      assert.equal(isOtp, false, `False positive detected on text: "${text}"`);
    }
  });
});
