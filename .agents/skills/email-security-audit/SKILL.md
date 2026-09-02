---
name: email-security-audit
description: "Audits and enforces email security standards, RFC 5322 compliance, SMTP/IMAP protocol sanitization, SVG/HTML sanitization, tracking pixel deflection, and safe attachment sandboxing."
---

# Email Security Audit & Protocol Standards

## 1. Email Sanitization Standards
- Neutralize all <script>, <iframe>, <object>, <embed>, <form> tags.
- Allow rich HTML styles, tables, headings, paragraphs, safe SVG, and images.
- Strip zero-pixel and 1x1 tracking beacons to protect user IP and location privacy.
- Enforce target="_blank" and rel="noopener noreferrer" on all external links.
- Sandboxed iframe with explicit high-contrast theme canvas.
