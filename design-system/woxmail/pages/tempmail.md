# Tempmail Page Overrides

> **PROJECT:** WoxMail
> **Generated:** 2026-08-21 13:03:44
> **Page Type:** General

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** 1200px (standard)
- **Layout:** Full-width sections, centered content

### Spacing Overrides

- No overrides — use Master spacing

### Typography Overrides

- No overrides — use Master typography

### Color Overrides

- No overrides — use Master colors

### Component Overrides

- Avoid: Block paste or require manual OTP transcription with no alternative
- **Copy Button Micro-Interaction**: One-click clipboard copy on address chips with instant visual tooltip confirmation (`Copied!`).
- **Live Message Badges**: Pulsing pill badges (`0 msg` in muted indigo, `1+ msg` in vibrant emerald `#10b981`) scaling with cubic-bezier transition when new messages land.

---

## Page-Specific Components

### 1. Public Temp Mail Directory (`.recent-pool-grid`)
- Responsive 2-column community directory displaying currently leased disposable addresses and active standby pool.
- One-click copy action for any directory address.
- Live message count badge showing real-time unread messages in that mailbox.

### 2. Real-Time Directory SSE Sync (`/api/tempmail/sse-directory`)
- Real-time Server-Sent Events listener that updates directory pills, new addresses, and message counters dynamically across all connected browsers without manual refresh.
- Includes manual "Refresh List" fallback button that triggers non-locking IMAP STATUS probes (`?sync=true`).

---

## Recommendations

- Effects: Minimal glow (text-shadow: 0 0 10px), dark-to-light transitions, low white emission, high readability, visible focus
- Security / Accessibility: Allow password managers and paste; offer passkeys OAuth or another non-cognitive method
