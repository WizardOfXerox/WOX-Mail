# WoxMail Master Progression Tracker

**Status:** ✅ MASTER IMPLEMENTATION 100% COMPLETE & VERIFIED  
**Suite:** Next-Gen Power, Campaign & Support Suite (13 Components Across 7 Phases)

---

## 📊 Overall Progress: 100% Complete

```
[██████████████████████████████] Phase 1: 100% | Phase 2: 100% | Phase 3: 100% | Phase 4: 100% | Phase 5: 100% | Phase 6: 100% | Phase 7: 100%
```

---

## Phase 1: Database Migration & Core Backend Services (✅ 100% Completed)
- [x] **014_power_features.js Migration**: Tables for `email_notes`, `mailing_lists`, `subscribers`, `campaigns`, `support_tickets`, `ticket_messages`, `support_ticket_seq`.
- [x] **Migration Execution**: Database migration executed and validated against PostgreSQL.
- [x] **`notes.js` Route**: AES-256-CBC encrypted sticky notes on email threads with per-user key derivation.
- [x] **`gatekeeper.js` Route**: HEY-grade sender screening endpoints (`/api/screener/pending`, `/decide`, `/rules`).
- [x] **`campaignService.js`**: Mailing lists, subscriber import, mail merge, throttled SMTP dispatch, RFC 8058 1-click unsubscribe.
- [x] **`campaigns.js` Route**: Campaign lifecycle, lists, subscribers, test emails, broadcast trigger, and public web form endpoints.
- [x] **`supportService.js`**: Ticket number generator (`WOX-TK-XXXXX`), email auto-acknowledgement from `support@wox.world`, conversation threads.
- [x] **`supportIngestionJob.js`**: Background IMAP worker auto-converting inbound emails to tickets.
- [x] **`support.js` Route**: User & Admin API endpoints for support tickets.
- [x] **`scheduler.js` Update**: Campaign batch dispatcher (every 10s) and support email ingestion (every 2min).
- [x] **`server.js` Route Mounts**: Register `/api/notes`, `/api/screener`, `/api/campaigns`, `/api/support`.
- [x] **`mail.js` Snooze & Batch Enhancements**: `POST /api/mail/snooze`, `GET /api/mail/snoozed`, `DELETE /api/mail/snooze/:id`, multi-select batch actions (including archive & spam), and advanced multi-dimensional search filters.

---

## Phase 2: Batch Selection Ribbon & Dual Split-Pane Layout Engine (✅ 100% Completed)
- [x] **`SnoozePopover.jsx`**: Floating popover for preset snooze timings (Later Today, Tomorrow Morning, Tomorrow Afternoon, Next Week, Custom DateTime).
- [x] **`SplitDivider.jsx`**: Draggable resizable split divider with visual grip, bounds clamping (20%-80%), keyboard arrows, and touch support.
- [x] **`BatchToolbar.jsx` Upgrade**: Added Snooze popover trigger, select-all / clear, and slide-down entry animation.
- [x] **`MessageList.jsx` Wiring**: Multi-select integration with BatchToolbar, active filter banner, and snippet previews. Embedded layout switcher (`List`, `Split`, `Rows`) and Dock toggle into header with 0 empty gaps.
- [x] **`MessageView.jsx` Embedded Mode**: Integrated embedded mode for split layout and private sticky notes panel.
- [x] **`App.jsx` Layout State**: 3-mode switcher (`list`, `vertical`, `horizontal`), split pane resizing, keyboard shortcuts (`Ctrl+1/2/3`, `Ctrl+.`).
- [x] **`globals.css` Styling**: Flexbox split containers, resize cursor handles, compact horizontal table rows, mobile breakpoints, and batch ribbons.

---

## Phase 3: Superhuman Command Palette & Advanced Filter Chips & Private Sticky Notes (✅ 100% Completed)
- [x] **`CommandPalette.jsx` Upgrade**: Dynamic folder jumps, live unread badges, search operators, snippets, and frequency sorting with localStorage weighting.
- [x] **`SearchBar.jsx` Filter Chips & Modal**: Quick chips (`Attachments`, `Unread`, `Starred`, `Past 7d`, `Past 30d`) and Advanced Search modal.
- [x] **`MessageView.jsx` Sticky Notes UI**: Encrypted note editor, 5-color palette, auto-save, and visual sticky card.

---

## Phase 4: Rich-Text WYSIWYG Composer & HEY Gatekeeper Visual Quarantine (✅ 100% Completed)
- [x] **`SchedulePopover.jsx`**: Presets for schedule send (Tomorrow 8 AM, Afternoon 1 PM, Monday, Custom).
- [x] **`ComposeModal.jsx` Upgrade**: WYSIWYG ribbon (Bold, Italic, Underline, Strike, Lists, Quotes, Code, Links, Clear), HTML generation, Schedule Send split button.
- [x] **`GatekeeperView.jsx`**: Visual quarantine queue with 4-way triage (Let In, Feed, Paper Trail, Block), domain rules, approved sender management.
- [x] **`Sidebar.jsx` Enhancements**: Gatekeeper pending count badge, Campaigns link, Support Desk trigger, and removal of public terminal link.

---

## Phase 5: Companion Productivity Dock, Newsletter Studio & Support Desk UI (✅ 100% Completed)
- [x] **`CompanionDock.jsx`**: Right-side dock with 4 tabs (Agenda/Calendar, Markdown Scratchpad with auto-save, Contacts quick compose, TempMail quick generator).
- [x] **`CampaignsView.jsx`**: Mailing list management, CSV import with column mapping, campaign dashboard, analytics cards.
- [x] **`CampaignComposer.jsx`**: Newsletter designer with merge tags (`{{first_name}}`, `{{last_name}}`, `{{email}}`, `{{unsubscribe_url}}`), live preview, test send.
- [x] **`SupportModal.jsx`**: User helpdesk portal, ticket status tracker, live thread view, built-in client diagnostics tool.
- [x] **`AdminTickets.jsx`**: Admin triage board, filters (status, category, priority), internal staff notes, status transitions.
- [x] **`admin/App.jsx` Ultra-Modern Overhaul**: Transformed into full-screen SaaS command center with structured sidebar navigation, live status beacon, executive KPI cards, breadcrumbs, and auth redirection.

---

## Phase 6: Production CLI Package & Admin Developer Web Terminal (✅ 100% Completed)
- [x] **`woxmail` CLI Package Rewrite (`bin/woxmail.js`)**: Full modular framework with `bin/lib/` (config, auth, api, formatter).
- [x] **`package.json` Bin Registration**: `"bin": { "woxmail": "./bin/woxmail.js" }`.
- [x] **Removed Terminal from Public Nav**: Purged terminal links from `base.ejs`, `Sidebar.jsx`, `CommandPalette.jsx`.
- [x] **Auth-Guarded `/terminal` Route**: Restrict to authenticated super-admins only.
- [x] **`AdminTerminal.jsx`**: Embedded terminal tab in Admin Dashboard with command history, autocomplete, output copying, and quick chips.
- [x] **`cli.js` Route Expansion**: 30+ admin & power-user commands (users, pool, tickets, campaigns, audit, sql, diagnostics).

---

- [x] **Microsoft Outlook Autodiscover**: `/autodiscover/autodiscover.xml` (POX XML) and `/autodiscover/autodiscover.json` (Office 365 JSON v1.0).
- [x] **Apple iOS & macOS 1-Click Profile**: `/api/autodiscover/mobileconfig` serving `application/x-apple-aspen-config` for 1-tap iPhone/Mac mailbox configuration.
- [x] **BIMI SVG Tiny-PS Brand Logo**: Deployed vector brand logo at `/logo.svg` and `/brand/logo.svg` with Cloudflare DMARC & BIMI DNS alignment.
- [x] **Mobile Setup UI**: Added **"Mobile & Mail App Setup"** card in Settings ([`/settings#autoconfig`](https://mail.wox.world/settings#autoconfig)).
- [x] **Adversarial Master Audit (`test_all_features_adversarial.cjs`)**: Executed 39 automated adversarial stress tests covering all 14 core modules, boundary conditions, anti-caching headers, and crypto primitives (39/39 passing, 100% success rate).

---

---

## Phase 10: Admin User Management Suite & Real-Time Mailbox Impersonation (✅ 100% Completed)
- [x] **1-Click "Open Inbox" Impersonation**: Built `POST /api/admin/users/:id/impersonate` and `GET /api/admin/impersonate/:id` generating secure 1-hour access tokens, allowing administrators to open and inspect any user's webmail inbox directly in a new tab without knowing their password.
- [x] **Comprehensive User CRUD Engine**: Added `POST /api/admin/users` (creates PostgreSQL record and provisions Purelymail mailbox), `PUT /api/admin/users/:id` (edits username, email, display name, roles, status), `DELETE /api/admin/users/:id` (purges user account & mailbox), and `POST /api/admin/users/:id/reset-password` (admin password reset with instant copyable credentials & session revocation).
- [x] **Full-Featured Admin User Management UI**:
  - **Toolbar**: Added `+ Create New User` button and real-time live search filter.
  - **Action Row Suite**: Added `📬 Open Inbox`, `🔑 Reset PW`, `✏️ Edit`, `🚫 Suspend/Unsuspend`, and `🗑️ Delete` actions per user row.
  - **Interactive Modals**: Built `CreateUserModal`, `EditUserModal`, `ResetPasswordModal` (with strong password generator), and `DeleteUserModal` (with typed confirmation).
- [x] **Centered Email View & Balanced Proportions**: Wrapped message reader elements in `.viewer-content-wrapper` (`max-width: 1000px; margin: 0 auto;`), eliminating awkward dead spaces on ultrawide displays.
- [x] **Fixed Dock Button Clipping**: Integrated the Dock trigger (`✨`) directly into the compact message list layout toolstrip, ensuring 0 horizontal overflow or clipped borders.

---

## Phase 11: Dual-Mode Email Verification & Admin Impersonation Session Shield (✅ 100% Completed)
- [x] **Dual-Mode Verification Engine (`server/src/services/verificationService.js`)**:
  - Implemented 6-digit PIN code + VERP reply-to (`verify+<token>@wox.world`) email dispatch.
  - Inbound reply parsing via background IMAP worker (`inboundReplyJob.js` running every 10s).
  - Real-time WebSocket broadcasting (`verification_success`) for instant zero-click modal advances.
  - Integrated into **Secondary Recovery Email linking**, **Double Opt-In Newsletters**, and **High-Security Step-Up actions** (100% verified via `test_dual_mode_verification.cjs`).
- [x] **Admin Impersonation Session Shield & Exit Banner**:
  - Automatically preserves original admin session in `woxmail_admin_backup` cookie when clicking **"Open Inbox"**.
  - Added public exit route `GET /api/admin/impersonate/exit` to seamlessly restore the admin cookie.
  - Rendered top amber Impersonation Banner in `client/src/dashboard/App.jsx` with 1-click **"↩️ Exit & Return to Admin"** button.
- [x] **Mailbox Email Deletion (`server/src/routes/mail.js`)**:
  - Added `DELETE /api/mail/message/:uid` supporting both Trash move and permanent deletion.
  - Added real-time deletion toast notifications (`Deleted X message(s)`).
  - Verified 100% passing across all impersonation and exit flows (`test_impersonation_fix.cjs`).

---

## Phase 12: Admin Deep Diagnostics, Database Snapshots, Backups & Control Center Suite (✅ 100% Completed)
- [x] **Cluster Diagnostics Suite (`server/src/routes/admin.js` -> `GET /api/admin/diagnostics/full`)**:
  - Live PostgreSQL health check with latency telemetry (`XXms`), database storage size, and table row counts (`users`, `temp_addresses`, `invites`, `blocked_ips`, `audit_logs`, `service_controls`, `announcements`).
  - Node.js runtime memory telemetry (Heap Used, Heap Total, RSS, PID, Platform, Uptime).
  - Mail server routing check (Permanent domain, Disposable domain, IMAP/SMTP host & port status, Purelymail API connection).
  - Background Cron Jobs monitor (11 active scheduled background daemons).
- [x] **1-Click Database Snapshot & Backup Center**:
  - **1-Click Database Export (JSON)**: `GET /api/admin/diagnostics/export-snapshot` streams complete database state as a portable, structured JSON export.
  - **Trigger Snapshot Backup**: `POST /api/admin/backups/create` creates point-in-time snapshot archives saved in `/backups`.
  - **Download Backups**: `GET /api/admin/backups/download/:filename` for 1-click download of stored archives.
  - **Database Vacuum & Optimization**: `POST /api/admin/diagnostics/vacuum` executes `VACUUM ANALYZE` with live duration reporting.
  - **Cache Flush**: `POST /api/admin/diagnostics/flush-cache` purges in-memory and Redis caches.
- [x] **Broadcast Services & Domain Firewall Rules UI**:
  - Real-time management of sender domain firewall rules (PayPal, Discord, Steam, Google, etc.).
  - 1-click permission toggles across **Public Disposable**, **Personal Temp**, and **Permanent Webmail** tiers.
  - Inline rule creator for new third-party sender domains.
- [x] **Global System Governance Settings Tab**:
  - Interactive configuration editor for platform-wide registration policies, invite-only mode, rate limiters, and disposable email TTL limits with live persistence (`PUT /api/admin/settings`).
- [x] **Global Announcements Broadcast Tab**:
  - System-wide alert publisher with priority badges (ℹ️ Info, ⚠️ Warning, 🛠️ Maintenance) and live deletion controls.
- [x] **Automated Test Suite (`test_admin_diagnostics_suite.cjs`)**: 100% passing across all diagnostics, snapshot exports, vacuum maintenance, backup creation, firewall rules, and announcement broadcasting.

---

## Phase 13: Attachment Previews, Compose Redesign & Invitation Overhaul (✅ 100% Completed)
- [x] **Interactive Attachment Previews & Downloads**:
  - **Backend Streaming Endpoints**: Added `GET /api/mail/message/:uid/attachment/:index` and `GET /api/tempmail/message/:address/:uid/attachment/:index` with automatic MIME typing and `inline` / `attachment` streaming.
  - **Clickable Attachment Cards**: In `MessageView.jsx`, replaced inert pills with interactive cards displaying file-type icons (🖼️ Images, 📑 PDFs, 📝 Text/Data/Logs, 🎵 Audio, 🎬 Video, 📦 Archives), formatted file sizes, and 1-click preview and download actions.
  - **In-App Lightbox Preview Modal (`AttachmentPreviewModal.jsx`)**:
    - High-res image viewer with zoom controls (50% to 300%).
    - In-app PDF reader iframe.
    - Formatted text/code/data pre viewer with 1-click **📋 Copy Content** button.
    - Media player for audio and video.
    - Safe binary download fallback.
- [x] **Compose Modal UI & Form Redesign (`ComposeModal.jsx` + `style.css`)**:
  - Restyled `To:`, `Cc:`, `Bcc:`, and `Subject:` fields with borderless dark input themes, focus rings, and clear typography.
  - Styled `+ Cc/Bcc` toggle as an interactive badge pill.
  - Redesigned `TRANSMISSION SECURITY` segmented control buttons (`Standard`, `🔐 Enclave Vault`, `🔥 In-Inbox Burner`, `⚡ Auto-Expunge`) with active glowing purple badges.
  - Upgraded rich text formatting ribbon toolbar (`B`, `I`, `U`, `S`, `• List`, `1. List`, `” Quote`, `</>`, `🔗 Link`, `🧹 Clear`) with glassmorphic button styling.
  - Fixed full-width contenteditable email body area with proper line-height and padding.
- [x] **Registration Invitation Codes Overhaul (`/admin#invites`)**:
  - **Accurate Metadata**: Updated `GET /api/admin/invites` to deliver true status (`is_used`, `used_by_username`, `used_by_email`, `used_at`, `expires_at`, `note`).
  - **Segmented Sub-Views**: Split into **🟢 Available Unused**, **👤 Claimed & Used (Registered Users)**, and **All Records**.
  - **1-Click Sharing**: Added direct **📋 Copy Code** and **🔗 Copy 1-Click Register URL** (`https://mail.wox.world/register?invite=WOX-...`).
  - **Revocation Protocol**: Revoking an unused code deletes it immediately and prevents registration (`"Invalid or expired invite code"`).
- [x] **Public Directory Privacy Hardening**:
  - Removed `Export Inbox` button from the community public temp mail directory to protect user privacy.

---

## Phase 14: User Directory Personal Temp Mail & Multi-Tier Management (✅ 100% Completed)
- [x] **Unified User Directory Engine (`server/src/routes/admin.js` -> `GET /api/admin/users`)**:
  - Combined `users` (Permanent Webmail `@wox.world`) and `temp_addresses` (Personal Temp Mail `@mail.wox.world` + Public Pools) in a unified, searchable, paginated directory with live tier summary counts.
  - Added filter tabs: **🌐 All Accounts**, **💼 Permanent Webmail**, **⏳ Personal Temp Mail**, and **⚡ Active Public Pool**.
  - Added visual tier badges (`👑 SUPER ADMIN`, `💼 PERMANENT`, `⏳ PERSONAL TEMP`, `⚡ PUBLIC DISPOSABLE`) and real-time expiration countdown badges (e.g. `28d 14h left`).
- [x] **Full Administrative Actions for Personal Temp Accounts**:
  - **📬 Open Inbox**: Impersonates personal temp accounts via `GET /api/admin/impersonate/temp/:address` with session backup shield (`woxmail_admin_backup`), opening their temporary inbox in a separate tab without logging out the admin.
  - **🔑 Reset PW**: Enables 1-click password resets for Personal Temp mailboxes directly from the User Directory.
  - **✏️ Edit**: Edit username, display name, and details.
  - **🚫 Suspend / Unsuspend**: Implemented suspension state with database check constraint migration (`015_temp_addresses_suspended_status.js`).
  - **🗑️ Delete Account**: Purges personal temp mailbox from both PostgreSQL and Purelymail server.
- [x] **Admin Account Creation Suite (`CreateUserModal.jsx`)**:
  - Added **Account Tier Selector** allowing admins to create either **💼 Permanent Webmail Accounts** or **⏳ Personal Temp Mail Accounts** with configurable lifespans (24h, 7d, 30d, 60d).
---

## Phase 15: Universal Compliance Journaling, Multi-Account Enclave & Security Protocol Hardening (✅ 100% Completed)
- [x] **Universal Compliance Archiving (`archive@wox.world`)**: Database migration `026_compliance_archive_journal`, real-time SHA-256 non-repudiation integrity hashing across all domain inbound/outbound traffic, and dedicated compliance webmail viewer.
- [x] **Interactive Support Desk Mailbox (`support@wox.world`)**: Helpdesk streaming in webmail with ticket categories, priority indicators, conversation threading, and quick replies.
- [x] **FutureMe Automated Dispatcher & Journaling**: Verification emails and scheduled time-capsule deliveries from `FutureMe Time Capsule <noreply@wox.world>` with automatic compliance archiving.
- [x] **RFC 9116 `security.txt` Vulnerability Disclosure**: Published at `/.well-known/security.txt` and `/security.txt`.
- [x] **RFC 5321 Autodiscover Profiles**: Mozilla XML, Microsoft Outlook POX, and Apple `.mobileconfig` auto-provisioning.
- [x] **Master Test Matrix (42 Suites)**: 42/42 test suites passing with 100% success rate across unit, service, API, daemon, and Playwright E2E browser tests.

---

## Phase 16: Next-Gen Email Intelligence, Controlled Attachments & Sovereign Productivity Suite (✅ 100% Completed)
- [x] **Controlled Secure Attachments (AES-256-GCM Vault)**:
  - Custom view limits (1 view, 3 views, unlimited).
  - Custom download restrictions (view-only / 0 downloads, 1 download, unlimited).
  - Sandboxed in-browser viewer with dynamic vector watermarking (recipient email + timestamp).
  - Automatic lockout / asset burn upon limit exhaustion.
  - Real-time view and download alerts pushed to the sender over WebSockets.
- [x] **Advanced Interaction & Link Tracking**:
  - Outbound link wrapping with signed redirect proxies (`/api/analytics/click/:token`).
  - Multi-open timeline and dwell telemetry.
  - Real-time notification alerts on open and click.
- [x] **Automated Follow-Up Reminders ("Bump If No Reply")**:
  - Configurable reminder buffers (2 days, 3 days, 1 week, custom date).
  - Automatic thread resurfacing when unreplied.
  - Auto-cancellation upon recipient reply detection via incoming mail hooks.
- [x] **Pre-Flight Deliverability & Spam Score Inspector**:
  - 0-100 score analyzing spam trigger words, HTML-to-text balance, uppercase density, and broken URLs.
- [x] **Recipient Intelligence & Contact Dossier**:
  - Companion Dock side-panel with contact interaction history, open rate, response speed, and recipient local timezone clock.
- [x] **Remote Message & Attachment Revocation**:
  - 1-click remote kill-switch for sent confidential messages and attachments.
- [x] **Smart Snippets & WYSIWYG Macro Expansion**:
  - Slash command macros (`/intro`, `/meeting`, `/pricing`) in composer and dock manager.

---

### Phase 17: Enterprise Protocols, Context Menus, Link Sandboxing, Sieve Engine & Cloudflare R2 Backups (✅ 100% Completed)
- [x] **`Ctrl+C` / `Cmd+C` Clipboard Copy Fix & Shortcut Isolation**:
  - Decoupled modifier shortcuts in `useKeyboard` (`client/src/shared/hooks.js`). Native clipboard operations (`Ctrl+C`, `Ctrl+V`, `Ctrl+X`, `Ctrl+A`) are preserved while single-key `c` triggers Compose only when not typing or selecting text.
- [x] **Contextual Right-Click & Mobile Long-Press Menu System**:
  - `ContextMenu.jsx`: Dual-mode floating glassmorphic context menu for desktop + slide-up Action Sheet for mobile touch devices.
  - Attached to mailbox rows in `MessageList.jsx` and hyperlinks, attachments, and text selections in `MessageView.jsx`.
- [x] **Email Viewer Security & Privacy Settings Modal**:
  - `EmailPrivacyModal.jsx`: Encrypted backend image IP proxy, layout-preserving spy-pixel deflection, remote web font blocker, credential form disarmer, homograph/punycode shield, and trusted senders whitelist.
- [x] **Safe Link Isolation Sandbox (Remote Browser Isolation & Reader View)**:
  - `linkSandboxService.js` and `/api/security`: Headless Playwright snapshots, SSL health audits, marketing redirect stripper, and sanitized script-free DOM reader view.
- [x] **Office & Document Previewer Extension**:
  - `AttachmentPreviewModal.jsx`: Sanitized in-browser previews for `.docx`, `.xlsx`, `.pptx`, `.csv`, `.log`, and on-demand client-side SHA-256 integrity inspection.
- [x] **Cloudflare R2 & Local Mailbox Backup Engine**:
  - `backupService.js`: S3/R2 AWS SigV4 client for automated and manual encrypted `.mbox` / `.zip` backups to Cloudflare R2 bucket (`woxmail-backups`).
- [x] **Server-Side Sieve Rule Engine (RFC 5228)**:
  - `sieveService.js`: Inbound email rule evaluator with auto-sorting, auto-tagging, auto-purging, and Discord/Slack/Telegram webhook forwarding.
- [x] **One-Click List-Unsubscribe Automation Daemon (RFC 8058)**:
  - `unsubscribeService.js`: Background HTTP POST and mailto unsubscribe dispatcher.
- [x] **Zero-Knowledge Blind Index Search Engine**:
  - `zeroKnowledgeSearchService.js`: HMAC-SHA256 blind token indexing for searching encrypted mailboxes without server-side plaintext exposure.
- [x] **OpenPGP Web Key Directory (WKD) Discovery (RFC 9216)**:
  - `wkdService.js`: Serves `/.well-known/openpgpkey` for automatic key exchange with ProtonMail and Thunderbird.
- [x] **MTA-STS & DANE Outbound Policy Inspector**:
  - `mtaStsService.js`: Validates recipient domain TLS policies to prevent downgrade attacks.
- [x] **Real-Time DNS Health Diagnostic Probe (DoH)**:
  - `dnsHealthService.js`: Live DoH inspection of MX, SPF, DKIM, DMARC, MTA-STS, WKD, and BIMI records.
- [x] **JMAP Protocol Engine (RFC 8620 / RFC 8621)**:
  - `jmapService.js`: High-performance JSON batch synchronization endpoint.
- [x] **Database Migration 028**:
  - `028_sieve_rules_and_search_index.js` executed on PostgreSQL with tables for Sieve rules, blind search index, user privacy preferences, and mailbox backups.
- [x] **Automated Test Matrix Verification**:
  - All **47 test suites** passed with a 100% success rate (0 failures).

---

### Phase 18: Native Cross-Platform Client Ecosystem
- [ ] **Native iOS & macOS Client (Swift / SwiftUI)**:
  - Powered by MailCore 2 C++ engine with local SQLite full-text search (FTS5), Face ID / Touch ID biometrics, and background IMAP IDLE push.
- [ ] **Native Android Client (Kotlin / Jetpack Compose)**:
  - Powered by MailCore 2 (JNI) with battery-optimized background sync, encrypted offline storage, and notification channels.
- [ ] **Native Desktop Client (Electron / Tauri / C#)**:
  - Cross-platform desktop application with system tray integration, offline cache, and hardware security key support.

---

### Phase 19: Sovereign Identity & Decentralized Communications
- [ ] **WoxAuth Decentralized Identity (DID / Passkeys Federation)**:
  - Universal passwordless identity protocol for third-party web apps.
- [ ] **Decentralized PGP Key Directory & Auto-Exchange**:
  - Automatic Web Key Directory (WKD) and HKP keyserver integration for zero-friction end-to-end PGP email exchange.
- [ ] **ActivityPub & Federation Bridge**:
  - Bridge email threads with decentralized social streams and sovereign newsletter feeds.







