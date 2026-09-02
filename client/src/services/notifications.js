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
   * Play an audible error beep sound via Web Audio API for rapid debugging.
   * Distinct dual-pulse lower frequency tone that immediately signals where an error occurred.
   * @param {string} [context] - Context string describing the component / route / action
   * @param {Error|object|string} [err] - The error object or message
   */
  playErrorBeep(context = '', err = null) {
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

      // Pulse 1: Low warning pulse (280Hz -> 140Hz)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(280, now);
      osc1.frequency.exponentialRampToValueAtTime(140, now + 0.12);

      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Pulse 2: Lower descending thud (190Hz -> 95Hz) after 130ms
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(190, now + 0.13);
      osc2.frequency.exponentialRampToValueAtTime(95, now + 0.28);

      gain2.gain.setValueAtTime(0, now + 0.13);
      gain2.gain.linearRampToValueAtTime(0.20, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.13);
      osc2.stop(now + 0.28);

      console.warn(`[DEBUG AUDIO BEEP] Error occurred at: "${context}"`, err || '');
    } catch (e) {
      console.warn('[Notifications] Error beep playback failed:', e);
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

if (typeof window !== 'undefined') {
  window.WoxBeep = (ctx, err) => NotificationService.playErrorBeep(ctx, err);
}

export default NotificationService;
