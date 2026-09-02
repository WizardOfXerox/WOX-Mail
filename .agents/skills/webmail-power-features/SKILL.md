---
name: webmail-power-features
description: "Design and implement high-efficiency webmail features including keyboard shortcuts (J/K navigation, R refresh, N new, C copy, Esc close), live search filters, split-pane reading, and offline caching."
---

# Webmail Power Features & Productivity

## 1. Keyboard Shortcuts Spec
- J / Down: Select next email
- K / Up: Select previous email
- Enter: Open highlighted email
- Esc / Backspace: Return to inbox list
- R: Refresh inbox immediately with visual feedback
- N: Generate new address
- C: Copy active email address to clipboard
- /: Focus search filter bar

## 2. Real-Time Capabilities
- Hybrid SSE event stream + 30s background auto-sync polling.
- Zero layout shift when updating inbox counts in background.
