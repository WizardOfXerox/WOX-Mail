# 🏛️ WoxMail Architecture & Engineering Blueprint

> **High-Performance Hybrid MPA + React Islands Architecture, Purelymail IMAP/SMTP Gateway, Zero-Knowledge Privacy Enclave, and Compliance Infrastructure.**

---

## 1. System Topology & Ingress Architecture

```
                    ┌──────────────────────────────────────┐
                    │      Cloudflare Edge / Tor Onion     │
                    │   (DDoS Shield, SSL/TLS Termination) │
                    └──────────────────┬───────────────────┘
                                       │
                    ┌──────────────────▼───────────────────┐
                    │      Express Application Server      │
                    │         (Node.js 20+ Runtime)        │
                    └──────┬───────────┬────────────┬──────┘
                           │           │            │
            ┌──────────────▼─┐  ┌──────▼──────┐  ┌──▼──────────────┐
            │  PostgreSQL 16 │  │   Redis 7   │  │  Purelymail API │
            │  (Relational + │  │ (Rate Limit │  │  (Dedicated     │
            │   JSONB Vault) │  │  & Pub/Sub) │  │   IMAP / SMTP)  │
            └────────────────┘  └─────────────┘  └─────────────────┘
```

---

## 2. Rendering Strategy & Island Boundaries

| Page URL | Rendering Model | Client JS Footprint | Technologies & Core Purpose |
| :--- | :--- | :--- | :--- |
| `/` | SSR (EJS) | ~15 KB | Landing page, instant temp address claimer, mode selector |
| `/tempmail` | SSR (EJS) | ~18 KB | Public throwaway disposable inbox, SSE live updates |
| `/tempmail/personal` | SSR (EJS) | ~20 KB | Password-protected disposable mailboxes with retention up to 60 days |
| `/futureme` | SSR (EJS) | ~14 KB | Time capsule letters, delivery scheduling, public anonymous reflections |
| `/support` | SSR (EJS) | ~16 KB | Customer support ticket submission, live status lookups |
| `/login`, `/register` | SSR (EJS) | ~18 KB | Password auth, WebAuthn Passkeys biometric login, 2FA prompt |
| `/dashboard` | EJS Shell + React | ~190 KB (Gzip) | Full webmail client (J/K shortcuts, undo send, composer, search, PGP) |
| `/settings` | EJS Shell + React | ~45 KB (Gzip) | User security, passkeys, PGP keys, aliases, forwarding, sessions, vacation |
| `/admin` | EJS Shell + React | ~55 KB (Gzip) | User governance, standby pool replenishment, tickets, live terminal |
| `/.well-known/security.txt` | Static Text | 0 KB | RFC 9116 vulnerability disclosure and contact declarations |

---

## 3. Subsystem Architecture & Services

### A. Universal Compliance Journaling (`complianceArchiveService.js`)
* **Shadow Hook**: Every outbound dispatch (`/api/mail/send`, `/reply`, `/forward`, `/api/proton/send`, `/api/futureme`) and inbound synchronization is mirrored into `compliance_archive`.
* **Tamper-Evident Hashing**: Generates an immutable SHA-256 integrity checksum:
  $$\text{Checksum} = \text{SHA-256}(\text{direction} \parallel \text{sender} \parallel \text{recipients} \parallel \text{subject} \parallel \text{body} \parallel \text{timestamp})$$
* **Legal Vault Webmail View**: Logging into `archive@wox.world` renders the real-time compliance feed directly inside the webmail viewer with search and direction filtering.

### B. Interactive Support Desk Mailbox (`supportService.js`)
* **Ticket Parsing & Ingestion**: Background IMAP worker monitors `support@wox.world`, matches threads with `[WOX-TK-xxxxx]`, creates ticket records, and auto-acknowledges requests.
* **Support Console in Webmail**: Staff members logging into `support@wox.world` interact with support tickets as webmail messages, complete with status tags (`OPEN`, `RESOLVED`, `CLOSED`), priority indicators, and quick-reply composers.

### C. Passkeys & WebAuthn Authentication (`passkeyService.js`)
* **FIDO2 / WebAuthn**: Backed by `@simplewebauthn/server` for passwordless biometric and hardware security key login (TouchID, FaceID, Windows Hello, YubiKey).
* **Dual-Tier Fallback**: Graceful fallback to Argon2id hashed passwords with TOTP 2FA multi-factor recovery codes.

### D. Multi-Account & Proton Proxy Sync (`protonProxy.js`)
* **Account Switching**: Client account manager switches active sessions and identities without re-entering credentials.
* **Proton Bridge**: Custom alias mapping and outbound routing allowing ProtonMail users to send from secondary aliases (`@pm.me`, `@protonmail.com`, custom domains).

### E. Undo Send State Machine & Outbox Pipeline (`outboxService.js`)
* **Grace Period Buffer**: Configurable 5s to 30s cancellation window before SMTP transmission.
* **Queue Invariant**: Emails reside in `outbox_queue` with status `pending`. If not cancelled within the window, the background worker dispatches via SMTP and transitions status to `sent`.

---

## 4. Background Job Daemons (11 Periodic Cron Tasks)

| Task | Cadence | Handler / Service | Purpose |
| :--- | :--- | :--- | :--- |
| **Verification Reply Ingestion** | Every 1m | `inboundReplyJob.js` | Dual-mode inbound email reply verification |
| **Campaign Batch Dispatcher** | Every 10s | `campaignService.js` | Dispatches pending marketing and RSS broadcasts |
| **Support Inbound Poller** | Every 3m | `supportIngestionJob.js` | Ingests unread emails on `support@wox.world` |
| **Dead Man's Switch Heartbeat** | Every 5m | `deadManService.js` | Checks inactive switch thresholds & dispatches warnings |
| **FutureMe Delivery Worker** | Every 1m | `futureLetterService.js` | Unseals and dispatches scheduled time-capsule letters |
| **Scheduled Send Worker** | Every 1m | `schedulerService.js` | Sends emails scheduled for future time slots |
| **Snooze Unsnoozer** | Every 1m | `snoozeService.js` | Restores snoozed emails back to INBOX |
| **Calendar Reminders** | Every 5m | `calendarService.js` | Dispatches upcoming calendar notification emails |
| **Standby Pool Replenisher** | Every 15m | `pool.js` | Cycles stale unclaimed temp mailboxes & maintains buffer |
| **Daily Cleanup** | Midnight | `cleanup.js` | Purges expired sessions, temp mailboxes, and audit logs |
| **Nightly Analytics Aggregator** | 03:00 AM | `analytics-aggregate.js` | Computes daily throughput and delivery statistics |
| **Database Snapshot Backup** | 04:00 AM | `backup.js` | Runs `pg_dump` and rotates retention cycles |
