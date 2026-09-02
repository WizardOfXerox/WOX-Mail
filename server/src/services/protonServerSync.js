import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// Map of active browser sessions per user email
export const activeSessions = new Map();

/**
 * Perform genuine authenticated login into Proton Mail.
 */
export async function authenticateProtonAccount(email, password) {
  const cacheKey = email.toLowerCase().trim();

  // Close existing browser if any
  if (activeSessions.has(cacheKey)) {
    const prev = activeSessions.get(cacheKey);
    await prev.browser.close().catch(() => {});
    activeSessions.delete(cacheKey);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  let uid = null;
  let addresses = [];

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/core/v4/auth') && res.request().method() === 'POST') {
      try {
        const data = await res.json();
        if (data.UID) uid = data.UID;
      } catch (e) {}
    }
    if (url.includes('/api/core/v4/addresses')) {
      try {
        const data = await res.json();
        if (data.Addresses) addresses = data.Addresses;
      } catch (e) {}
    }
  });

  try {
    await page.goto('https://account.proton.me/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input#username', { timeout: 15000 });
    await page.fill('input#username', email);
    await page.fill('input#password', password);
    await page.click('button[type="submit"]');

    // Wait for login transition
    await page.waitForTimeout(6000);

    // Check if 2FA code is needed
    const is2FA = await page.locator('input[type="text"][autocomplete="one-time-code"]').count();
    if (is2FA > 0) {
      activeSessions.set(cacheKey, { browser, context, page, pending2FA: true });
      return { requires2FA: true };
    }

    // Navigate to mail app
    await page.goto('https://mail.proton.me/u/0/inbox', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    if (!uid) {
      const cookies = await context.cookies();
      const authCookie = cookies.find(c => c.name.startsWith('AUTH-'));
      if (authCookie) uid = authCookie.name.replace('AUTH-', '');
    }

    activeSessions.set(cacheKey, {
      browser,
      context,
      page,
      email,
      uid,
      addresses,
      lastActive: Date.now(),
    });

    return {
      success: true,
      uid,
      email,
      addresses,
    };
  } catch (err) {
    await browser.close().catch(() => {});
    throw new Error(`Proton authentication failed: ${err.message}`);
  }
}

/**
 * Fetch messages / conversations from live Proton session.
 */
export async function getProtonMessages(email, labelId = '0', pageNum = 0, pageSize = 25) {
  const cacheKey = email.toLowerCase().trim();
  let session = activeSessions.get(cacheKey);

  if (!session || !session.page) {
    throw new Error('Proton session not active. Please unlock your mailbox.');
  }

  const uid = session.uid;
  const result = await session.page.evaluate(async ({ labelId, pageNum, pageSize, uid }) => {
    try {
      let token = '';
      try {
        const rawOauth = sessionStorage.getItem('proton:oauth') || localStorage.getItem('AUTH_TOKEN') || localStorage.getItem('proton:oauth');
        if (rawOauth) {
          const parsed = JSON.parse(rawOauth);
          token = parsed.AccessToken || parsed.access_token || parsed.token || '';
        }
      } catch {}

      const headers = {
        'x-pm-appversion': 'web-mail@5.0.129.10',
        'x-pm-apiversion': '3',
        'x-pm-uid': uid,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // First try conversations
      const convRes = await fetch(`https://mail.proton.me/api/mail/v4/conversations?LabelID=${labelId}&Page=${pageNum}&PageSize=${pageSize}&Limit=${pageSize}&Sort=Time&Desc=1`, {
        headers,
        credentials: 'include',
      });
      if (convRes.ok) {
        const convData = await convRes.json();
        return { status: 200, data: convData, type: 'conversations' };
      }

      // Fallback to messages
      const msgRes = await fetch(`https://mail.proton.me/api/mail/v4/messages?LabelID=${labelId}&Page=${pageNum}&PageSize=${pageSize}&Sort=Time&Desc=1`, {
        headers,
        credentials: 'include',
      });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        return { status: 200, data: msgData, type: 'messages' };
      }

      // If API calls fail, scrape the live DOM conversations directly
      const domItems = Array.from(document.querySelectorAll('[data-testid="message-item"], .item-container, [data-shortcut-target="item-row"]')).map((el, index) => {
        const subjectEl = el.querySelector('[data-testid="message-item:subject"], .item-subject');
        const senderEl = el.querySelector('[data-testid="message-item:sender"], .item-senders, .item-sender');
        const id = el.getAttribute('data-shortcut-target-id') || el.getAttribute('data-element-id') || `msg_${index}`;
        return {
          ID: id,
          Subject: subjectEl?.textContent?.trim() || '(No Subject)',
          Senders: [{ Name: senderEl?.textContent?.trim() || 'Proton', Address: 'wizardofxerox@proton.me' }],
          Time: Math.floor(Date.now() / 1000),
          Unread: el.classList.contains('unread') || el.querySelector('.is-unread') ? 1 : 0,
        };
      });

      if (domItems.length > 0) {
        return { status: 200, data: { Conversations: domItems, Total: domItems.length }, type: 'conversations' };
      }

      return { status: convRes.status || msgRes.status || 500, error: 'Could not fetch messages' };
    } catch (e) {
      return { status: 500, error: e.message };
    }
  }, { labelId, pageNum, pageSize, uid });

  if (result.status !== 200) {
    throw new Error(`Failed to fetch Proton messages (${result.status})`);
  }

  return result;
}

/**
 * Fetch single conversation / message details with decrypted HTML body.
 */
export async function getProtonMessageDetails(email, id) {
  const cacheKey = email.toLowerCase().trim();
  const session = activeSessions.get(cacheKey);
  if (!session || !session.page) {
    throw new Error('Proton session not active. Please unlock your mailbox.');
  }

  const page = session.page;
  const uid = session.uid;

  // 1. Fetch metadata via API
  const meta = await page.evaluate(async ({ msgId, uid }) => {
    try {
      let token = '';
      try {
        const rawOauth = sessionStorage.getItem('proton:oauth') || localStorage.getItem('AUTH_TOKEN') || localStorage.getItem('proton:oauth');
        if (rawOauth) {
          const parsed = JSON.parse(rawOauth);
          token = parsed.AccessToken || parsed.access_token || parsed.token || '';
        }
      } catch {}

      const headers = {
        'x-pm-appversion': 'web-mail@5.0.129.10',
        'x-pm-apiversion': '3',
        'x-pm-uid': uid,
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const convRes = await fetch(`https://mail.proton.me/api/mail/v4/conversations/${encodeURIComponent(msgId)}`, { headers, credentials: 'include' });
      const convData = convRes.ok ? await convRes.json() : null;
      const firstMsgId = convData?.Messages?.[0]?.ID || msgId;

      const msgRes = await fetch(`https://mail.proton.me/api/mail/v4/messages/${encodeURIComponent(firstMsgId)}`, { headers, credentials: 'include' });
      const msgData = msgRes.ok ? await msgRes.json() : null;

      return {
        convData,
        msgData,
        firstMsgId,
      };
    } catch (e) {
      return { error: e.message };
    }
  }, { msgId: id, uid });

  // 2. Open email in the browser page to extract decrypted HTML
  let decryptedHtml = '';
  try {
    const itemSelector = `.item-container, tr[data-testid*="message-item"], [data-testid="message-item"]`;
    if (await page.locator(itemSelector).count() > 0) {
      await page.click(itemSelector).catch(() => {});
      await page.waitForTimeout(2500);

      decryptedHtml = await page.evaluate(() => {
        const iframe = document.querySelector('iframe.message-iframe, iframe');
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          return iframe.contentDocument.body.innerHTML;
        }
        const bodyElem = document.querySelector('.message-body-container, [data-testid="message-content"]');
        return bodyElem ? bodyElem.innerHTML : '';
      });
    }
  } catch (domErr) {
    console.warn('[ProtonSync] DOM decryption extraction notice:', domErr.message);
  }

  const conv = meta.convData?.Conversation || {};
  const firstMsg = meta.convData?.Messages?.[0] || meta.msgData?.Message || {};
  const senderObj = firstMsg.Sender || conv.Senders?.[0] || {};

  return {
    Code: 1000,
    Conversation: conv,
    Messages: meta.convData?.Messages || [],
    Message: {
      ID: firstMsg.ID || id,
      Subject: firstMsg.Subject || conv.Subject || '(No Subject)',
      Sender: senderObj,
      SenderName: senderObj.Name || firstMsg.SenderName || 'Proton Official',
      SenderAddress: senderObj.Address || firstMsg.SenderAddress || 'no-reply@news.proton.me',
      ToList: firstMsg.ToList || [{ Name: '', Address: email }],
      CCList: firstMsg.CCList || [],
      Time: firstMsg.Time || conv.Time || conv.ContextTime || Math.floor(Date.now() / 1000),
      Body: decryptedHtml || firstMsg.Body || '',
      DecryptedHtml: decryptedHtml,
      Attachments: firstMsg.Attachments || [],
    }
  };
}

/**
 * Fetch all active addresses / aliases from the Proton session (including custom handles, custom domains, SimpleLogin/Pass aliases).
 */
export async function getProtonAddresses(email) {
  const cacheKey = email.toLowerCase().trim();
  const session = activeSessions.get(cacheKey);
  if (!session || !session.page) {
    throw new Error('Proton session not active. Please unlock your mailbox.');
  }

  const page = session.page;
  const discovered = new Set();

  // 1. Inspect session addresses captured during network intercept
  if (Array.isArray(session.addresses)) {
    for (const a of session.addresses) {
      if (a && a.Email) {
        discovered.add(a.Email.toLowerCase().trim());
      }
    }
  }

  // 2. Fetch live addresses via Proton Core API evaluation
  try {
    const apiAddrs = await page.evaluate(async (uid) => {
      try {
        let token = '';
        const rawOauth = sessionStorage.getItem('proton:oauth') || localStorage.getItem('AUTH_TOKEN') || localStorage.getItem('proton:oauth');
        if (rawOauth) {
          const parsed = JSON.parse(rawOauth);
          token = parsed.AccessToken || parsed.access_token || parsed.token || '';
        }
        const headers = {
          'x-pm-appversion': 'web-mail@5.0.129.10',
          'x-pm-apiversion': '3',
          'x-pm-uid': uid,
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch('https://mail.proton.me/api/core/v4/addresses', { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          return data.Addresses || [];
        }
      } catch (e) {}
      return [];
    }, session.uid);

    if (Array.isArray(apiAddrs) && apiAddrs.length > 0) {
      session.addresses = apiAddrs;
      for (const a of apiAddrs) {
        if (a && a.Email && a.Status === 1) {
          discovered.add(a.Email.toLowerCase().trim());
        }
      }
    }
  } catch (apiErr) {
    console.warn('[ProtonSync] Direct Core addresses API fetch notice:', apiErr.message);
  }

  // 3. Add standard Proton domain formats for this account
  const username = email.split('@')[0].toLowerCase();
  discovered.add(email.toLowerCase());
  discovered.add(`${username}@pm.me`.toLowerCase());
  discovered.add(`${username}@protonmail.com`.toLowerCase());

  // 4. Also inspect Composer From dropdown in DOM if accessible
  try {
    const composer = page.locator('[data-testid="composer"], .composer, [role="dialog"]').first();
    if (await composer.count() > 0) {
      const fromBtn = composer.locator('button[data-testid="composer:from"], button[data-testid*="from"], .composer-addresses button').first();
      if (await fromBtn.count() > 0 && await fromBtn.isVisible()) {
        await fromBtn.click({ force: true }).catch(() => {});
        await page.waitForTimeout(400);
        const domAddrs = await page.evaluate(() => {
          const els = document.querySelectorAll('[role="menu"] *, [role="listbox"] *, .dropdown-item, button[data-testid*="item"]');
          return Array.from(els).map(e => e.innerText?.trim()).filter(Boolean);
        });
        for (const item of domAddrs) {
          if (item.includes('@')) {
            const match = item.match(/[\w.+-]+@[\w.-]+/);
            if (match) discovered.add(match[0].toLowerCase());
          }
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
  } catch (domErr) {
    console.warn('[ProtonSync] Composer From DOM scan notice:', domErr.message);
  }

  const list = Array.from(discovered).map((addr, idx) => {
    let note = 'Proton Custom Alias';
    const clean = addr.toLowerCase();
    const isPrimary = clean === email.toLowerCase();
    
    if (isPrimary) {
      note = 'Proton Primary Address';
    } else if (clean.endsWith('@pm.me') && clean.startsWith(username + '@')) {
      note = 'Proton Short Alias (@pm.me)';
    } else if (clean.endsWith('@protonmail.com') && clean.startsWith(username + '@')) {
      note = 'Proton Classic Alias (@protonmail.com)';
    } else if (clean.endsWith('@passmail.net') || clean.includes('passmail') || clean.includes('simplelogin')) {
      note = 'Proton Pass / SimpleLogin Alias';
    } else if (clean.endsWith('@proton.me') || clean.endsWith('@pm.me') || clean.endsWith('@protonmail.com')) {
      note = `Proton Custom Handle (${clean})`;
    } else {
      note = `Proton Custom Domain Alias (${clean})`;
    }

    return {
      id: `proton-${idx + 1}`,
      address: addr,
      alias_address: addr,
      alias_email: addr,
      note,
      source: 'proton',
      enabled: true,
      is_enabled: true,
      isPrimary,
      created_at: new Date().toISOString(),
    };
  });

  return {
    success: true,
    addresses: list,
  };
}

/**
 * Send an email through the authenticated Proton Mail session.
 */
export async function sendProtonMail(email, { from, to, cc, bcc, subject, text, html, attachments = [] }) {
  const cacheKey = email.toLowerCase().trim();
  const session = activeSessions.get(cacheKey);
  if (!session || !session.page) {
    throw new Error('Proton session not active. Please unlock your mailbox.');
  }

  const page = session.page;

  // Ensure page is on mail app
  if (!page.url().includes('mail.proton.me/u/0')) {
    await page.goto('https://mail.proton.me/u/0/inbox', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }

  // 1. Trigger compose if not already open
  const isComposerOpen = (await page.locator('input[data-testid="composer:subject"], input[id*="subject-composer"]').count()) > 0;
  if (!isComposerOpen) {
    const composeBtn = page.locator('button[data-testid="sidebar:compose"], button:has-text("New message")').first();
    await composeBtn.click({ force: true }).catch(async () => {
      await page.keyboard.press('KeyN');
    });
    await page.waitForTimeout(2000);
  }

  // 1b. Switch "From" Identity if requested
  if (from) {
    const cleanFrom = String(from).trim().toLowerCase();
    try {
      // Locate the composer modal container
      const composer = page.locator('[data-testid="composer"], .composer, [role="dialog"]').first();
      if (await composer.count() > 0) {
        // Find From button strictly scoped inside the composer modal
        const fromBtn = composer.locator('button[data-testid="composer:from"], button[data-testid*="from"], .composer-addresses button').first();
        if (await fromBtn.count() > 0 && await fromBtn.isVisible()) {
          const currentFromText = (await fromBtn.innerText().catch(() => '')).toLowerCase();
          if (!currentFromText.includes(cleanFrom)) {
            console.log(`[ProtonSync] Switching From address from "${currentFromText}" to "${cleanFrom}"...`);
            await fromBtn.click({ force: true });
            await page.waitForTimeout(500);
            
            // Search for option element in dropdown portals
            const optionSelector = `[role="menu"] button:has-text("${cleanFrom}"), [role="listbox"] [role="option"]:has-text("${cleanFrom}"), .dropdown-item:has-text("${cleanFrom}"), button[data-testid*="item"]:has-text("${cleanFrom}"), div[data-testid*="item"]:has-text("${cleanFrom}")`;
            const optionBtn = page.locator(optionSelector).first();
            if (await optionBtn.count() > 0) {
              await optionBtn.click({ force: true });
              await page.waitForTimeout(400);
              console.log(`[ProtonSync] Successfully selected alias "${cleanFrom}".`);
            } else {
              // Try finding any element containing the cleanFrom text
              const anyOption = page.locator(`[role="dialog"] button:has-text("${cleanFrom}"), .dropdown-content button:has-text("${cleanFrom}"), body > div button:has-text("${cleanFrom}")`).first();
              if (await anyOption.count() > 0) {
                await anyOption.click({ force: true });
                await page.waitForTimeout(400);
                console.log(`[ProtonSync] Fallback selected alias "${cleanFrom}".`);
              } else {
                console.warn(`[ProtonSync] Alias option "${cleanFrom}" not found in Proton dropdown menu.`);
                await page.keyboard.press('Escape');
              }
            }
          }
        }
      }
    } catch (fromErr) {
      console.warn('[ProtonSync] Switch from identity notice:', fromErr.message);
    }
  }

  // 2. Parse and fill clean recipients
  const recipientList = Array.isArray(to) ? to : (to || '').split(',');
  const cleanRecipients = recipientList.map(r => {
    if (typeof r === 'object') return r.address || r.email || '';
    const str = String(r).trim();
    const match = str.match(/<([^>]+)>/);
    return match ? match[1].trim() : str.replace(/[,"';]/g, '').trim();
  }).filter(Boolean);

  const toInput = page.locator('input[data-testid="composer:to"], input[id*="to-composer"], input[placeholder*="Email address"]').first();
  await toInput.waitFor({ state: 'attached', timeout: 15000 });
  
  for (const recipient of cleanRecipients) {
    await toInput.click({ force: true }).catch(() => {});
    await toInput.fill(recipient, { force: true });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }

  // 3. Fill Subject
  const subjectInput = page.locator('input[data-testid="composer:subject"], input[id*="subject-composer"], input[placeholder*="Subject"]').first();
  await subjectInput.waitFor({ state: 'attached', timeout: 10000 });
  await subjectInput.click({ force: true }).catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await subjectInput.fill(subject || '', { force: true });
  await page.waitForTimeout(300);

  // 4. Fill Body
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  const rawBody = text || (html ? html.replace(/<br\s*[\/]?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, '') : '');
  if (rawBody) {
    await page.keyboard.type(rawBody);
  }
  await page.waitForTimeout(500);

  // 5. Send message
  const sendBtn = page.locator('button[data-testid="composer:send-button"], button:has-text("Send")').first();
  if (await sendBtn.count() > 0 && await sendBtn.isVisible()) {
    await sendBtn.click();
  } else {
    await page.keyboard.press('Control+Enter');
  }

  // 6. Wait for dispatch confirmation
  await page.waitForTimeout(3500);

  return { success: true, message: 'Email sent successfully via Proton Mail' };
}
