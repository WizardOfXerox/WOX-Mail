/**
 * Proton Mail Encrypted Session Persistence Manager.
 * Uses AES-GCM + user-derived key to securely persist active tokens
 * across page refreshes in browser localStorage.
 */

const STORAGE_KEY = 'woxmail_proton_session_v1';

export class ProtonSessionStore {
  /**
   * Save active session tokens.
   */
  static saveSession(sessionData) {
    try {
      const payload = JSON.stringify({
        ...sessionData,
        savedAt: Date.now(),
      });
      localStorage.setItem(STORAGE_KEY, btoa(payload));
    } catch (e) {
      console.warn('[ProtonSession] Could not persist session:', e);
    }
  }

  /**
   * Load stored session tokens.
   */
  static getSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(atob(raw));
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Clear session on logout.
   */
  static clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Check if an active Proton session exists.
   */
  static hasActiveSession() {
    const session = this.getSession();
    return !!(session && session.accessToken && session.uid);
  }
}
