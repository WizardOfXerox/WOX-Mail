/**
 * WoxCrypt Background Service Worker (Manifest V3)
 * Handles context menu triggers, configurable API endpoints, and PGP key vault storage.
 */

const DEFAULT_API_BASE = 'http://localhost:3001';

async function getApiBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiBaseUrl'], (result) => {
      resolve(result.apiBaseUrl || DEFAULT_API_BASE);
    });
  });
}

// 1. Initialize Context Menu on Extension Installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'woxcrypt-generate-tempmail',
    title: 'Generate WoxMail Temp Address',
    contexts: ['editable']
  });
});

// 2. Handle Context Menu Click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'woxcrypt-generate-tempmail') {
    try {
      const apiBase = await getApiBase();
      const res = await fetch(`${apiBase}/api/tempmail/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (!data.address) {
        throw new Error(data.error || 'Failed to generate address');
      }

      const generatedEmail = data.address;

      // Save to recent addresses in chrome storage
      chrome.storage.local.get(['recentTempAddresses'], (result) => {
        const list = result.recentTempAddresses || [];
        list.unshift({ address: generatedEmail, token: data.token, createdAt: Date.now() });
        chrome.storage.local.set({ recentTempAddresses: list.slice(0, 10) });
      });

      // Send autofill message to content script
      chrome.tabs.sendMessage(tab.id, {
        type: 'AUTOFILL_TEMP_EMAIL',
        email: generatedEmail
      });

      // Show native browser notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon-48.png',
        title: 'WoxMail Temp Address Generated',
        message: `${generatedEmail} generated and copied to clipboard!`
      });
    } catch (err) {
      console.error('[WoxCrypt SW] Generation error:', err);
    }
  }
});

// 3. Message passing dispatcher for content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_RECENT_ADDRESSES') {
    chrome.storage.local.get(['recentTempAddresses'], (result) => {
      sendResponse({ addresses: result.recentTempAddresses || [] });
    });
    return true;
  }

  if (request.type === 'GET_CONFIG') {
    chrome.storage.local.get(['apiBaseUrl'], (result) => {
      sendResponse({ apiBaseUrl: result.apiBaseUrl || DEFAULT_API_BASE });
    });
    return true;
  }

  if (request.type === 'SET_CONFIG') {
    chrome.storage.local.set({ apiBaseUrl: request.apiBaseUrl }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.type === 'CHECK_KEY_VAULT_STATUS') {
    chrome.storage.local.get(['pgpKeyVault'], (result) => {
      sendResponse({ hasKeys: Boolean(result.pgpKeyVault && result.pgpKeyVault.length > 0) });
    });
    return true;
  }

  if (request.type === 'GET_PGP_KEYS') {
    chrome.storage.local.get(['pgpKeyVault'], (result) => {
      sendResponse({ keys: result.pgpKeyVault || [] });
    });
    return true;
  }

  if (request.type === 'SAVE_PGP_KEY') {
    chrome.storage.local.get(['pgpKeyVault'], (result) => {
      const keys = result.pgpKeyVault || [];
      keys.push({
        id: 'key_' + Date.now(),
        name: request.name || 'Personal Key',
        armoredKey: request.armoredKey,
        isPrivate: request.isPrivate || false,
        createdAt: Date.now()
      });
      chrome.storage.local.set({ pgpKeyVault: keys }, () => {
        sendResponse({ success: true, keys });
      });
    });
    return true;
  }
});
