/**
 * WoxCrypt Content Script
 * Handles input autofill and overlays functional inline PGP decryption triggers on webmail clients.
 */

// 1. Autofill listener triggered from background service worker context menu
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'AUTOFILL_TEMP_EMAIL' && request.email) {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      activeEl.value = request.email;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
      navigator.clipboard.writeText(request.email).catch(() => {});
    }
  }
});

// 2. Webmail PGP Decryption Banner Injector (Gmail, Outlook, Yahoo, Webmail)
function scanAndInjectPgpOverlays() {
  const PGP_REGEX = /-----BEGIN PGP MESSAGE-----[\s\S]+?-----END PGP MESSAGE-----/;
  
  // Find container elements
  const candidates = document.querySelectorAll('div, pre, p');

  candidates.forEach(el => {
    if (el.dataset.woxcryptScanned) return;
    
    const text = el.innerText || '';
    const match = text.match(PGP_REGEX);
    if (match) {
      el.dataset.woxcryptScanned = 'true';
      const pgpCiphertext = match[0];

      // Build container DOM cleanly
      const banner = document.createElement('div');
      banner.className = 'woxcrypt-decrypt-banner';
      banner.style.cssText = `
        background: #1a1a2e;
        border: 1px solid #7c3aed;
        border-radius: 8px;
        padding: 12px 16px;
        margin: 12px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #f0f0f5;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;

      // Header row
      const headerRow = document.createElement('div');
      headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between;';

      const titleWrap = document.createElement('div');
      const title = document.createElement('strong');
      title.style.cssText = 'color: #a78bfa; font-size: 13px; display: block;';
      title.textContent = '[WOXCRYPT] OpenPGP Ciphertext Detected';

      const subtitle = document.createElement('span');
      subtitle.style.cssText = 'font-size: 11px; color: #888;';
      subtitle.textContent = 'Protected by sovereign encryption.';

      titleWrap.appendChild(title);
      titleWrap.appendChild(subtitle);

      const decryptBtn = document.createElement('button');
      decryptBtn.type = 'button';
      decryptBtn.textContent = 'Decrypt Message';
      decryptBtn.style.cssText = `
        background: #7c3aed;
        color: #ffffff;
        border: none;
        border-radius: 9999px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      `;

      headerRow.appendChild(titleWrap);
      headerRow.appendChild(decryptBtn);
      banner.appendChild(headerRow);

      // Decryption input area (hidden initially)
      const formArea = document.createElement('div');
      formArea.style.cssText = 'display: none; margin-top: 10px; border-top: 1px solid #2a2a4a; padding-top: 10px;';

      const passInput = document.createElement('input');
      passInput.type = 'password';
      passInput.placeholder = 'Enter secret passphrase...';
      passInput.style.cssText = `
        background: #0f0f1a;
        border: 1px solid #2a2a4a;
        border-radius: 6px;
        color: #f0f0f5;
        padding: 6px 10px;
        font-size: 12px;
        width: 200px;
        margin-right: 8px;
        outline: none;
      `;

      const submitBtn = document.createElement('button');
      submitBtn.type = 'button';
      submitBtn.textContent = 'Unlock';
      submitBtn.style.cssText = `
        background: #22c55e;
        color: #0f0f1a;
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      `;

      const errorMsg = document.createElement('div');
      errorMsg.style.cssText = 'color: #ef4444; font-size: 11px; margin-top: 6px; display: none;';

      formArea.appendChild(passInput);
      formArea.appendChild(submitBtn);
      formArea.appendChild(errorMsg);
      banner.appendChild(formArea);

      // Decrypted text display area
      const resultArea = document.createElement('div');
      resultArea.style.cssText = 'display: none; margin-top: 10px; padding: 10px; background: #0f0f1a; border-radius: 6px; border: 1px solid #22c55e;';

      const resultHeader = document.createElement('div');
      resultHeader.style.cssText = 'font-size: 11px; color: #22c55e; font-weight: 700; margin-bottom: 6px;';
      resultHeader.textContent = '[PGP DECRYPTED IN RAM]';

      const resultText = document.createElement('pre');
      resultText.style.cssText = 'white-space: pre-wrap; font-family: monospace; font-size: 12px; color: #f0f0f5; margin: 0;';

      resultArea.appendChild(resultHeader);
      resultArea.appendChild(resultText);
      banner.appendChild(resultArea);

      // Wire Event Listeners
      decryptBtn.addEventListener('click', () => {
        formArea.style.display = formArea.style.display === 'none' ? 'block' : 'none';
        if (formArea.style.display === 'block') {
          passInput.focus();
        }
      });

      submitBtn.addEventListener('click', async () => {
        const passphrase = passInput.value.trim();
        if (!passphrase) {
          errorMsg.textContent = 'Please enter your passphrase.';
          errorMsg.style.display = 'block';
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Decrypting...';
        errorMsg.style.display = 'none';

        try {
          // Use bundled openpgp object on window
          if (typeof window.openpgp === 'undefined') {
            throw new Error('OpenPGP crypto engine is initializing, please try again.');
          }

          const message = await window.openpgp.readMessage({ armoredMessage: pgpCiphertext });
          const { data: decrypted } = await window.openpgp.decrypt({
            message,
            passwords: [passphrase]
          });

          resultText.textContent = decrypted;
          resultArea.style.display = 'block';
          formArea.style.display = 'none';
          decryptBtn.style.display = 'none';
        } catch (err) {
          errorMsg.textContent = 'Decryption failed: ' + (err.message || 'Incorrect passphrase');
          errorMsg.style.display = 'block';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Unlock';
        }
      });

      // Insert banner above the ciphertext element
      el.parentNode.insertBefore(banner, el);
    }
  });
}

// Scan periodically on dynamic SPA page navigations
setInterval(scanAndInjectPgpOverlays, 2000);
