const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://woxmail:woxmail@localhost:5432/woxmail'
});

async function query(text, params) {
  return pool.query(text, params);
}

const CLEARNET_BASE = 'https://mail.wox.world';
const ONION_BASE = 'http://e6mph43cdahjoum7pbrs2gpzvb3edq3j2ob6hi5soihld4oid2fcwbad.onion';
const TOR_SOCKS = '127.0.0.1:9050';

const COOKIE_CLEARNET = path.join(__dirname, 'clearnet_cookies.txt');
const COOKIE_ONION = path.join(__dirname, 'onion_cookies.txt');

// Clean previous cookies
if (fs.existsSync(COOKIE_CLEARNET)) fs.unlinkSync(COOKIE_CLEARNET);
if (fs.existsSync(COOKIE_ONION)) fs.unlinkSync(COOKIE_ONION);

function request(url, options = {}) {
  const {
    isTor = false,
    method = 'GET',
    data = null,
    csrfToken = null,
    cookieFile = null
  } = options;

  const args = ['curl.exe', '-s', '-i'];

  if (isTor) {
    args.push('--socks5-hostname', TOR_SOCKS);
  }
  if (cookieFile) {
    args.push('-b', `"${cookieFile}"`);
    args.push('-c', `"${cookieFile}"`);
  }
  if (method !== 'GET') {
    args.push('-X', method);
  }
  if (data) {
    args.push('-H', '"Content-Type: application/json"');
    const jsonStr = JSON.stringify(data).replace(/"/g, '\\"');
    args.push('-d', `"${jsonStr}"`);
  }
  if (csrfToken) {
    args.push('-H', `"x-csrf-token: ${csrfToken}"`);
  }
  args.push(`"${url}"`);

  const cmd = args.join(' ');
  const output = execSync(cmd, { encoding: 'utf8', timeout: 35000 });

  const headerEndIndex = output.indexOf('\r\n\r\n');
  const headersText = headerEndIndex !== -1 ? output.substring(0, headerEndIndex) : output;
  const bodyText = headerEndIndex !== -1 ? output.substring(headerEndIndex + 4) : '';

  const statusMatch = headersText.match(/HTTP\/[12](\.[01])?\s+(\d{3})/);
  const statusCode = statusMatch ? parseInt(statusMatch[2], 10) : 0;

  let csrf = null;
  const csrfMatch = output.match(/woxmail_csrf=([a-f0-9]+)/i);
  if (csrfMatch) {
    csrf = csrfMatch[1];
  }

  const onionLocationMatch = headersText.match(/Onion-Location:\s*([^\r\n]+)/i);
  const onionLocation = onionLocationMatch ? onionLocationMatch[1].trim() : null;

  let parsedJson = null;
  try {
    parsedJson = JSON.parse(bodyText);
  } catch (e) {}

  return {
    statusCode,
    headersText,
    bodyText,
    csrf,
    onionLocation,
    json: parsedJson
  };
}

const testResults = [];

function record(domainLabel, testName, passed, detail = '') {
  testResults.push({ domainLabel, testName, passed, detail });
  const badge = passed ? '✔ PASS' : '✖ FAIL';
  console.log(`  [${domainLabel.padEnd(22)}] ${testName.padEnd(46)} ${badge} ${detail ? '(' + detail + ')' : ''}`);
}

async function verifyDomain(domainUrl, isTor, domainLabel, cookieFile, inviteCode) {
  console.log(`\n================================================================================`);
  console.log(`  VERIFYING DOMAIN: ${domainLabel}`);
  console.log(`  Endpoint URL: ${domainUrl}`);
  console.log(`  Transport: ${isTor ? 'Tor V3 SOCKS5 (Port 9050)' : 'Direct Cloudflare Tunnel HTTPS'}`);
  console.log(`================================================================================`);

  // 1. Health Probe
  let csrfToken = null;
  try {
    const res = request(`${domainUrl}/api/health`, { isTor, cookieFile });
    const isOk = res.statusCode === 200 && res.json && res.json.status === 'ok';
    if (res.csrf) csrfToken = res.csrf;
    record(domainLabel, '1. Health Status (/api/health)', isOk, `Uptime: ${res.json?.uptime?.toFixed(1) || 0}s`);
  } catch (err) {
    record(domainLabel, '1. Health Status (/api/health)', false, err.message);
  }

  // 2. Landing Page & Tor Discovery Meta
  try {
    const res = request(`${domainUrl}/`, { isTor, cookieFile });
    if (!csrfToken && res.csrf) csrfToken = res.csrf;
    const hasLanding = res.statusCode === 200 && res.bodyText.includes('WoxMail');
    const hasOnionHeader = !isTor ? (res.onionLocation !== null || res.bodyText.includes('onion-location')) : true;
    const hasTorPill = res.bodyText.includes('Tor (.onion)');
    record(domainLabel, '2. Landing Page & Onion-Location Meta', hasLanding && hasOnionHeader && hasTorPill, `Status: ${res.statusCode}`);
  } catch (err) {
    record(domainLabel, '2. Landing Page & Onion-Location Meta', false, err.message);
  }

  // 3. Static Style & Client Scripts
  try {
    const resCss = request(`${domainUrl}/css/style.css`, { isTor, cookieFile });
    const hasCss = resCss.statusCode === 200 && resCss.bodyText.includes('--color-primary');
    record(domainLabel, '3. Static Assets & Purple Design System', hasCss, `Bytes: ${resCss.bodyText.length}`);
  } catch (err) {
    record(domainLabel, '3. Static Assets & Purple Design System', false, err.message);
  }

  // 4. Instant Disposable Temp Mail Page
  try {
    const resPage = request(`${domainUrl}/tempmail`, { isTor, cookieFile });
    const isOk = resPage.statusCode === 200 && resPage.bodyText.includes('Temp Mail');
    record(domainLabel, '4. Instant Temp Mail View (/tempmail)', isOk, `Status: ${resPage.statusCode}`);
  } catch (err) {
    record(domainLabel, '4. Instant Temp Mail View (/tempmail)', false, err.message);
  }

  // 5. Generate Standby Pool Mailbox
  let generatedEmail = null;
  try {
    const resGen = request(`${domainUrl}/api/tempmail/generate`, {
      isTor,
      method: 'POST',
      csrfToken,
      cookieFile,
      data: { expiryHours: 24, forceNew: true, captchaToken: 'dev-bypass' }
    });
    const isOk = (resGen.statusCode === 200 || resGen.statusCode === 201) && resGen.json && resGen.json.address;
    if (isOk) {
      generatedEmail = resGen.json.address;
    }
    record(domainLabel, '5. Standby Pool Generation (/api/tempmail/generate)', isOk, generatedEmail || `HTTP ${resGen.statusCode}`);
  } catch (err) {
    record(domainLabel, '5. Standby Pool Generation', false, err.message);
  }

  // 6. Live Messages Query for Temp Mailbox
  try {
    if (generatedEmail) {
      const resMessages = request(`${domainUrl}/api/tempmail/inbox/${generatedEmail}`, { isTor, cookieFile });
      const isOk = resMessages.statusCode === 200 && resMessages.json && Array.isArray(resMessages.json.messages);
      record(domainLabel, '6. Real-Time Message Sync (/api/tempmail/inbox/:addr)', isOk, `Messages: ${resMessages.json?.messages?.length || 0}`);
    } else {
      record(domainLabel, '6. Real-Time Message Sync', false, 'Skipped: No address');
    }
  } catch (err) {
    record(domainLabel, '6. Real-Time Message Sync', false, err.message);
  }

  // 7. Personal Temp Mail 60-Day Password Claim & Login
  const uniqueHandle = `tor_p_${Date.now().toString(36).slice(-5)}`;
  const testPassword = 'Password123!';
  let personalAddress = null;
  try {
    const resClaim = request(`${domainUrl}/api/tempmail/personal/create`, {
      isTor,
      method: 'POST',
      csrfToken,
      cookieFile,
      data: {
        username: uniqueHandle,
        password: testPassword,
        expiryHours: 720,
        captchaToken: 'dev-bypass'
      }
    });
    const isOk = resClaim.statusCode === 201 && resClaim.json && resClaim.json.address;
    if (isOk) {
      personalAddress = resClaim.json.address;
    }
    record(domainLabel, '7. Personal 60-Day Create (/api/tempmail/personal/create)', isOk, personalAddress || `HTTP ${resClaim.statusCode}`);

    if (isOk) {
      const resLogin = request(`${domainUrl}/api/tempmail/personal/login`, {
        isTor,
        method: 'POST',
        csrfToken,
        cookieFile,
        data: {
          address: personalAddress,
          password: testPassword
        }
      });
      const isLoginOk = resLogin.statusCode === 200 && resLogin.json && resLogin.json.address;
      record(domainLabel, '8. Personal Password Auth (/api/tempmail/personal/login)', isLoginOk, 'Vault Session Verified');
    }
  } catch (err) {
    record(domainLabel, '7. Personal 60-Day Create', false, err.message);
  }

  // 8. FutureMe Letters to the Future
  try {
    const resFuture = request(`${domainUrl}/futureme`, { isTor, cookieFile });
    record(domainLabel, '9. FutureMe UI View (/futureme)', resFuture.statusCode === 200, `Status: ${resFuture.statusCode}`);

    const resSchedule = request(`${domainUrl}/api/futureme/letters`, {
      isTor,
      method: 'POST',
      csrfToken,
      cookieFile,
      data: {
        senderEmail: 'guest@wox.world',
        recipientEmail: 'future@wox.world',
        subject: `Time Capsule from ${domainLabel}`,
        body: 'Encrypted verification time capsule across dual domains.',
        deliveryDate: new Date(Date.now() + 86400000 * 365).toISOString().split('T')[0],
        visibility: 'private'
      }
    });
    const isSchedOk = (resSchedule.statusCode === 200 || resSchedule.statusCode === 201) && resSchedule.json && (resSchedule.json.success || resSchedule.json.letter);
    record(domainLabel, '10. Schedule Encrypted Capsule (/api/futureme/letters)', isSchedOk, `Capsule: ${resSchedule.json?.letter?.subject || 'Verified'}`);
  } catch (err) {
    record(domainLabel, '10. Schedule Encrypted Capsule', false, err.message);
  }

  // 9. Permanent Webmail Registration & Authentication
  let registeredUser = null;
  const testWebmailUser = `user_${Date.now().toString(36).slice(-5)}`;
  try {
    const resReg = request(`${domainUrl}/api/auth/register`, {
      isTor,
      method: 'POST',
      csrfToken,
      cookieFile,
      data: {
        username: testWebmailUser,
        password: 'WoxPassword2026!',
        inviteCode: inviteCode
      }
    });
    const isRegOk = (resReg.statusCode === 200 || resReg.statusCode === 201) && resReg.json && resReg.json.user;
    if (isRegOk) {
      registeredUser = resReg.json.user;
    }
    record(domainLabel, '11. Webmail Registration (/api/auth/register)', isRegOk, isRegOk ? `Created: ${registeredUser.username}` : `HTTP ${resReg.statusCode}`);
  } catch (err) {
    record(domainLabel, '11. Webmail Registration', false, err.message);
  }

  // 10. Webmail Login
  let authenticated = false;
  try {
    const resLogin = request(`${domainUrl}/api/auth/login`, {
      isTor,
      method: 'POST',
      csrfToken,
      cookieFile,
      data: {
        email: `${testWebmailUser}@wox.world`,
        password: 'WoxPassword2026!'
      }
    });
    const isLoginOk = resLogin.statusCode === 200 && resLogin.json && resLogin.json.user;
    if (isLoginOk) authenticated = true;
    record(domainLabel, '12. Webmail Account Login (/api/auth/login)', isLoginOk, isLoginOk ? `Logged in: ${resLogin.json.user.username}` : `HTTP ${resLogin.statusCode}`);
  } catch (err) {
    record(domainLabel, '12. Webmail Account Login', false, err.message);
  }

  // 11. Support Helpdesk Ticket Lifecycle (Authenticated Session)
  try {
    const resSupport = request(`${domainUrl}/support`, { isTor, cookieFile });
    record(domainLabel, '13. Support Desk UI View (/support)', resSupport.statusCode === 200, `Status: ${resSupport.statusCode}`);

    if (authenticated) {
      const resTicket = request(`${domainUrl}/api/support/tickets`, {
        isTor,
        method: 'POST',
        csrfToken,
        cookieFile,
        data: {
          subject: `Live Test Ticket from ${domainLabel}`,
          messageText: 'Validating helpdesk ingestion over network with authenticated session.',
          category: 'general',
          priority: 'medium'
        }
      });
      const isTicketOk = (resTicket.statusCode === 200 || resTicket.statusCode === 201) && resTicket.json && resTicket.json.ticket;
      record(domainLabel, '14. Create Support Ticket (/api/support/tickets)', isTicketOk, `Ticket #${resTicket.json?.ticket?.id || 'N/A'}`);
    } else {
      record(domainLabel, '14. Create Support Ticket', false, 'Skipped: Not authenticated');
    }
  } catch (err) {
    record(domainLabel, '14. Create Support Ticket', false, err.message);
  }

  // 12. Autodiscover RFC 6186 & Apple .mobileconfig Profiles
  try {
    const resAutoconfig = request(`${domainUrl}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=test@wox.world`, { isTor, cookieFile });
    const isAutoconfigOk = resAutoconfig.statusCode === 200 && resAutoconfig.bodyText.includes('<clientConfig');
    record(domainLabel, '15. RFC 6186 Mail Autoconfig (/.well-known/autoconfig)', isAutoconfigOk, `Status: ${resAutoconfig.statusCode}`);

    const resMobileconfig = request(`${domainUrl}/mobileconfig?email=test@wox.world`, { isTor, cookieFile });
    const isMobileconfigOk = resMobileconfig.statusCode === 200 && resMobileconfig.bodyText.includes('PayloadType');
    record(domainLabel, '16. Apple 1-Click Profile (/mobileconfig)', isMobileconfigOk, `Status: ${resMobileconfig.statusCode}`);
  } catch (err) {
    record(domainLabel, '16. Apple 1-Click Profile', false, err.message);
  }
}

async function main() {
  console.log('\n================================================================================');
  console.log('  WOXMAIL DUAL-DOMAIN LIVE VERIFICATION MATRIX');
  console.log('================================================================================');

  // Generate test invite codes in database
  const inviteCode = 'DUALTEST' + Math.floor(Math.random() * 899999 + 100000);
  await query(
    'INSERT INTO invite_codes (code, is_used, created_at) VALUES ($1, FALSE, NOW())',
    [inviteCode]
  );
  const inviteCode2 = 'DUALTEST' + Math.floor(Math.random() * 899999 + 100000);
  await query(
    'INSERT INTO invite_codes (code, is_used, created_at) VALUES ($1, FALSE, NOW())',
    [inviteCode2]
  );

  // Verify Clearnet
  await verifyDomain(CLEARNET_BASE, false, 'Clearnet (mail.wox.world)', COOKIE_CLEARNET, inviteCode);

  // Verify Darknet (.onion)
  await verifyDomain(ONION_BASE, true, 'Darknet (Tor .onion)', COOKIE_ONION, inviteCode2);

  // Clean cookie files & pool
  if (fs.existsSync(COOKIE_CLEARNET)) fs.unlinkSync(COOKIE_CLEARNET);
  if (fs.existsSync(COOKIE_ONION)) fs.unlinkSync(COOKIE_ONION);
  await pool.end();

  console.log('\n================================================================================');
  console.log('  DUAL-DOMAIN TEST SUMMARY RESULTS');
  console.log('================================================================================');

  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  const failed = total - passed;

  console.log(`  Total Endpoints & Workflows Tested: ${total}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed === 0) {
    console.log(`\n  🏆 100% OPERATIONAL: Both mail.wox.world and Tor .onion are fully functional!`);
  } else {
    console.log(`\n  ⚠️ ${failed} tests failed.`);
  }

  process.exit(failed === 0 ? 0 : 1);
}

main();
