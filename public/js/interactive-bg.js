/**
 * @fileoverview WoxMail Interactive Cursor-Reactive Background Engine
 * High-performance GPU-accelerated canvas background with cursor spotlight,
 * fluid particle physics, constellation network, and card hover illumination.
 */

(function () {
  'use strict';

  // Check for reduced motion or non-browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Configuration constants
  const PARTICLE_COUNT_DESKTOP = 48;
  const PARTICLE_COUNT_COMPACT = 25;
  const CONNECTION_MAX_DIST = 140;
  const CURSOR_INTERACTION_RADIUS = 220;
  const LERP_FACTOR = 0.085;

  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;

  // Cursor coordinates
  let mouse = {
    targetX: -1000,
    targetY: -1000,
    x: -1000,
    y: -1000,
    vx: 0,
    vy: 0,
    speed: 0,
    active: false,
    lastMoveTime: 0,
    isHoveringInteractive: false,
  };

  // Particles
  let particles = [];
  let animId = null;
  let isTabVisible = true;
  let isDarkMode = true;

  class Particle {
    constructor() {
      this.reset(true);
    }

    reset(initial) {
      this.x = initial ? Math.random() * (width || window.innerWidth) : (Math.random() > 0.5 ? 0 : width);
      this.y = Math.random() * (height || window.innerHeight);
      this.baseRadius = Math.random() * 1.6 + 0.8;
      this.radius = this.baseRadius;
      this.vx = (Math.random() - 0.5) * 0.45;
      this.vy = (Math.random() - 0.5) * 0.45;
      this.alpha = Math.random() * 0.5 + 0.2;
      this.baseAlpha = this.alpha;
      this.pulseSpeed = Math.random() * 0.02 + 0.01;
      this.pulsePhase = Math.random() * Math.PI * 2;
      this.hue = Math.random() > 0.6 ? 265 : (Math.random() > 0.5 ? 190 : 280); // violet, cyan, purple
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;

      // Wrap around bounds
      if (this.x < -20) this.x = width + 20;
      if (this.x > width + 20) this.x = -20;
      if (this.y < -20) this.y = height + 20;
      if (this.y > height + 20) this.y = -20;

      // Breathing shimmer
      this.pulsePhase += this.pulseSpeed;
      this.alpha = this.baseAlpha + Math.sin(this.pulsePhase) * 0.15;

      // Cursor magnetic repulsion/glow
      if (mouse.active) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.hypot(dx, dy);

        if (dist < CURSOR_INTERACTION_RADIUS && dist > 0) {
          const force = (1 - dist / CURSOR_INTERACTION_RADIUS);
          const angle = Math.atan2(dy, dx);
          
          // Subtle repulsion
          this.x -= Math.cos(angle) * force * 1.5;
          this.y -= Math.sin(angle) * force * 1.5;

          // Expand radius and brightness near cursor
          this.radius = this.baseRadius * (1 + force * 1.4);
          this.alpha = Math.min(1, this.baseAlpha + force * 0.65);
        } else {
          this.radius += (this.baseRadius - this.radius) * 0.1;
        }
      }
    }

    draw() {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      if (isDarkMode) {
        ctx.fillStyle = `hsla(${this.hue}, 90%, 75%, ${this.alpha})`;
        ctx.shadowColor = `hsla(${this.hue}, 100%, 70%, ${this.alpha * 0.7})`;
        ctx.shadowBlur = this.radius * 3.5;
      } else {
        ctx.fillStyle = `hsla(${this.hue}, 85%, 52%, ${Math.min(1, this.alpha * 1.3)})`;
        ctx.shadowColor = `hsla(${this.hue}, 85%, 50%, 0.4)`;
        ctx.shadowBlur = this.radius * 3;
      }
      ctx.fill();
      ctx.restore();
    }
  }

  function checkTheme() {
    isDarkMode = document.documentElement.getAttribute('data-theme') !== 'light';
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(dpr, dpr);
    }

    const count = width < 768 ? PARTICLE_COUNT_COMPACT : PARTICLE_COUNT_DESKTOP;
    if (particles.length !== count) {
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push(new Particle());
      }
    }
  }

  function initCanvas() {
    if (document.getElementById('wox-interactive-canvas')) return;

    canvas = document.createElement('canvas');
    canvas.id = 'wox-interactive-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '0';
    canvas.style.opacity = '1';
    canvas.style.transition = 'opacity 0.5s ease';

    // Insert at beginning of body behind UI
    if (document.body.firstChild) {
      document.body.insertBefore(canvas, document.body.firstChild);
    } else {
      document.body.appendChild(canvas);
    }

    ctx = canvas.getContext('2d');
    checkTheme();
    resize();

    // Observe theme attribute
    const themeObserver = new MutationObserver(checkTheme);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    window.addEventListener('resize', resize, { passive: true });
  }

  function onPointerMove(e) {
    const px = e.clientX;
    const py = e.clientY;

    if (!mouse.active) {
      mouse.x = px;
      mouse.y = py;
      mouse.targetX = px;
      mouse.targetY = py;
      mouse.active = true;
    } else {
      mouse.vx = px - mouse.targetX;
      mouse.vy = py - mouse.targetY;
      mouse.speed = Math.hypot(mouse.vx, mouse.vy);
      mouse.targetX = px;
      mouse.targetY = py;
    }

    mouse.lastMoveTime = performance.now();

    // Expose CSS variables for interactive card spotlight borders
    document.documentElement.style.setProperty('--cursor-x', `${px}px`);
    document.documentElement.style.setProperty('--cursor-y', `${py}px`);

    // Element spotlight tracking on cards/buttons
    const target = e.target;
    if (target && target.closest) {
      const card = target.closest('.card, .feature-card, .plan-card, .stat-card, .btn, .endpoint-card, .dashboard-viewer-container, .viewer-body-container');
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${px - rect.left}px`);
        card.style.setProperty('--mouse-y', `${py - rect.top}px`);
      }
    }
  }

  function onPointerLeave() {
    mouse.active = false;
    mouse.targetX = -1000;
    mouse.targetY = -1000;
  }

  function drawCursorAura() {
    if (!mouse.active || mouse.x < -100 || mouse.x > width + 100) return;

    ctx.save();
    
    // Dynamic aura size based on cursor movement velocity
    const baseRadius = width < 768 ? 200 : 320;
    const dynamicRadius = baseRadius + Math.min(mouse.speed * 4, 120);

    // Multi-color radial gradient spotlight
    const gradient = ctx.createRadialGradient(
      mouse.x, mouse.y, 0,
      mouse.x, mouse.y, dynamicRadius
    );

    if (isDarkMode) {
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.22)');   // Royal Violet Glow
      gradient.addColorStop(0.35, 'rgba(124, 58, 237, 0.12)'); // Deep Purple
      gradient.addColorStop(0.65, 'rgba(56, 189, 248, 0.05)'); // Cyber Cyan Ambient
      gradient.addColorStop(1, 'rgba(11, 12, 22, 0)');        // Transparent
    } else {
      gradient.addColorStop(0, 'rgba(124, 58, 237, 0.18)');   // Vibrant Lavender-Violet Aura
      gradient.addColorStop(0.35, 'rgba(99, 102, 241, 0.12)'); // Soft Indigo
      gradient.addColorStop(0.7, 'rgba(236, 72, 153, 0.05)');  // Rose Glow
      gradient.addColorStop(1, 'rgba(248, 249, 252, 0)');     // Transparent
    }

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, dynamicRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawConstellationLines() {
    const len = particles.length;
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const p1 = particles[i];
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.hypot(dx, dy);

        if (dist < CONNECTION_MAX_DIST) {
          let alpha = (1 - dist / CONNECTION_MAX_DIST) * 0.18;

          // If near cursor, boost connection line brightness
          if (mouse.active) {
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const cursorDist = Math.hypot(mouse.x - midX, mouse.y - midY);
            if (cursorDist < CURSOR_INTERACTION_RADIUS) {
              const boost = (1 - cursorDist / CURSOR_INTERACTION_RADIUS) * 0.4;
              alpha += boost;
            }
          }

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          if (isDarkMode) {
            ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
          } else {
            ctx.strokeStyle = `rgba(124, 58, 237, ${alpha * 0.7})`;
          }
          ctx.lineWidth = 0.85;
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  function animate() {
    if (!isTabVisible) return;

    // Smooth cursor interpolation (lerp)
    if (mouse.active) {
      mouse.x += (mouse.targetX - mouse.x) * LERP_FACTOR;
      mouse.y += (mouse.targetY - mouse.y) * LERP_FACTOR;
      mouse.speed *= 0.92;
    }

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // 1. Draw smooth cursor spotlight aura
    drawCursorAura();

    // 2. Draw constellation connection lines
    drawConstellationLines();

    // 3. Update & render particles
    for (let i = 0; i < particles.length; i++) {
      particles[i].update();
      particles[i].draw();
    }

    animId = requestAnimationFrame(animate);
  }

  function handleVisibilityChange() {
    isTabVisible = document.visibilityState === 'visible';
    if (isTabVisible && !animId) {
      animId = requestAnimationFrame(animate);
    } else if (!isTabVisible && animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function init() {
    initCanvas();

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    animId = requestAnimationFrame(animate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
