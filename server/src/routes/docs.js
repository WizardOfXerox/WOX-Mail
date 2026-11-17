/**
 * @fileoverview Interactive Developer API Documentation Portal.
 * Serves the OpenAPI 3.1.0 specification and self-contained interactive documentation UI.
 */

import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();
const openapiPath = path.join(__dirname, '..', 'docs', 'openapi.json');

/**
 * GET /api/docs/openapi.json
 * Return raw OpenAPI 3.1.0 JSON specification.
 */
router.get('/openapi.json', (req, res) => {
  try {
    if (fs.existsSync(openapiPath)) {
      const spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));
      res.json(spec);
    } else {
      res.status(404).json({ error: 'OpenAPI specification not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed loading OpenAPI spec', details: err.message });
  }
});

/**
 * GET /api/docs or /docs
 * Serve interactive documentation UI.
 */
router.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WoxMail REST API Reference & Interactive Portal</title>
  <script>
    (function() {
      try {
        var t = localStorage.getItem('woxmail_theme') || 'dark';
        var isLight = t === 'light' || (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
        document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
        var a = localStorage.getItem('woxmail_accent') || 'purple';
        document.documentElement.setAttribute('data-accent', a);
      } catch (e) {}
    })();
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root, [data-accent='purple'] {
      --color-primary: #7c3aed;
      --color-primary-light: #8b5cf6;
      --color-primary-subtle: rgba(124, 58, 237, 0.14);
      --color-primary-border: rgba(124, 58, 237, 0.35);
      --color-on-primary: #ffffff;
    }
    [data-accent='emerald'] {
      --color-primary: #10b981;
      --color-primary-light: #34d399;
      --color-primary-subtle: rgba(16, 185, 129, 0.14);
      --color-primary-border: rgba(16, 185, 129, 0.35);
    }
    [data-accent='cobalt'] {
      --color-primary: #3b82f6;
      --color-primary-light: #60a5fa;
      --color-primary-subtle: rgba(59, 130, 246, 0.14);
      --color-primary-border: rgba(59, 130, 246, 0.35);
    }
    [data-accent='amber'] {
      --color-primary: #f59e0b;
      --color-primary-light: #fbbf24;
      --color-primary-subtle: rgba(245, 158, 11, 0.14);
      --color-primary-border: rgba(245, 158, 11, 0.35);
    }
    [data-accent='cyan'] {
      --color-primary: #06b6d4;
      --color-primary-light: #22d3ee;
      --color-primary-subtle: rgba(6, 182, 212, 0.14);
      --color-primary-border: rgba(6, 182, 212, 0.35);
    }
    [data-accent='crimson'] {
      --color-primary: #ef4444;
      --color-primary-light: #f87171;
      --color-primary-subtle: rgba(239, 68, 68, 0.14);
      --color-primary-border: rgba(239, 68, 68, 0.35);
    }
    [data-accent='oled'] {
      --color-primary: #e5e7eb;
      --color-primary-light: #f3f4f6;
      --color-primary-subtle: rgba(229, 231, 235, 0.14);
      --color-primary-border: rgba(229, 231, 235, 0.35);
      --color-on-primary: #09090b;
    }
    :root {
      --color-bg-page: #0b0b14;
      --color-bg-sidebar: #121222;
      --color-bg-card: #19192f;
      --color-bg-elevated: #22223d;
      --color-border: #282846;
      --color-text-primary: #f0f0f5;
      --color-text-secondary: #9898b8;
      --color-text-tertiary: #686890;
      --color-code-text: #cbd5e1;
      --color-pill-bg: rgba(255, 255, 255, 0.06);
      --color-card-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      --color-success: #22c55e;
      --color-warning: #f59e0b;
      --color-error: #ef4444;
      --font-body: 'Inter', -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --radius-pill: 9999px;
    }
    [data-theme='dark'][data-accent='oled'] {
      --color-bg-page: #000000;
      --color-bg-sidebar: #07070b;
      --color-bg-card: #0c0c12;
      --color-bg-elevated: #14141d;
    }
    [data-theme='light'] {
      --color-bg-page: #f4f4f8;
      --color-bg-sidebar: #ffffff;
      --color-bg-card: #ffffff;
      --color-bg-elevated: #f0f0f6;
      --color-border: #e2e2ea;
      --color-text-primary: #1a1a2e;
      --color-text-secondary: #52526d;
      --color-text-tertiary: #71718a;
      --color-code-text: #1e293b;
      --color-pill-bg: rgba(26, 26, 46, 0.06);
      --color-card-shadow: 0 4px 16px rgba(15, 23, 42, 0.06);
    }
    [data-theme='light'][data-accent='oled'] {
      --color-primary: #18181b;
      --color-primary-light: #3f3f46;
      --color-primary-subtle: rgba(24, 24, 27, 0.08);
      --color-primary-border: rgba(24, 24, 27, 0.25);
      --color-on-primary: #ffffff;
    }
    [data-theme='light'] .method-get { color: #1d4ed8; }
    [data-theme='light'] .method-post { color: #15803d; }
    [data-theme='light'] .method-put { color: #b45309; }
    [data-theme='light'] .method-delete { color: #b91c1c; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-body);
      background: var(--color-bg-page);
      color: var(--color-text-primary);
      line-height: 1.6;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .header {
      background: var(--color-bg-sidebar);
      border-bottom: 1px solid var(--color-border);
      padding: 0.85rem 1.75rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      color: var(--color-text-primary);
      text-decoration: none;
      font-weight: 700;
      font-size: 1.15rem;
    }
    .badge {
      background: var(--color-primary-subtle);
      color: var(--color-primary);
      border: 1px solid var(--color-primary-border);
      padding: 0.2rem 0.55rem;
      border-radius: var(--radius-pill);
      font-size: 0.75rem;
      font-weight: 600;
    }
    .header-links {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }
    .header-links a {
      color: var(--color-text-secondary);
      text-decoration: none;
      font-size: 0.875rem;
      font-weight: 500;
      transition: color 150ms ease;
    }
    .header-links a:hover { color: var(--color-text-primary); }
    .docs-theme-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.75rem;
      border-radius: var(--radius-pill);
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 150ms ease, background 150ms ease;
    }
    .docs-theme-btn:hover { border-color: var(--color-primary); }

    .main-container {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .sidebar {
      width: 330px;
      background: var(--color-bg-sidebar);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .sidebar-search {
      padding: 1rem;
      border-bottom: 1px solid var(--color-border);
    }
    .search-input {
      width: 100%;
      background: var(--color-bg-page);
      border: 1px solid var(--color-border);
      padding: 0.6rem 0.85rem;
      border-radius: var(--radius-md);
      color: var(--color-text-primary);
      font-size: 0.875rem;
      outline: none;
      transition: border-color 150ms ease;
    }
    .search-input:focus { border-color: var(--color-primary); }
    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 0.75rem;
    }
    .nav-group-title {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-tertiary);
      padding: 0.85rem 0.5rem 0.35rem 0.5rem;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0.65rem;
      border-radius: var(--radius-sm);
      color: var(--color-text-secondary);
      text-decoration: none;
      font-size: 0.82rem;
      cursor: pointer;
      transition: all 120ms ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .nav-item:hover, .nav-item.active {
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
    }
    .method-tag {
      font-family: var(--font-mono);
      font-size: 0.65rem;
      font-weight: 700;
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      text-transform: uppercase;
      flex-shrink: 0;
    }
    .method-get { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .method-post { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); }
    .method-put { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .method-delete { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }

    .content-area {
      flex: 1;
      overflow-y: auto;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    .endpoint-card {
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: 1.75rem;
      box-shadow: var(--color-card-shadow);
    }
    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }
    .endpoint-path {
      font-family: var(--font-mono);
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }
    .endpoint-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--color-text-primary);
      margin-bottom: 0.5rem;
    }
    .endpoint-desc {
      color: var(--color-text-secondary);
      font-size: 0.95rem;
      margin-bottom: 1.5rem;
    }
    .section-title {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-tertiary);
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .code-block {
      background: var(--color-bg-page);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 1rem;
      font-family: var(--font-mono);
      font-size: 0.82rem;
      color: var(--color-code-text);
      overflow-x: auto;
      position: relative;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.5rem;
      font-size: 0.85rem;
    }
    th, td {
      text-align: left;
      padding: 0.6rem 0.85rem;
      border-bottom: 1px solid var(--color-border);
    }
    th {
      color: var(--color-text-secondary);
      font-weight: 600;
      background: var(--color-bg-elevated);
    }
    td { color: var(--color-text-primary); }
    .mono-pill {
      font-family: var(--font-mono);
      background: var(--color-pill-bg);
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-size: 0.78rem;
    }
    @media (max-width: 768px) {
      body {
        height: auto;
        overflow-y: auto;
      }
      .header {
        padding: 0.75rem 1rem;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }
      .header-links {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        font-size: 0.8125rem;
      }
      .main-container {
        flex-direction: column;
        height: auto;
        overflow: visible;
      }
      .sidebar {
        width: 100% !important;
        border-right: none;
        border-bottom: 1px solid var(--color-border);
        max-height: 220px;
        overflow-y: auto;
      }
      .content-area {
        padding: 1rem !important;
        overflow: visible;
      }
      .endpoint-card {
        padding: 1.15rem 0.85rem !important;
      }
      .endpoint-header {
        gap: 0.4rem;
      }
      .endpoint-path {
        font-size: 0.875rem;
        word-break: break-all;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <a href="/dashboard" class="brand">
      <span>✉️ WoxMail</span>
      <span class="badge">REST API Reference</span>
    </a>
    <div class="header-links">
      <a href="/dashboard">Dashboard</a>
      <a href="/tempmail">Temp Mail</a>
      <a href="/api/docs/openapi.json" target="_blank">OpenAPI JSON</a>
      <a href="/docs">Docs</a>
      <button type="button" id="docsThemeToggle" class="docs-theme-btn" aria-label="Toggle Light/Dark theme">Theme</button>
    </div>
  </header>

  <div class="main-container">
    <aside class="sidebar">
      <div class="sidebar-search">
        <input type="text" id="searchInput" class="search-input" placeholder="Search API endpoints...">
      </div>
      <div class="sidebar-nav" id="sidebarNav"></div>
    </aside>

    <main class="content-area" id="contentArea">
      <div style="color: var(--color-text-secondary); text-align: center; padding: 2rem;">Loading API documentation...</div>
    </main>
  </div>

  <script>
    (function() {
      var btn = document.getElementById('docsThemeToggle');
      function syncLabel() {
        if (!btn) return;
        var cur = document.documentElement.getAttribute('data-theme') || 'dark';
        btn.textContent = cur === 'light' ? 'Dark Mode' : 'Light Mode';
      }
      syncLabel();
      if (btn) {
        btn.addEventListener('click', function() {
          var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', next);
          try { localStorage.setItem('woxmail_theme', next); } catch (e) {}
          syncLabel();
        });
      }
    })();
  </script>
  <script src="/js/api-docs.js"></script>
  <script src="/js/interactive-bg.js" defer></script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
