import { computeSRPAuth } from './protonSRP.js';
import { protonCrypto } from './protonCrypto.js';
import { ProtonSessionStore } from './protonSessionStore.js';
import { getCsrfToken, post } from '../shared/api.js';

const PROTON_PROXY_BASE = '/api/proton';

/**
 * Direct Proton Mail API Client.
 * Handles authentication, 2FA, token management, message sync,
 * label mapping, and client-side PGP cryptography.
 */
class ProtonAPIClient {
  constructor() {
    this.uid = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.addresses = [];
  }

  /**
   * Initialize and restore session from storage if available.
   */
  restoreSession() {
    const stored = ProtonSessionStore.getSession();
    if (stored) {
      this.uid = stored.uid;
      this.username = stored.email || stored.username || stored.user?.Email || stored.uid;
      this.accessToken = stored.accessToken;
      this.refreshToken = stored.refreshToken;
      this.user = stored.user || { Email: this.username, Name: this.username };
      this.addresses = stored.addresses || [];
      return true;
    }
    return false;
  }

  /**
   * Dispatch authenticated request to Proton proxy.
   */
  async request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    if (this.uid) {
      headers['x-pm-uid'] = this.uid;
    }

    const res = await fetch(`${PROTON_PROXY_BASE}${path}`, {
      ...options,
      headers,
    });

    // Handle Token Expiry & Automatic Refresh
    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAuthToken();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
        return fetch(`${PROTON_PROXY_BASE}${path}`, { ...options, headers });
      }
    }

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.Error || data.error || `Proton API error (${res.status})`);
    }
    return data;
  }

  /**
   * Step 1 & 2: Authenticate with Proton via SRP-6a.
   */
  async login(username, password) {
    try {
      const csrfMatch = typeof document !== 'undefined' ? document.cookie.match(/woxmail_csrf=([^;]+)/) : null;
      const headers = { 'Content-Type': 'application/json' };
      if (csrfMatch) headers['x-csrf-token'] = csrfMatch[1];

      const loginRes = await fetch(`${PROTON_PROXY_BASE}/login`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ email: username, password }),
      });
      const data = await loginRes.json();
      if (loginRes.ok && data.success) {
        this.uid = data.uid || username;
        this.username = username;
        this.addresses = data.addresses || [];
        this.user = { Name: username, Email: username };
        ProtonSessionStore.saveSession({
          uid: this.uid,
          email: username,
          user: this.user,
          addresses: this.addresses,
        });
        return { success: true, user: this.user, addresses: this.addresses };
      }
      if (data.requires2FA) {
        return { requires2FA: true };
      }
    } catch (serverErr) {
      console.warn('Proton Direct Server Login error, trying client SRP fallback:', serverErr);
    }

    // 1. Fetch SRP auth challenge
    const infoRes = await fetch(`${PROTON_PROXY_BASE}/auth/v4/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Username: username }),
    });

    const info = await infoRes.json();
    if (!infoRes.ok) {
      throw new Error(info.Error || info.error || (info.Details?.HumanVerificationMethods ? 'Proton verification required' : 'Failed to initiate Proton authentication.'));
    }

    // 2. Perform client-side SRP calculation
    const srp = await computeSRPAuth(username, password, info);

    // 3. Submit proof to /auth/v4
    const authRes = await fetch(`${PROTON_PROXY_BASE}/auth/v4`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Username: info.Username || username,
        ClientEphemeral: srp.clientEphemeral,
        ClientProof: srp.clientProof,
        SRPSession: srp.srpSession,
      }),
    });

    const auth = await authRes.json();
    if (!authRes.ok) {
      const msg = auth.Error || auth.error || (auth.Code === 2028 ? 'Proton temporary security cooldown: Please log into mail.proton.me once to clear security lock, then try again.' : 'Invalid Proton credentials.');
      throw new Error(msg);
    }

    // Verify Server Proof to prevent rogue proxy/MITM
    if (auth.ServerProof && auth.ServerProof !== srp.expectedServerProof) {
      throw new Error('Proton Server Proof verification failed. Aborting for security.');
    }

    this.uid = auth.UID;
    this.accessToken = auth.AccessToken;
    this.refreshToken = auth.RefreshToken;

    // Check if 2FA TOTP is required
    if (auth['2FA'] && auth['2FA'].Enabled === 1) {
      return {
        requires2FA: true,
        uid: auth.UID,
        tempAccessToken: auth.AccessToken,
      };
    }

    // Unlocked! Fetch user, addresses, and unlock PGP keyring
    await this.completeLogin(password);
    return { success: true, user: this.user, addresses: this.addresses };
  }

  /**
   * Directly mount an existing Proton session token (bypasses SRP and bot protection challenges).
   */
  async loginWithSession(uid, accessToken, password, refreshToken = '') {
    this.uid = uid.trim();
    this.accessToken = accessToken.trim();
    this.refreshToken = refreshToken.trim();

    await this.completeLogin(password);
    return { success: true, user: this.user, addresses: this.addresses };
  }

  /**
   * Submit 2FA TOTP Code.
   */
  async submit2FA(twoFactorCode, password) {
    const res = await this.request('/auth/v4/2fa', {
      method: 'POST',
      body: JSON.stringify({ TwoFactorCode: twoFactorCode }),
    });

    await this.completeLogin(password);
    return { success: true, user: this.user };
  }

  /**
   * Complete login sequence: fetch user, address keys, unlock PGP keyring.
   */
  async completeLogin(password) {
    const userRes = await this.request('/core/v4/users');
    this.user = userRes.User;

    const addressesRes = await this.request('/core/v4/addresses');
    this.addresses = addressesRes.Addresses || [];

    const keysRes = await this.request('/keys/v4/all');
    const allKeys = [...(this.user.Keys || []), ...(keysRes.Keys || [])];

    // Unlock keys in WebWorker / crypto engine
    await protonCrypto.unlockKeys(allKeys, password);

    // Save persistent session
    ProtonSessionStore.saveSession({
      uid: this.uid,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      user: this.user,
      addresses: this.addresses,
    });
  }

  /**
   * Refresh bearer token.
   */
  async refreshAuthToken() {
    try {
      const res = await fetch(`${PROTON_PROXY_BASE}/auth/v4/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pm-uid': this.uid,
        },
        body: JSON.stringify({
          RefreshToken: this.refreshToken,
          ResponseType: 'token',
          GrantType: 'refresh_token',
        }),
      });
      const data = await res.json();
      if (res.ok && data.AccessToken) {
        this.accessToken = data.AccessToken;
        this.refreshToken = data.RefreshToken || this.refreshToken;
        ProtonSessionStore.saveSession({
          uid: this.uid,
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          user: this.user,
          addresses: this.addresses,
        });
        return true;
      }
    } catch {}
    return false;
  }

  /**
   * Get messages list.
   * @param {string} labelId - Label ID (0=Inbox, 1=Drafts, 2=Sent, 3=Trash, 4=Spam, 6=Archive, 10=Starred)
   * @param {number} page - Page number (0-based in Proton API)
   * @param {number} pageSize - Limit
   */
  async getMessages(labelId = '0', page = 0, pageSize = 25) {
    let data;
    const email = this.username || this.uid || (this.user && (this.user.Email || this.user.email)) || '';
    try {
      if (email) {
        const syncRes = await fetch(`${PROTON_PROXY_BASE}/sync/messages?email=${encodeURIComponent(email)}&LabelID=${labelId}&Page=${page}&PageSize=${pageSize}`);
        if (syncRes.ok) {
          const payload = await syncRes.json();
          data = payload.data || payload;
        } else if (syncRes.status === 500 || syncRes.status === 401 || syncRes.status === 400) {
          const errData = await syncRes.json().catch(() => ({}));
          if (errData.error && (errData.error.includes('unlock') || errData.error.includes('session not active'))) {
            throw new Error('Proton session not active. Please unlock your mailbox.');
          }
        }
      }
    } catch (e) {
      if (e.message && (e.message.includes('unlock') || e.message.includes('session not active'))) {
        throw e;
      }
    }

    if (!data) {
      data = await this.request(`/mail/v4/messages?LabelID=${labelId}&Page=${page}&PageSize=${pageSize}&Sort=Time&Desc=1`);
    }

    const rawList = data?.Conversations || data?.Messages || [];
    const total = data?.Total !== undefined ? data.Total : rawList.length;

    return {
      messages: rawList.map(m => {
        const senders = m.Senders || (m.Sender ? [m.Sender] : []);
        const firstSender = senders[0] || {};
        const senderName = firstSender.Name || m.SenderName || (firstSender.IsProton ? 'Proton' : '') || 'Proton';
        const senderAddr = firstSender.Address || m.SenderAddress || (firstSender.IsProton ? 'no-reply@news.proton.me' : '') || 'no-reply@news.proton.me';
        
        let time = m.Time || m.ContextTime || m.Order || Math.floor(Date.now() / 1000);
        if (time > 1000000000000) time = Math.floor(time / 1000000); // Normalize nanosecond/order stamps

        return {
          id: m.ID,
          subject: m.Subject || '(No Subject)',
          sender: senderAddr,
          from: senderAddr,
          from_name: senderName,
          recipient: m.ToList?.[0]?.Address || email || '',
          date: new Date(time * 1000).toISOString(),
          seen: !m.Unread,
          starred: (m.LabelIDs || []).includes('10'),
          has_attachments: (m.NumAttachments || m.Attachments?.length || 0) > 0,
          provider: 'proton',
        };
      }),
      total,
    };
  }

  /**
   * Get single message and decrypt body.
   */
  async getMessage(id, addressId = null) {
    let messageData;
    const email = this.username || this.uid || (this.user && (this.user.Email || this.user.email)) || '';
    try {
      if (email) {
        const syncRes = await fetch(`${PROTON_PROXY_BASE}/sync/messages/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`);
        if (syncRes.ok) {
          const payload = await syncRes.json();
          messageData = payload.data || payload;
        }
      }
    } catch {}

    const message = messageData?.Message || messageData?.Conversation || (await this.request(`/mail/v4/messages/${id}`).catch(() => ({})))?.Message;
    if (!message) {
      return {
        id,
        subject: '(No Subject)',
        sender: 'no-reply@news.proton.me',
        from_name: 'Proton',
        to: [{ name: '', address: this.username || '' }],
        cc: [],
        date: new Date().toISOString(),
        html: '<div style="padding:1.5rem; color:#9898b0;">Message content loading...</div>',
        text: 'Message content loading...',
        attachments: [],
      };
    }

    let decryptedHtml = message.DecryptedHtml || message.Body || message.Preview || '';
    if (message.Body && message.Body.startsWith('-----BEGIN PGP MESSAGE-----') && protonCrypto?.primaryKey) {
      try {
        decryptedHtml = await protonCrypto.decryptMessageBody(message.Body, addressId || message.AddressID);
      } catch {}
    }

    const senders = message.Senders || (message.Sender ? [message.Sender] : []);
    const firstSender = senders[0] || {};
    const senderName = firstSender.Name || message.SenderName || (firstSender.IsProton ? 'Proton' : '') || 'Proton';
    const senderAddr = firstSender.Address || message.SenderAddress || (firstSender.IsProton ? 'no-reply@news.proton.me' : '') || 'no-reply@news.proton.me';

    let time = message.Time || message.Order || Math.floor(Date.now() / 1000);
    if (time > 1000000000000) time = Math.floor(time / 1000000);

    return {
      id: message.ID || id,
      subject: message.Subject || '(No Subject)',
      sender: senderAddr,
      from_name: senderName,
      to: message.ToList || [{ name: '', address: this.username || '' }],
      cc: message.CCList || [],
      date: new Date(time * 1000).toISOString(),
      html: decryptedHtml,
      text: typeof decryptedHtml === 'string' ? decryptedHtml.replace(/<[^>]*>/g, '') : '',
      attachments: (message.Attachments || []).map(a => ({
        id: a.ID,
        filename: a.Name,
        size: a.Size,
        mimeType: a.MIMEType,
        keyPackets: a.KeyPackets,
      })),
    };
  }

  /**
   * Fetch and decrypt Proton Contacts to bridge into WoxMail Address Book.
   */
  async getContacts() {
    try {
      const data = await this.request('/contacts/v4/contacts');
      const contacts = [];
      for (const c of (data.Contacts || [])) {
        if (c.Cards) {
          for (const card of c.Cards) {
            try {
              const decryptedVCard = await protonCrypto.decryptMessageBody(card.Data);
              // Extract FN and EMAIL from vCard
              const nameMatch = decryptedVCard.match(/^FN:(.*)$/m);
              const emailMatch = decryptedVCard.match(/^EMAIL.*:(.*)$/m);
              if (emailMatch) {
                contacts.push({
                  name: nameMatch ? nameMatch[1].trim() : emailMatch[1].trim(),
                  email: emailMatch[1].trim(),
                  source: 'proton',
                });
              }
            } catch {}
          }
        }
      }
      return contacts;
    } catch {
      return [];
    }
  }

  /**
   * Get all active Proton alias addresses.
   */
  async getAddresses() {
    try {
      const email = this.username || this.uid;
      if (email) {
        const res = await fetch(`${PROTON_PROXY_BASE}/addresses?email=${encodeURIComponent(email)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.addresses) {
            this.addresses = data.addresses;
            return data.addresses;
          }
        }
      }
    } catch {}
    return this.addresses || [];
  }

  /**
   * Send an email through the authenticated Proton Mail session.
   */
  async sendMail({ email, from, to, cc, bcc, subject, text, html, attachments = [] }) {
    return await post('/proton/send', {
      email: email || this.username || this.uid,
      from,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      attachments,
    });
  }

  /**
   * Logout and revoke session.
   */
  async logout() {
    try {
      await this.request('/auth/v4', { method: 'DELETE' });
    } catch {}
    this.uid = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.user = null;
    this.addresses = [];
    ProtonSessionStore.clearSession();
  }
}

export const protonClient = new ProtonAPIClient();
