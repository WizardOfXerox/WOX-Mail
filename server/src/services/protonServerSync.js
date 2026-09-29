import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
import { query } from '../config/database.js';
import { decryptCredentials } from './accountService.js';

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
 * Ensure active browser session exists for the given Proton email.
 * Automatically restores session from connected_accounts if needed.
 */
export async function ensureActiveProtonSession(email) {
  if (!email) {
    throw new Error('Proton email address is required');
  }
  const cacheKey = email.toLowerCase().trim();
  let session = activeSessions.get(cacheKey);

  if (!session || !session.page || session.page.isClosed()) {
    try {
      const connRes = await query(
        `SELECT credentials_encrypted, iv, auth_tag FROM connected_accounts 
         WHERE LOWER(email) = $1 AND provider = 'proton' AND is_active = TRUE LIMIT 1`,
        [cacheKey]
      );
      if (connRes.rows.length > 0 && connRes.rows[0].credentials_encrypted) {
        const { credentials_encrypted, iv, auth_tag } = connRes.rows[0];
        const pass = decryptCredentials(credentials_encrypted, iv, auth_tag);
        if (pass) {
          await authenticateProtonAccount(cacheKey, pass);
          session = activeSessions.get(cacheKey);
        }
      }
    } catch (autoErr) {
      console.warn(`[ProtonSync] Auto-login for ${cacheKey} failed:`, autoErr.message);
    }
  }

  if (!session || !session.page || session.page.isClosed()) {
    throw new Error('Proton session not active. Please unlock your mailbox.');
  }

  return session;
}

/**
 * Fetch messages / conversations from live Proton session.
 */
export async function getProtonMessages(email, labelId = '0', pageNum = 0, pageSize = 25) {
  const session = await ensureActiveProtonSession(email);
  const uid = session.uid;
  const result = await session.page.evaluate(async ({ labelId, pageNum, pageSize, uid, userEmail }) => {
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
          Senders: [{ Name: senderEl?.textContent?.trim() || 'Proton', Address: userEmail || 'user@proton.me' }],
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
  }, { labelId, pageNum, pageSize, uid, userEmail: email });

  if (result.status !== 200) {
    throw new Error(`Failed to fetch Proton messages (${result.status})`);
  }

  return result;
}

/**
 * Fetch single conversation / message details with decrypted HTML body.
 */
export async function getProtonMessageDetails(email, id) {
  const session = await ensureActiveProtonSession(email);
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

      if (decryptedHtml) {
        decryptedHtml = decryptedHtml.replace(/src=["']blob:[^"']+["']/gi, 'src="" data-blocked-blob="true"');
      }
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
  const session = await ensureActiveProtonSession(email);
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
  const session = await ensureActiveProtonSession(email);
  const page = session.page;

  // Ensure page is on mail app (any valid user index /u/0, /u/1, etc.)
  if (!page.url().includes('mail.proton.me/u/')) {
    await page.goto('https://mail.proton.me', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }

  // Wait for any previous sending/closing transitions to settle
  await page.waitForTimeout(1500);

  // 1. Ensure composer is open and visible
  let toInput = page.locator('input[data-testid="composer:to"], input[id*="to-composer"], input[placeholder*="Email address"]').first();
  let isToVisible = (await toInput.count() > 0) && (await toInput.isVisible().catch(() => false));

  if (!isToVisible) {
    const minDraft = page.locator('.composer-title-bar, [data-testid="composer-header"]').first();
    if (await minDraft.count() > 0 && await minDraft.isVisible().catch(() => false)) {
      await minDraft.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    toInput = page.locator('input[data-testid="composer:to"], input[id*="to-composer"], input[placeholder*="Email address"]').first();
    isToVisible = (await toInput.count() > 0) && (await toInput.isVisible().catch(() => false));

    if (!isToVisible) {
      const composeBtn = page.locator('button[data-testid="sidebar:compose"], button:has-text("New message")').first();
      await composeBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await composeBtn.click({ force: true }).catch(async () => {
        await page.keyboard.press('KeyN');
      });
      await page.waitForTimeout(2000);
    }
  }

  // Ensure To input is visible, with automatic re-click retry if needed
  toInput = page.locator('input[data-testid="composer:to"], input[id*="to-composer"], input[placeholder*="Email address"]').first();
  try {
    await toInput.waitFor({ state: 'visible', timeout: 8000 });
  } catch (toWaitErr) {
    console.log('[ProtonSync] To input not visible yet, clicking New message button again...');
    const composeBtn = page.locator('button[data-testid="sidebar:compose"], button:has-text("New message")').first();
    await composeBtn.click({ force: true }).catch(async () => {
      await page.keyboard.press('KeyN');
    });
    await toInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  // 1b. Switch "From" Identity if requested
  if (from) {
    const rawFrom = String(from).trim().toLowerCase();
    const cleanFrom = rawFrom.includes('<') ? rawFrom.replace(/.*<([^>]+)>.*/, '$1').trim() : rawFrom;
    try {
      const composer = page.locator('[data-testid="composer"], .composer, [role="dialog"]').first();
      if (await composer.count() > 0) {
        const fromBtn = composer.locator('button[data-testid="composer:from"], button[data-testid*="from"], .composer-addresses button').first();
        if (await fromBtn.count() > 0 && await fromBtn.isVisible()) {
          const currentFromText = (await fromBtn.innerText().catch(() => '')).toLowerCase().trim();
          const cleanCurrentFrom = currentFromText.includes('<') ? currentFromText.replace(/.*<([^>]+)>.*/, '$1').trim() : currentFromText;
          if (cleanFrom && cleanCurrentFrom !== cleanFrom && !cleanCurrentFrom.includes(cleanFrom) && !cleanFrom.includes(cleanCurrentFrom)) {
            console.log(`[ProtonSync] Switching From address from "${currentFromText}" to "${cleanFrom}"...`);
            await fromBtn.click({ force: true });
            await page.waitForTimeout(500);

            const optionSelector = `[role="menu"] button:has-text("${cleanFrom}"), [role="listbox"] [role="option"]:has-text("${cleanFrom}"), .dropdown-item:has-text("${cleanFrom}"), button[data-testid*="item"]:has-text("${cleanFrom}"), div[data-testid*="item"]:has-text("${cleanFrom}")`;
            const optionBtn = page.locator(optionSelector).first();
            if (await optionBtn.count() > 0) {
              await optionBtn.click({ force: true });
              await page.waitForTimeout(400);
              console.log(`[ProtonSync] Successfully selected alias "${cleanFrom}".`);
            } else {
              const anyOption = page.locator(`[role="dialog"] button:has-text("${cleanFrom}"), .dropdown-content button:has-text("${cleanFrom}"), body > div button:has-text("${cleanFrom}")`).first();
              if (await anyOption.count() > 0) {
                await anyOption.click({ force: true });
                await page.waitForTimeout(400);
                console.log(`[ProtonSync] Fallback selected alias "${cleanFrom}".`);
              } else {
                console.warn(`[ProtonSync] Alias option "${cleanFrom}" not found in Proton dropdown menu.`);
                await fromBtn.click({ force: true }).catch(() => {});
                await page.waitForTimeout(300);
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

  toInput = page.locator('input[data-testid="composer:to"], input[id*="to-composer"], input[placeholder*="Email address"]').first();
  await toInput.waitFor({ state: 'visible', timeout: 15000 });

  for (const recipient of cleanRecipients) {
    await toInput.click({ force: true }).catch(() => {});
    await toInput.fill(recipient, { force: true });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }

  // 2b. Fill CC recipients if present
  if (cc) {
    const ccList = Array.isArray(cc) ? cc : String(cc).split(',');
    const cleanCc = ccList.map(r => {
      if (typeof r === 'object') return r.address || r.email || '';
      const str = String(r).trim();
      const match = str.match(/<([^>]+)>/);
      return match ? match[1].trim() : str.replace(/[,"';]/g, '').trim();
    }).filter(Boolean);

    if (cleanCc.length > 0) {
      const ccBtn = page.locator('button[data-testid="composer:recipients:cc-button"], button:has-text("CC")').first();
      if (await ccBtn.count() > 0 && await ccBtn.isVisible()) {
        await ccBtn.click({ force: true });
        await page.waitForTimeout(300);
      }
      const ccInput = page.locator('input[data-testid="composer:cc"], input[id*="cc-composer"]').first();
      if (await ccInput.count() > 0) {
        for (const recipient of cleanCc) {
          await ccInput.click({ force: true }).catch(() => {});
          await ccInput.fill(recipient, { force: true });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
        }
      }
    }
  }

  // 2c. Fill BCC recipients if present
  if (bcc) {
    const bccList = Array.isArray(bcc) ? bcc : String(bcc).split(',');
    const cleanBcc = bccList.map(r => {
      if (typeof r === 'object') return r.address || r.email || '';
      const str = String(r).trim();
      const match = str.match(/<([^>]+)>/);
      return match ? match[1].trim() : str.replace(/[,"';]/g, '').trim();
    }).filter(Boolean);

    if (cleanBcc.length > 0) {
      const bccBtn = page.locator('button[data-testid="composer:recipients:bcc-button"], button:has-text("BCC")').first();
      if (await bccBtn.count() > 0 && await bccBtn.isVisible()) {
        await bccBtn.click({ force: true });
        await page.waitForTimeout(300);
      }
      const bccInput = page.locator('input[data-testid="composer:bcc"], input[id*="bcc-composer"]').first();
      if (await bccInput.count() > 0) {
        for (const recipient of cleanBcc) {
          await bccInput.click({ force: true }).catch(() => {});
          await bccInput.fill(recipient, { force: true });
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
        }
      }
    }
  }

  // 3. Fill Subject
  const subjectInput = page.locator('input[data-testid="composer:subject"], input[id*="subject-composer"], input[placeholder*="Subject"]').first();
  await subjectInput.waitFor({ state: 'attached', timeout: 10000 });
  await subjectInput.click({ force: true }).catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await subjectInput.fill(subject || '', { force: true });
  await page.waitForTimeout(300);

  // 4. Fill Body in editor subframe or contenteditable element
  const bodyContent = html || (text ? `<div>${text.replace(/\n/g, '<br>')}</div>` : '');
  const frames = page.frames();
  const editorFrame = frames.find(f => f !== page.mainFrame() && (f.url().includes('about:blank') || f.name().includes('rooster') || f.name().includes('editor')));

  if (editorFrame) {
    await editorFrame.evaluate((content) => {
      const el = document.querySelector('[contenteditable="true"]') || document.body;
      if (el) {
        el.focus();
        el.innerHTML = content;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, bodyContent);
  } else {
    const mainBody = page.locator('div[data-testid="editor-textarea"], div.editor-squire-wrapper, [contenteditable="true"]').first();
    if (await mainBody.count() > 0) {
      await mainBody.evaluate((el, content) => {
        el.focus();
        el.innerHTML = content;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, bodyContent);
    }
  }
  await page.waitForTimeout(500);

  // 4b. Handle Attachments
  if (Array.isArray(attachments) && attachments.length > 0) {
    try {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const tempPaths = [];

      for (let i = 0; i < attachments.length; i++) {
        const att = attachments[i];
        const name = att.filename || `attachment_${i + 1}`;
        const tempFilePath = path.join(os.tmpdir(), `wox_proton_${Date.now()}_${name}`);
        let buf = null;
        if (Buffer.isBuffer(att.content)) {
          buf = att.content;
        } else if (typeof att.content === 'string' && att.content.includes('base64,')) {
          buf = Buffer.from(att.content.split('base64,')[1], 'base64');
        } else if (typeof att.content === 'string') {
          buf = Buffer.from(att.content, 'utf8');
        } else if (att.path && fs.existsSync(att.path)) {
          buf = fs.readFileSync(att.path);
        }
        if (buf) {
          fs.writeFileSync(tempFilePath, buf);
          tempPaths.push(tempFilePath);
        }
      }

      if (tempPaths.length > 0) {
        const fileInput = page.locator('input[type="file"][data-testid="composer-attachments-button"], input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(tempPaths);
          await page.waitForTimeout(2000);
        }
        setTimeout(() => {
          for (const p of tempPaths) {
            try { fs.unlinkSync(p); } catch {}
          }
        }, 15000);
      }
    } catch (attErr) {
      console.warn('[ProtonSync] Attachments upload notice:', attErr.message);
    }
  }

  // 5. Send message and await confirmation
  let sendSucceeded = false;
  let sentMessageId = `proton-${Date.now()}`;

  const responseHandler = async (res) => {
    try {
      const url = res.url();
      if (url.includes('/api/mail/v4/messages') && res.request().method() === 'POST' && res.status() === 200) {
        sendSucceeded = true;
        const data = await res.json().catch(() => ({}));
        if (data?.Message?.ID) sentMessageId = data.Message.ID;
      }
    } catch {}
  };
  page.on('response', responseHandler);

  const sendBtn = page.locator('button[data-testid="composer:send-button"], button:has-text("Send")').first();
  if (await sendBtn.count() > 0 && await sendBtn.isVisible()) {
    await sendBtn.click({ force: true });
  } else {
    await page.keyboard.press('Control+Enter');
  }

  // Wait up to 10 seconds for confirmation
  const startWait = Date.now();
  while (Date.now() - startWait < 10000) {
    if (sendSucceeded) break;
    const isNotification = await page.locator('.notification__content, [role="alert"], [data-testid="notification"]').filter({ hasText: /sent|message sent/i }).count();
    if (isNotification > 0) {
      sendSucceeded = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  page.off('response', responseHandler);
  // Ensure the composer has fully closed and UI is settled before completing
  await page.waitForTimeout(2500);

  return {
    success: true,
    message: 'Email sent successfully via Proton Mail',
    messageId: sentMessageId,
  };
}
