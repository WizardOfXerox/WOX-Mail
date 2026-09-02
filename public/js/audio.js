/**
 * @fileoverview WoxMail Sovereign Web Audio Synthesizer
 * Synthesizes crisp notification chimes in real-time using native Web Audio API ($0 zero-dependency).
 */

(function () {
  'use strict';

  if (typeof window === 'undefined') return;

  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  const PRESETS = {
    SOVEREIGN: 'sovereign',
    TERMINAL: 'terminal',
    GLASS: 'glass',
    POP: 'pop',
    SILENT: 'silent'
  };

  /**
   * Synthesize Sovereign Harmonic Two-Tone Chime
   */
  function playSovereignChime(ctx, vol) {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 Major triad

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.3 * vol, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.65);
    });
  }

  /**
   * Synthesize Retro Terminal Blip
   */
  function playTerminalBlip(ctx, vol) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1760, now + 0.05); // A6

    gain.gain.setValueAtTime(0.2 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Synthesize Soft Glass Crystal Tap
   */
  function playGlassTap(ctx, vol) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1046.5, now); // C6
    osc.frequency.exponentialRampToValueAtTime(2093.0, now + 0.03);

    gain.gain.setValueAtTime(0.25 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  }

  /**
   * Play notification sound by preset name
   */
  function playChime(preset = PRESETS.SOVEREIGN, volume = 0.7) {
    if (preset === PRESETS.SILENT) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    const vol = Math.max(0, Math.min(1, volume));

    switch (preset) {
      case PRESETS.SOVEREIGN:
        playSovereignChime(ctx, vol);
        break;
      case PRESETS.TERMINAL:
        playTerminalBlip(ctx, vol);
        break;
      case PRESETS.GLASS:
      case PRESETS.POP:
        playGlassTap(ctx, vol);
        break;
      default:
        playSovereignChime(ctx, vol);
    }
  }

  window.WoxAudio = {
    PRESETS,
    playChime
  };
})();
