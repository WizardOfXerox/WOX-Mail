/**
 * @fileoverview WoxMail Universal Multi-Shader Interactive Canvas Background Engine
 * Shaders:
 * 1. Aurora Waves (Dynamic violet/cyan atmospheric wave currents reacting to pointer velocity)
 * 2. Cyber Mesh (3D Perspective Glowing Wireframe Grid with horizon ripples)
 * 3. Deep Space Starfield (Parallax star particles with cursor gravity repulsion)
 * 4. Matrix Stream (Cascading Sovereign glyph terminal rain)
 * 5. Zen Radial Drift (Breathing chromatic radial blooms)
 * 6. Constellation Particles (Fluid connected nodes with magnetic repulsion and spotlight aura)
 * 7. OLED Monochrome (Pitch-black distraction-free power saver)
 */

(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const MODES = {
    AURORA: 'aurora',
    CYBER_MESH: 'cyber_mesh',
    STARFIELD: 'deep_space',
    MATRIX: 'matrix',
    ZEN: 'zen_drift',
    PARTICLES: 'particles',
    OLED: 'oled_monochrome'
  };

  const ACCENT_COLORS = {
    purple: { r: 124, g: 58, b: 237, hue: 265 },
    emerald: { r: 16, g: 185, b: 129, hue: 155 },
    cobalt: { r: 59, g: 130, b: 246, hue: 215 },
    amber: { r: 245, g: 158, b: 11, hue: 38 },
    cyan: { r: 6, g: 182, b: 212, hue: 190 },
    crimson: { r: 239, g: 68, b: 68, hue: 350 },
    oled: { r: 229, g: 231, b: 235, hue: 0 }
  };

  let currentMode = localStorage.getItem('woxmail_bg_mode') || MODES.AURORA;
  let intensity = parseFloat(localStorage.getItem('woxmail_bg_intensity') || '1.0');
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let animId = null;
  let isTabVisible = true;
  let isDarkMode = true;
  let time = 0;

  let mouse = {
    x: -1000,
    y: -1000,
    targetX: -1000,
    targetY: -1000,
    vx: 0,
    vy: 0,
    speed: 0,
    active: false,
    lastMoveTime: 0
  };

  // Matrix Stream Glyphs
  const MATRIX_CHARS = '01WOXMAILSOVEREIGNCRYPTOPRIVACY2026';
  let matrixColumns = [];

  // Starfield particles
  let stars = [];

  // Constellation particles
  let constellationNodes = [];

  function getAccent() {
    const acc = document.documentElement.getAttribute('data-accent') || localStorage.getItem('woxmail_accent') || 'purple';
    return ACCENT_COLORS[acc] || ACCENT_COLORS.purple;
  }

  function checkTheme() {
    isDarkMode = document.documentElement.getAttribute('data-theme') !== 'light';
  }

  function initCanvas() {
    canvas = document.getElementById('woxmail-interactive-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'woxmail-interactive-canvas';
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
      document.body.prepend(canvas);
    }
    ctx = canvas.getContext('2d', { alpha: true });
    checkTheme();
    resize();
    initModeState();
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth || document.documentElement.clientWidth || 360;
    height = window.innerHeight || document.documentElement.clientHeight || 640;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    initModeState();
  }

  function initModeState() {
    if (!width || !height) return;

    // 1. Matrix drops
    const colSpacing = width < 768 ? 16 : 20;
    const colCount = Math.floor(width / colSpacing);
    matrixColumns = [];
    for (let i = 0; i < colCount; i++) {
      matrixColumns.push({
        x: i * colSpacing,
        y: Math.random() * height,
        speed: Math.random() * 2 + 1.5,
        length: Math.floor(Math.random() * 12 + 6)
      });
    }

    // 2. Stars
    stars = [];
    const starDivisor = width < 768 ? 8000 : 11000;
    const starCount = Math.floor((width * height) / starDivisor);
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.8 + 0.6,
        alpha: Math.random() * 0.7 + 0.3,
        baseAlpha: Math.random() * 0.7 + 0.3,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35
      });
    }

    // 3. Constellation nodes
    const nodeCount = width < 768 ? 32 : 56;
    constellationNodes = [];
    for (let i = 0; i < nodeCount; i++) {
      constellationNodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        baseRadius: Math.random() * 1.8 + 1.0,
        radius: Math.random() * 1.8 + 1.0,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        alpha: Math.random() * 0.5 + 0.3,
        baseAlpha: Math.random() * 0.5 + 0.3,
        pulseSpeed: Math.random() * 0.025 + 0.01,
        pulsePhase: Math.random() * Math.PI * 2
      });
    }
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

    // Set CSS variables for interactive card spotlight borders across all pages
    document.documentElement.style.setProperty('--cursor-x', `${px}px`);
    document.documentElement.style.setProperty('--cursor-y', `${py}px`);

    const target = e.target;
    if (target && target.closest) {
      const card = target.closest('.card, .bento-card, .feature-card, .plan-card, .stat-card, .btn, .nav-link, .sidebar-item, .message-item-card, .dashboard-sidebar, .dashboard-list');
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${px - rect.left}px`);
        card.style.setProperty('--mouse-y', `${py - rect.top}px`);
      }
    }
  }

  function onTouchMove(e) {
    if (e.touches && e.touches.length > 0) {
      const touch = e.touches[0];
      onPointerMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
        target: touch.target
      });
    }
  }

  function onPointerLeave() {
    mouse.active = false;
    mouse.targetX = -1000;
    mouse.targetY = -1000;
  }

  // ─── 1. Aurora Waves ─────────────────────────────────────
  function drawAurora() {
    time += 0.010;
    const waveCount = 3;
    const acc = getAccent();

    const colors = [
      { r: acc.r, g: acc.g, b: acc.b, a: 0.48 * intensity },
      { r: Math.min(255, acc.r + 40), g: Math.min(255, acc.g + 30), b: Math.min(255, acc.b + 50), a: 0.38 * intensity },
      { r: 14, g: 165, b: 233, a: 0.28 * intensity }
    ];

    const curX = mouse.active ? mouse.x : width * 0.5 + Math.sin(time * 0.7) * (width * 0.3);
    const curY = mouse.active ? mouse.y : height * 0.45 + Math.cos(time * 0.5) * (height * 0.2);

    for (let w = 0; w < waveCount; w++) {
      ctx.beginPath();
      ctx.moveTo(0, height);

      const color = colors[w];
      const offset = (w * Math.PI) / 2;
      const mouseInfluenceX = (curX / width - 0.5) * 50;
      const mouseInfluenceY = (curY / height - 0.5) * 40;

      for (let x = 0; x <= width; x += (width < 768 ? 10 : 14)) {
        const angle = (x / width) * 4 * Math.PI + time + offset + (mouseInfluenceX * 0.05);
        const y = Math.sin(angle) * (75 + w * 28) + (height * 0.40 + w * 45 + mouseInfluenceY);
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, height);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`);
      grad.addColorStop(0.7, `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a * 0.4})`);
      grad.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ─── 2. Cyber Mesh 3D Grid ──────────────────────────────
  function drawCyberMesh() {
    time += 0.016;
    const horizon = height * 0.45;
    const gridSpacing = width < 768 ? 28 : 40;
    const acc = getAccent();
    const lineAlpha = 0.42 * intensity;

    ctx.strokeStyle = `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${lineAlpha})`;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(width, horizon);
    ctx.stroke();

    const curX = mouse.active ? mouse.x : width * 0.5 + Math.sin(time * 0.8) * (width * 0.25);
    const vanishingX = curX;
    
    for (let x = -width; x <= width * 2; x += gridSpacing * 1.8) {
      ctx.beginPath();
      ctx.moveTo(vanishingX, horizon);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const offset = (time * 35) % gridSpacing;
    for (let y = horizon; y <= height; y += (y - horizon) * 0.18 + 8) {
      const actualY = y + offset * ((y - horizon) / (height - horizon));
      if (actualY <= height) {
        ctx.beginPath();
        ctx.moveTo(0, actualY);
        ctx.lineTo(width, actualY);
        ctx.stroke();
      }
    }
  }

  // ─── 3. Deep Space Starfield ────────────────────────────
  function drawStarfield() {
    const acc = getAccent();
    const curX = mouse.active ? mouse.x : width * 0.5 + Math.sin(time * 0.6) * (width * 0.3);
    const curY = mouse.active ? mouse.y : height * 0.5 + Math.cos(time * 0.4) * (height * 0.25);
    time += 0.01;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.x += s.vx;
      s.y += s.vy;

      if (s.x < 0) s.x = width;
      if (s.x > width) s.x = 0;
      if (s.y < 0) s.y = height;
      if (s.y > height) s.y = 0;

      const dx = s.x - curX;
      const dy = s.y - curY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 180) {
        const force = (180 - dist) / 180;
        s.x += (dx / dist) * force * 3.5;
        s.y += (dy / dist) * force * 3.5;
        s.alpha = Math.min(1, s.baseAlpha + force * 0.7);
      } else {
        s.alpha = s.baseAlpha;
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${s.alpha * intensity})`;
      ctx.fill();
    }
  }

  // ─── 4. Matrix Stream ───────────────────────────────────
  function drawMatrix() {
    ctx.fillStyle = isDarkMode ? 'rgba(10, 10, 20, 0.18)' : 'rgba(248, 248, 252, 0.18)';
    ctx.fillRect(0, 0, width, height);

    const acc = getAccent();
    ctx.font = `${width < 768 ? '12px' : '14px'} "JetBrains Mono", monospace`;
    ctx.fillStyle = `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${0.90 * intensity})`;

    for (let i = 0; i < matrixColumns.length; i++) {
      const col = matrixColumns[i];
      const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
      ctx.fillText(char, col.x, col.y);

      col.y += col.speed * 4;
      if (col.y > height && Math.random() > 0.975) {
        col.y = 0;
      }
    }
  }

  // ─── 5. Zen Radial Drift ────────────────────────────────
  function drawZen() {
    time += 0.007;
    const acc = getAccent();
    const curX = mouse.active ? mouse.x : width * 0.5 + Math.sin(time * 0.7) * (width * 0.25);
    const curY = mouse.active ? mouse.y : height * 0.5 + Math.cos(time * 0.5) * (height * 0.2);
    const centerX = width * 0.5 + (curX - width * 0.5) * 0.15;
    const centerY = height * 0.5 + (curY - height * 0.5) * 0.15;
    const maxRadius = Math.max(width, height) * 0.75;

    const pulse = Math.sin(time) * 55;
    const grad = ctx.createRadialGradient(
      centerX, centerY, 20,
      centerX, centerY, maxRadius + pulse
    );

    grad.addColorStop(0, `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${0.48 * intensity})`);
    grad.addColorStop(0.4, `rgba(56, 189, 248, ${0.28 * intensity})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // ─── 6. Constellation Particles ────────────────────────
  function drawParticles() {
    time += 0.008;
    const acc = getAccent();
    const len = constellationNodes.length;

    const curX = mouse.active ? mouse.x : width * 0.5 + Math.sin(time * 0.8) * (width * 0.35);
    const curY = mouse.active ? mouse.y : height * 0.45 + Math.cos(time * 0.6) * (height * 0.25);

    // Draw cursor / ambient aura spotlight
    const auraRadius = width < 768 ? 240 : 360;
    const grad = ctx.createRadialGradient(curX, curY, 0, curX, curY, auraRadius);
    grad.addColorStop(0, `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${0.42 * intensity})`);
    grad.addColorStop(0.5, `rgba(56, 189, 248, ${0.20 * intensity})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(curX, curY, auraRadius, 0, Math.PI * 2);
    ctx.fill();

    // Connect lines
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const p1 = constellationNodes[i];
        const p2 = constellationNodes[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.hypot(dx, dy);
        const maxDist = width < 768 ? 130 : 160;

        if (dist < maxDist) {
          let alpha = (1 - dist / maxDist) * 0.38 * intensity;
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const cursorDist = Math.hypot(curX - midX, curY - midY);
          if (cursorDist < 240) {
            alpha += (1 - cursorDist / 240) * 0.50 * intensity;
          }
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.strokeStyle = `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${alpha})`;
          ctx.lineWidth = 1.0;
          ctx.stroke();
        }
      }
    }

    // Update & draw nodes
    for (let i = 0; i < len; i++) {
      const p = constellationNodes[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -20) p.x = width + 20;
      if (p.x > width + 20) p.x = -20;
      if (p.y < -20) p.y = height + 20;
      if (p.y > height + 20) p.y = -20;

      p.pulsePhase += p.pulseSpeed;
      p.alpha = p.baseAlpha + Math.sin(p.pulsePhase) * 0.15;

      const dx = curX - p.x;
      const dy = curY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 220 && dist > 0) {
        const force = (1 - dist / 220);
        const angle = Math.atan2(dy, dx);
        p.x -= Math.cos(angle) * force * 1.6;
        p.y -= Math.sin(angle) * force * 1.6;
        p.radius = p.baseRadius * (1 + force * 1.4);
        p.alpha = Math.min(1, p.baseAlpha + force * 0.7);
      } else {
        p.radius += (p.baseRadius - p.radius) * 0.1;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${p.alpha * intensity})`;
      ctx.fill();
    }
  }

  // ─── Main Render Loop ───────────────────────────────────
  function render() {
    if (!isTabVisible) return;

    if (mouse.active) {
      mouse.x += (mouse.targetX - mouse.x) * 0.09;
      mouse.y += (mouse.targetY - mouse.y) * 0.09;
      mouse.speed *= 0.92;
    }

    if (ctx) {
      if (currentMode !== MODES.MATRIX) {
        ctx.clearRect(0, 0, width, height);

        // Draw deep ambient space atmosphere directly onto the canvas
        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        if (isDarkMode) {
          bgGrad.addColorStop(0, '#0c0c1a');
          bgGrad.addColorStop(0.5, '#080814');
          bgGrad.addColorStop(1, '#05050c');
        } else {
          bgGrad.addColorStop(0, '#f8f8fc');
          bgGrad.addColorStop(0.5, '#f0f0f8');
          bgGrad.addColorStop(1, '#e8e8f2');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);
      }

      switch (currentMode) {
        case MODES.AURORA:
          drawAurora();
          break;
        case MODES.CYBER_MESH:
          drawCyberMesh();
          break;
        case MODES.STARFIELD:
          drawStarfield();
          break;
        case MODES.MATRIX:
          drawMatrix();
          break;
        case MODES.ZEN:
          drawZen();
          break;
        case MODES.PARTICLES:
          drawParticles();
          break;
        case MODES.OLED:
          ctx.fillStyle = '#050508';
          ctx.fillRect(0, 0, width, height);
          break;
        default:
          drawAurora();
          break;
      }
    }

    animId = requestAnimationFrame(render);
  }

  function handleVisibility() {
    isTabVisible = document.visibilityState === 'visible';
    if (isTabVisible && !animId) {
      animId = requestAnimationFrame(render);
    }
  }

  function init() {
    initCanvas();
    window.addEventListener('resize', resize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', resize, { passive: true });
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    window.addEventListener('touchstart', onTouchMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onPointerLeave, { passive: true });
    window.addEventListener('touchcancel', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    const themeObserver = new MutationObserver(() => {
      checkTheme();
      initModeState();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-accent']
    });

    animId = requestAnimationFrame(render);
  }

  // Public Global API
  window.WoxBackground = {
    MODES,
    setMode: function (mode) {
      if (Object.values(MODES).includes(mode)) {
        currentMode = mode;
        localStorage.setItem('woxmail_bg_mode', mode);
        initModeState();
        if (ctx) ctx.clearRect(0, 0, width, height);
      }
    },
    getMode: function () {
      return currentMode;
    },
    setIntensity: function (val) {
      intensity = Math.max(0.1, Math.min(1.0, parseFloat(val) || 1.0));
      localStorage.setItem('woxmail_bg_intensity', String(intensity));
    },
    getIntensity: function () {
      return intensity;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
