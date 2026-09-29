/**
 * WoxCrypt Popup Script
 * Manages tab switching, disposable mail generation via configurable API base, and client-side OpenPGP decryption.
 */

const DEFAULT_API_BASE = 'http://localhost:3001';

document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });

  // Settings
  const settingApiBase = document.getElementById('setting-api-base');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const settingsStatus = document.getElementById('settings-status');

  chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (res) => {
    if (res && res.apiBaseUrl) {
      settingApiBase.value = res.apiBaseUrl;
    } else {
      settingApiBase.value = DEFAULT_API_BASE;
    }
  });

  btnSaveSettings.addEventListener('click', () => {
    const url = settingApiBase.value.trim() || DEFAULT_API_BASE;
    chrome.runtime.sendMessage({ type: 'SET_CONFIG', apiBaseUrl: url }, () => {
      settingsStatus.style.display = 'block';
      setTimeout(() => { settingsStatus.style.display = 'none'; }, 2000);
    });
  });

  // Temp Mail
  const btnGenerate = document.getElementById('btn-generate');
  const btnOpenWebmail = document.getElementById('btn-open-webmail');
  const recentList = document.getElementById('recent-list');

  chrome.runtime.sendMessage({ type: 'GET_RECENT_ADDRESSES' }, (response) => {
    if (response && response.addresses && response.addresses.length > 0) {
      renderRecentAddresses(response.addresses);
    }
  });

  btnGenerate.addEventListener('click', async () => {
    btnGenerate.innerText = 'Generating...';
    btnGenerate.disabled = true;

    try {
      const apiBase = settingApiBase.value.trim() || DEFAULT_API_BASE;
      const res = await fetch(`${apiBase}/api/tempmail/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();

      if (data.address) {
        navigator.clipboard.writeText(data.address);

        chrome.storage.local.get(['recentTempAddresses'], (result) => {
          const list = result.recentTempAddresses || [];
          list.unshift({ address: data.address, token: data.token, createdAt: Date.now() });
          chrome.storage.local.set({ recentTempAddresses: list.slice(0, 10) }, () => {
            renderRecentAddresses(list.slice(0, 10));
          });
        });

        btnGenerate.innerText = 'Copied to Clipboard!';
        setTimeout(() => {
          btnGenerate.innerText = 'Generate Disposable Mail';
          btnGenerate.disabled = false;
        }, 2000);
      } else {
        throw new Error(data.error || 'Failed to generate');
      }
    } catch (err) {
      btnGenerate.innerText = 'Error: Check Endpoint';
      setTimeout(() => {
        btnGenerate.innerText = 'Generate Disposable Mail';
        btnGenerate.disabled = false;
      }, 2000);
    }
  });

  btnOpenWebmail.addEventListener('click', () => {
    const apiBase = settingApiBase.value.trim() || DEFAULT_API_BASE;
    chrome.tabs.create({ url: `${apiBase}/dashboard` });
  });

  function renderRecentAddresses(list) {
    if (!list || list.length === 0) return;
    recentList.innerHTML = list.map(item => `
      <div class="address-card">
        <div class="email" title="${item.address}">${item.address}</div>
        <button type="button" class="copy-btn" data-email="${item.address}">[COPY]</button>
      </div>
    `).join('');

    recentList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const email = btn.dataset.email;
        navigator.clipboard.writeText(email);
        btn.innerText = '[COPIED]';
        setTimeout(() => { btn.innerText = '[COPY]'; }, 1500);
      });
    });
  }

  // OpenPGP Decryption in Popup
  const btnDecryptPgp = document.getElementById('btn-decrypt-pgp');
  const cipherInput = document.getElementById('pgp-cipher-input');
  const passInput = document.getElementById('pgp-passphrase-input');
  const decryptOutput = document.getElementById('pgp-decrypt-output');

  btnDecryptPgp.addEventListener('click', async () => {
    const ciphertext = cipherInput.value.trim();
    const passphrase = passInput.value.trim();

    if (!ciphertext || !ciphertext.includes('-----BEGIN PGP MESSAGE-----')) {
      decryptOutput.textContent = 'Please paste a valid OpenPGP ciphertext block.';
      decryptOutput.style.color = '#ef4444';
      decryptOutput.style.display = 'block';
      return;
    }

    if (!passphrase) {
      decryptOutput.textContent = 'Passphrase is required.';
      decryptOutput.style.color = '#ef4444';
      decryptOutput.style.display = 'block';
      return;
    }

    btnDecryptPgp.disabled = true;
    btnDecryptPgp.textContent = 'Decrypting...';

    try {
      if (typeof window.openpgp === 'undefined') {
        throw new Error('OpenPGP library not loaded.');
      }

      const message = await window.openpgp.readMessage({ armoredMessage: ciphertext });
      const { data: decrypted } = await window.openpgp.decrypt({
        message,
        passwords: [passphrase]
      });

      decryptOutput.textContent = decrypted;
      decryptOutput.style.color = '#22c55e';
      decryptOutput.style.display = 'block';
    } catch (err) {
      decryptOutput.textContent = 'Decryption failed: ' + (err.message || 'Invalid passphrase');
      decryptOutput.style.color = '#ef4444';
      decryptOutput.style.display = 'block';
    } finally {
      btnDecryptPgp.disabled = false;
      btnDecryptPgp.textContent = 'Decrypt Ciphertext';
    }
  });
});
