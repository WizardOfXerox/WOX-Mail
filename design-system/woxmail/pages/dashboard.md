# Dashboard Page Overrides

> **PROJECT:** WoxMail
> **Generated:** 2026-08-21 13:03:45
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1400px or full-width
- **Grid:** 12-column grid for data flexibility

### Spacing Overrides

- **Content Density:** High — optimize for information display

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- No overrides — use Master colors

### Component Overrides

- **Live Sync Indicator (`.live-sync-indicator`)**:
  - Displays `● Live Sync` badge in message list header toolbar.
  - Indicator dot: 8px diameter, `#10b981` (Emerald), animated with continuous soft pulse (`pulse-emerald 2s infinite`).
  - Tooltip: "Real-time updates active via WebSocket".
- **Lite Mode Action Button (`.lite-mode-toggle`)**:
  - Quick-switch pill button in toolbar (`⚡ Lite Mode` / `⚡ Lite Active`).
  - Visual state: Active state glows with amber accent (`rgba(245, 158, 11, 0.2)` border).
  - Syncs with `localStorage.getItem('woxmail_low_resource')` and applies `[data-low-resource="true"]` to document root.

---

## Page-Specific Components

### 1. Companion Dock (`.companion-dock`)
- Collapsible bottom-right floating glass panel with 4 tabs: Burner (TempMail), Copilot, Notes, and Activity Feed.
- Real-time burner tab integrates direct Server-Sent Events (`/api/tempmail/sse/:address`) for zero-latency incoming disposable mail arrival.
- Shows dynamic unread count badge (`Burner (N)`) with emerald glow when incoming burner mail is received.

### 2. Low Resource Mode Engine (`[data-low-resource="true"]`)
- **Shader Suppression**: Background interactive Three.js/Canvas shader loop is completely unmounted.
- **Glassmorphism Elimination**: Removes all GPU-costly `backdrop-filter: blur(...)` effects, replacing panels with opaque, crisp dark neutrals (`#0f172a`, `#1e293b`).
- **Animation & Transition Bypass**: Suppresses keyframe animations, glows, and transitions (`transition: none !important; animation: none !important;`).
- **Data Saver Mode**: Remote tracking pixels and external image URLs are blocked by default in email view panes until explicitly requested.
- **Network Awareness**: Automatically activates when `navigator.connection.saveData === true` or effective connection type is `2g` or `3g`.

---

## Standalone Zero-Bundle Ultra-Lite Interface (`/lite`, `/m`)
- Target size: `< 15 KB` complete page payload.
- Server-rendered HTML/CSS directly via EJS template without bundling React, Vite, or client-side JavaScript.
- Full IMAP folder browsing, email message reader, and native SMTP form POST composer (`/lite/send`).

---

## Recommendations

- Effects: Hover tooltips, chart zoom on click, row highlighting on hover, smooth filter animations, data loading spinners (suppressed when in Low Resource Mode)
