/**
 * WoxMail Native PC Desktop & Sound Notification Engine
 * Provides OS desktop alerts (Windows Action Center / Mac / Linux) and Web Audio chimes for new emails.
 */

class WoxNotificationService {
  constructor() {
    this.audioCtx = null;
    this.hasRequested = false;
  }

  /**
   * Request native OS notification permission.
   */
  async requestPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    if (Notification.permission === 'granted') {
      return true;
    }
    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }
    return false;
  }

  /**
   * Play subtle, professional incoming email chime via Web Audio API.
   */
  playChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('[Notifications] Audio chime error:', e);
    }
  }

  /**
   * Display native desktop notification and play chime.
   * @param {Object} options
   * @param {string} options.from - Sender name or email
   * @param {string} options.subject - Email subject
   * @param {string} [options.preview] - Snippet / snippet preview
   * @param {Function} [options.onClick] - Click callback
   */
  notify({ from, subject, preview, onClick }) {
    // 1. Play sound
    this.playChime();

    // 2. Check if desktop notifications are supported & granted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const title = `New email from ${from || 'Unknown'}`;
      const body = subject ? (preview ? `${subject}\n${preview}` : subject) : preview || 'You received a new email';

      const notification = new Notification(title, {
        body: body.slice(0, 150),
        icon: '/icons/icon-192x192.png',
        tag: `woxmail-new-${Date.now()}`,
        requireInteraction: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        if (typeof onClick === 'function') onClick();
      };
    }
  }
}

export const NotificationService = new WoxNotificationService();
export default NotificationService;
