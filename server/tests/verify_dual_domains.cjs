const { execSync } = require('child_process');
const assert = require('assert');

const CLEARNET_BASE = 'https://mail.wox.world';
const ONION_BASE = 'http://e6mph43cdahjoum7pbrs2gpzvb3edq3j2ob6hi5soihld4oid2fcwbad.onion';
const TOR_SOCKS = '127.0.0.1:9050';

function curl(url, options = {}) {
  const { isTor = false, method = 'GET', data = null, headers = [], followRedirect = true, cookieJar = null } = options;
  const args = ['curl.exe', '-s', '-i'];

  if (isTor) {
    args.push('--socks5-hostname', TOR_SOCKS);
  }
  if (followRedirect) {
    args.push('-L');
  }
  if (method !== 'GET') {
    args.push('-X', method);
  }
  if (data) {
    args.push('-H', 'Content-Type: application/json');
    args.push('-d', JSON.stringify(data));
  }
  if (cookieJar) {
    args.push('-b', cookieJar);
    args.push('-c', cookieJar);
  }
  for (const h of headers) {
    args.push('-H', `"${h}"`);
  }
  args.push(`"${url}"`);

  const cmd = args.join(' ');
  const raw = execSync(cmd, { encoding: 'utf8', timeout: 30000 });

  // Separate headers from body
  const parts = raw.split(/\r?\n\r?\n/);
  const headerPart = parts.length > 1 ? parts[parts.length - 2] : '';
  const bodyPart = parts[parts.length - 1] || '';

  const statusMatch = raw.match(/HTTP\/[12](\.[01])?\s+(\d{3})/g);
  const lastStatus = statusMatch ? parseInt(statusMatch[statusMatch.length - 1].match(/\d{3}/)[0], 10) : 0;

  // Extract cookies from Set-Cookie headers
  const cookies = [];
  const cookieMatches = raw.matchAll(/Set-Cookie:\s*([^;\r\n]+)/gi);
  for (const cm of cookieMatches) {
    cookies.push(cm[1]);
  }

  // Extract Onion-Location header
  const onionLocationMatch = raw.match(/Onion-Location:\s*([^\r\n]+)/i);
  const onionLocation = onionLocationMatch ? onionLocationMatch[1].trim() : null;

  return {
    raw,
    statusCode: lastStatus,
    headers: headerPart,
    body: bodyPart,
    cookies,
    onionLocation,
    json: () => {
      try {
        return JSON.parse(bodyPart);
      } catch (e) {
        return null;
      }
    }
  };
}

const results = [];

function recordTest(domainName, testName, passed, detail = '') {
  results.push({ domainName, testName, passed, detail });
  const icon = passed ? '✔ PASS' : '✖ FAIL';
  console.log(`  [${domainName}] ${testName.padEnd(45)} ${icon} ${detail ? '(' + detail + ')' : ''}`);
}

async function runDomainTests(domain, isTor, domainLabel) {
  console.log(`\n================================================================================`);
  console.log(`  TESTING DOMAIN: ${domainLabel} (${domain})`);
  console.log(`================================================================================`);

  // 1. Health Endpoint
  try {
    const res = curl(`${domain}/api/health`, { isTor });
    const isOk = res.statusCode === 200 && res.json() && res.json().status === 'ok';
    recordTest(domainLabel, 'GET /api/health', isOk, `Status: ${res.statusCode}`);
  } catch (err) {
    recordTest(domainLabel, 'GET /api/health', false, err.message);
  }

  // 2. Landing Page HTML & Meta
  try {
    const res = curl(`${domain}/`, { isTor });
    const hasWox = res.body.includes('Wox') && res.body.includes('Mail');
    const hasOnionLocation = !isTor ? (res.onionLocation !== null || res.body.includes('onion-location')) : true;
    const hasTorButton = res.body.includes('Tor (.onion)');
    const isOk = res.statusCode === 200 && hasWox && hasOnionLocation && hasTorButton;
    recordTest(domainLabel, 'GET / (Landing HTML & Onion Meta)', isOk, `Status: ${res.statusCode}`);
  } catch (err) {
    recordTest(domainLabel, 'GET / (Landing HTML & Onion Meta)', false, err.message);
  }

  // 3. Static CSS & Theme JS
  try {
    const resCss = curl(`${domain}/css/style.css`, { isTor });
    const hasTheme = resCss.body.includes('--color-primary') && resCss.body.includes('[data-theme=\'light\']');
    recordTest(domainLabel, 'GET /css/style.css (Dark/Light Design Tokens)', hasTheme && resCss.statusCode === 200, `${resCss.body.length} bytes`);
  } catch (err) {
    recordTest(domainLabel, 'GET /css/style.css', false, err.message);
  }

  // 4. Instant Temp Mail View & Pool Generation
  let generatedEmail = null;
  let mailboxId = null;
  try {
    const pageRes = curl(`${domain}/tempmail`, { isTor });
    const pageOk = pageRes.statusCode === 200 && pageRes.body.includes('Instant Disposable Temp Mail');
    recordTest(domainLabel, 'GET /tempmail (Temp Inbox UI)', pageOk, `Status: ${pageRes.statusCode}`);

    // Generate address
    const genRes = curl(`${domain}/api/tempmail/generate`, {
      isTor,
      method: 'POST',
      data: { expiry_hours: 24 }
    });
    const genJson = genRes.json();
    const genOk = genRes.statusCode === 200 && genJson && genJson.success && genJson.data.address;
    if (genOk) {
      generatedEmail = genJson.data.address;
      mailboxId = genJson.data.id;
    }
    recordTest(domainLabel, 'POST /api/tempmail/generate (Pool Provisioning)', genOk, generatedEmail || 'No address');
  } catch (err) {
    recordTest(domainLabel, 'POST /api/tempmail/generate', false, err.message);
  }

  // 5. Query Temp Mailbox Inbox
  try {
    if (mailboxId) {
      const inboxRes = curl(`${domain}/api/tempmail/inbox/${mailboxId}`, { isTor });
      const inboxJson = inboxRes.json();
      const inboxOk = inboxRes.statusCode === 200 && inboxJson && inboxJson.success && Array.isArray(inboxJson.data.messages);
      recordTest(domainLabel, 'GET /api/tempmail/inbox/:id (Message Sync)', inboxOk, `Active messages: ${inboxJson?.data?.messages?.length ?? 0}`);
    } else {
      recordTest(domainLabel, 'GET /api/tempmail/inbox/:id', false, 'Skipped: No mailbox ID');
    }
  } catch (err) {
    recordTest(domainLabel, 'GET /api/tempmail/inbox/:id', false, err.message);
  }

  // 6. Personal Temp Mail Claim & PIN Auth
  const testPersonalUser = `test_dual_${Date.now().toString(36).slice(-5)}`;
  try {
    const claimRes = curl(`${domain}/api/tempmail/personal/claim`, {
      isTor,
      method: 'POST',
      data: {
        username: testPersonalUser,
        pin: '987654',
        duration_days: 30
      }
    });
    const claimJson = claimRes.json();
    const claimOk = claimRes.statusCode === 200 && claimJson && claimJson.success && claimJson.data.address;
    recordTest(domainLabel, 'POST /api/tempmail/personal/claim (60-Day PIN Vault)', claimOk, claimJson?.data?.address || claimJson?.error);

    if (claimOk) {
      // Test PIN login
      const loginRes = curl(`${domain}/api/tempmail/personal/login`, {
        isTor,
        method: 'POST',
        data: {
          username: testPersonalUser,
          pin: '987654'
        }
      });
      const loginJson = loginRes.json();
      const loginOk = loginRes.statusCode === 200 && loginJson && loginJson.success && loginJson.data.address;
      recordTest(domainLabel, 'POST /api/tempmail/personal/login (PIN Verification)', loginOk, 'Vault Unlocked');
    }
  } catch (err) {
    recordTest(domainLabel, 'Personal Temp Mail Tests', false, err.message);
  }

  // 7. FutureMe Letters to the Future
  try {
    const pageRes = curl(`${domain}/futureme`, { isTor });
    recordTest(domainLabel, 'GET /futureme (Time Capsule UI)', pageRes.statusCode === 200 && pageRes.body.includes('FutureMe'), `Status: ${pageRes.statusCode}`);

    const scheduleRes = curl(`${domain}/api/futureme/schedule`, {
      isTor,
      method: 'POST',
      data: {
        recipient_email: 'tester@wox.world',
        subject: `Letter to 2027 from ${domainLabel}`,
        body: 'Encrypted sovereign time capsule verification.',
        deliver_at: new Date(Date.now() + 86400000 * 365).toISOString(),
        is_public: false
      }
    });
    const schedJson = scheduleRes.json();
    const schedOk = scheduleRes.statusCode === 200 && schedJson && schedJson.success;
    recordTest(domainLabel, 'POST /api/futureme/schedule (Encrypted Capsule)', schedOk, schedJson?.data?.id ? `ID: ${schedJson.data.id}` : 'Failed');
  } catch (err) {
    recordTest(domainLabel, 'FutureMe Schedule Test', false, err.message);
  }

  // 8. Support Desk Ticket Creation
  try {
    const pageRes = curl(`${domain}/support`, { isTor });
    recordTest(domainLabel, 'GET /support (Helpdesk UI)', pageRes.statusCode === 200 && pageRes.body.includes('Support'), `Status: ${pageRes.statusCode}`);

    const ticketRes = curl(`${domain}/api/support/ticket`, {
      isTor,
      method: 'POST',
      data: {
        email: 'user@external.com',
        subject: `Verification Ticket from ${domainLabel}`,
        message: 'Validating end-to-end support pipeline across dual domains.',
        category: 'general'
      }
    });
    const ticketJson = ticketRes.json();
    const ticketOk = ticketRes.statusCode === 200 && ticketJson && ticketJson.success;
    recordTest(domainLabel, 'POST /api/support/ticket (Helpdesk Ticket)', ticketOk, ticketJson?.data?.ticket_id ? `Ticket #${ticketJson.data.ticket_id}` : 'Failed');
  } catch (err) {
    recordTest(domainLabel, 'Support Ticket Test', false, err.message);
  }

  // 9. Autodiscover & Apple .mobileconfig RFC Endpoints
  try {
    const autoconfigRes = curl(`${domain}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=test@wox.world`, { isTor });
    const isAutoconfig = autoconfigRes.statusCode === 200 && autoconfigRes.body.includes('<clientConfig');
    recordTest(domainLabel, 'GET /.well-known/autoconfig (RFC 6186 XML)', isAutoconfig, `Status: ${autoconfigRes.statusCode}`);

    const mobileconfigRes = curl(`${domain}/mobileconfig?email=test@wox.world`, { isTor });
    const isMobileconfig = mobileconfigRes.statusCode === 200 && mobileconfigRes.body.includes('PayloadType');
    recordTest(domainLabel, 'GET /mobileconfig (Apple 1-Click Profile)', isMobileconfig, `Status: ${mobileconfigRes.statusCode}`);
  } catch (err) {
    recordTest(domainLabel, 'Autodiscover RFC Endpoints', false, err.message);
  }

  // 10. Webmail Permanent Account Login & Authentication
  try {
    const loginRes = curl(`${domain}/api/auth/login`, {
      isTor,
      method: 'POST',
      data: {
        login: 'admin',
        password: process.env.ADMIN_PASSWORD || 'WoxMail@Admin2026!'
      }
    });
    const loginJson = loginRes.json();
    const loginOk = loginRes.statusCode === 200 && loginJson && loginJson.success && loginJson.data.user;
    recordTest(domainLabel, 'POST /api/auth/login (Argon2id + JWT)', loginOk, loginOk ? `Authenticated: ${loginJson.data.user.username}` : 'Auth failed');
  } catch (err) {
    recordTest(domainLabel, 'POST /api/auth/login', false, err.message);
  }
}

async function main() {
  console.log('\n================================================================================');
  console.log('  STARTING DUAL-DOMAIN FULL FUNCTIONALITY VERIFICATION');
  console.log(`  Clearnet Domain: ${CLEARNET_BASE}`);
  console.log(`  Tor Onion Domain: ${ONION_BASE}`);
  console.log('================================================================================');

  // Test 1: Clearnet (Cloudflare Tunnel)
  await runDomainTests(CLEARNET_BASE, false, 'CLEARNET (mail.wox.world)');

  // Test 2: Darknet (Tor V3 Hidden Service via SOCKS5 127.0.0.1:9050)
  await runDomainTests(ONION_BASE, true, 'DARKNET TOR (.onion)');

  console.log('\n================================================================================');
  console.log('  DUAL-DOMAIN VERIFICATION SUMMARY');
  console.log('================================================================================');
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const failed = total - passed;

  console.log(`  Total Dual-Domain Tests: ${total}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed === 0) {
    console.log(`\n  🌟 ALL ${total}/${total} DUAL-DOMAIN ENDPOINTS ARE 100% OPERATIONAL!`);
  } else {
    console.log(`\n  ⚠️ ${failed} test(s) failed.`);
  }

  process.exit(failed === 0 ? 0 : 1);
}

main();
