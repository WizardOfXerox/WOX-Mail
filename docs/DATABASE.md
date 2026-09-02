# 🗄️ WoxMail PostgreSQL Database Architecture & Schema

> **PostgreSQL 16 Database Architecture** — 26 Applied Migrations powering sovereign identity, ephemeral mail, compliance journaling, zero-knowledge vaulting, and async outbox pipelines.

---

## 🗺️ Migration Timeline & Architecture

| Migration ID | File | Primary Subsystem | Key Tables & Alterations |
| :--- | :--- | :--- | :--- |
| `001` | `001_initial-schema.js` | Core Identity & Auth | `users`, `invite_codes`, `temp_addresses`, `user_sessions`, `login_history`, `audit_log`, `settings` |
| `002` | `002_seed-defaults.js` | Baseline Configuration | System settings seeding (`registration_enabled`, default retention policies) |
| `003` | `003_analytics-tables.js` | Telemetry & Health | `analytics_events`, `daily_stats`, `service_block_stats` |
| `004` | `004_additional-columns.js` | Profile Customization | Added `signature`, `avatar_url`, `theme`, `language`, `timezone` to `users` |
| `005` | `005_phase2-features.js` | Webmail Productivity | `contacts`, `scheduled_emails`, `snoozed_emails`, `email_aliases`, `email_filters`, `labels`, `email_labels` |
| `006` | `006_phase3-sms.js` | WoxSMS Telephony | `sms_messages`, `sms_numbers`, `sms_conversations` |
| `007` | `007_settings-columns.js` | Security & Auto-Reply | Added `forwarding_address`, `auto_reply_enabled`, `auto_reply_subject`, `auto_reply_body` |
| `008` | `008_screener_webhooks_reverse_aliases.js` | Screener & Gatekeeper | `screener_senders`, `screener_rules`, `webhooks`, `reverse_aliases` |
| `009` | `009_pgp_and_privacy.js` | PGP Zero-Knowledge Enclave | Added `pgp_public_key`, `pgp_private_key_encrypted`, `pgp_key_fingerprint`, `enforce_pgp` |
| `010` | `010_secure_locked_messages.js` | Burn-on-Read / Passcode | `secure_messages`, `secure_message_events` |
| `011` | `011_future_letters.js` | FutureMe Time Capsules | `future_letters` |
| `012` | `012_advanced_services.js` | Dead Man Switch & Calendar | `dead_man_switches`, `dead_man_checkins`, `calendar_events`, `campaigns`, `campaign_subscribers`, `rss_feeds` |
| `013` | `013_ephemeral_streams.js` | Real-time Burn Streams | `ephemeral_notes`, `ephemeral_streams` |
| `014` | `014_power_features.js` | Productivity & Blocklists | `blocked_ips`, `support_tickets`, `support_ticket_messages` |
| `015` | `015_temp_addresses_suspended_status.js` | Temp Mail Governance | Extended `temp_addresses.status` to support `suspended` |
| `016` | `016_future_letters_passcode_lock.js` | Sealed Time Capsules | Added `is_locked`, `passcode_hash`, `encrypted_body` to `future_letters` |
| `017` | `017_app_passwords.js` | Developer WoxAuth | `app_passwords` |
| `018` | `018_passkeys_webauthn.js` | FIDO2 / WebAuthn Biometrics | `passkey_credentials`, `passkey_challenges` |
| `019` | `019_user_notes_vault.js` | Encrypted Sticky Notes | `user_notes` |
| `020` | `020_outbox_system.js` | Undo Send & Async Outbox | `outbox_queue` |
| `021` | `021_connected_accounts_and_preferences.js` | Multi-Account & Unified Inbox | `connected_accounts`, `user_preferences` |
| `022` | `022_email_tracking_and_analytics.js` | Read Receipts & Open Tracking | `email_tracking_pixels`, `email_link_clicks` |
| `023` | `023_templates_and_kanban.js` | Inbox Kanban & Fast Templates | `email_templates`, `kanban_columns`, `kanban_cards` |
| `024` | `024_chat_forwarding_and_disposable.js` | Chat Gateways & Disposable Domains | `chat_forwarding_rules`, `disposable_domains` |
| `025` | `025_spam_learning_and_quotas.js` | Bayesian Filter & Storage Quotas | `spam_learning_tokens`, `storage_quotas` |
| `026` | `026_compliance_archive_journal.js` | Universal Compliance Vault | `compliance_archive` |

---

## 📋 Core Table Specifications

### 1. `users` — Sovereign Account Enclave
* `id` (`SERIAL PRIMARY KEY`): Unique user identifier.
* `email` (`TEXT UNIQUE NOT NULL`): Primary email address (`user@wox.world`).
* `username` (`TEXT UNIQUE NOT NULL`): Lowercase alphanumeric username.
* `password_hash` (`TEXT NOT NULL`): Argon2id password hash.
* `imap_password` (`TEXT NOT NULL`): Purelymail dedicated IMAP/SMTP mailbox password.
* `display_name` (`TEXT`): User display name.
* `is_admin` (`BOOLEAN DEFAULT FALSE`): System administrator flag.
* `otp_enabled` (`BOOLEAN DEFAULT FALSE`): TOTP two-factor authentication flag.
* `otp_secret` (`TEXT`): Base32 TOTP secret.
* `recovery_codes` (`TEXT`): JSON array of hashed single-use recovery codes.
* `is_suspended` (`BOOLEAN DEFAULT FALSE`): Account administrative lock flag.
* `pgp_public_key` / `pgp_private_key_encrypted` (`TEXT`): Client-encrypted PGP keypair.

### 2. `compliance_archive` — Domain-Wide Archival & Journaling Vault
* `id` (`SERIAL PRIMARY KEY`): Archive sequential index.
* `message_id` (`TEXT`): RFC 5322 Message-ID header or internal sequence key.
* `direction` (`VARCHAR(16) NOT NULL`): `inbound` or `outbound`.
* `mailbox_owner_id` (`INTEGER REFERENCES users(id)`): Mailbox account associated with event.
* `mailbox_owner_email` (`VARCHAR(255) NOT NULL`): Mailbox address for fast querying.
* `sender_address` (`VARCHAR(255) NOT NULL`): Envelope / header sender address.
* `sender_name` (`VARCHAR(255)`): Envelope / header sender name.
* `recipient_addresses` (`TEXT[] NOT NULL`): Array of primary `To` recipients.
* `cc_addresses` / `bcc_addresses` (`TEXT[]`): Carbon copy and blind carbon copy recipients.
* `subject` (`TEXT NOT NULL`): Message subject.
* `body_html` / `body_text` (`TEXT`): Full sanitized HTML and plaintext payload.
* `has_attachments` (`BOOLEAN DEFAULT FALSE`): Attachment indicator flag.
* `attachments` (`JSONB DEFAULT '[]'`): Attachment metadata array (filename, size, type).
* `headers` (`JSONB DEFAULT '{}'`): Captured RFC 5322 envelope headers.
* `ip_address` (`VARCHAR(64)`): Ingress / submission IP address.
* `provider` (`VARCHAR(64) DEFAULT 'woxmail'`): `woxmail`, `purelymail`, or `proton`.
* `checksum` (`VARCHAR(64) NOT NULL`): Cryptographic SHA-256 non-repudiation integrity hash `[direction|sender|to|subject|body|timestamp]`.
* `is_starred` (`BOOLEAN DEFAULT FALSE`): Compliance flagged item marker.
* `sent_or_received_at` (`TIMESTAMPTZ NOT NULL`): Timestamp of transmission or reception.
* `created_at` (`TIMESTAMPTZ DEFAULT NOW()`): Database record timestamp.

### 3. `support_tickets` & `support_ticket_messages` — Helpdesk Engine
* `ticket_number` (`TEXT UNIQUE`): Formatted identifier (e.g. `WOX-TK-00046`).
* `requester_email` (`TEXT NOT NULL`): Requester email address.
* `subject` (`TEXT NOT NULL`): Ticket subject title.
* `status` (`TEXT DEFAULT 'open'`): `open`, `in_progress`, `resolved`, `closed`.
* `priority` (`TEXT DEFAULT 'medium'`): `low`, `medium`, `high`, `urgent`.
* `category` (`TEXT DEFAULT 'general'`): `general`, `bug_report`, `feature_request`, `billing`, `abuse`.

### 4. `future_letters` — Time Capsule Vault
* `id` (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`): Unique letter identifier.
* `sender_email` / `recipient_email` (`TEXT NOT NULL`): Author and delivery destination.
* `delivery_date` (`TIMESTAMPTZ NOT NULL`): Scheduled release timestamp.
* `delivery_preset` (`VARCHAR(16)`): `1y`, `3y`, `5y`, `custom`.
* `is_locked` (`BOOLEAN DEFAULT FALSE`): Passcode lock indicator.
* `passcode_hash` (`TEXT`): Argon2id hash of opening passcode.
* `encrypted_body` (`TEXT`): AES-256-GCM cipher payload.
* `status` (`TEXT DEFAULT 'scheduled'`): `pending_verification`, `scheduled`, `delivered`.

### 5. `outbox_queue` — Undo Send & Async Dispatcher
* `id` (`SERIAL PRIMARY KEY`): Outbox queue index.
* `user_id` (`INTEGER REFERENCES users(id)`): Sending account.
* `status` (`VARCHAR(20) DEFAULT 'pending'`): `pending`, `cancelled`, `processing`, `sent`, `failed`.
* `undo_window_seconds` (`INTEGER DEFAULT 10`): Configured grace period duration.
* `send_after` (`TIMESTAMPTZ NOT NULL`): Release timestamp when message transitions to SMTP dispatch.

---

## 🔒 Integrity & Security Invariants

1. **Foreign Key Cascade Deletions**: Deleting a user safely cascades across `user_sessions`, `contacts`, `email_aliases`, `user_notes`, and `outbox_queue` without orphaned records.
2. **Immutable Compliance Journal**: The `compliance_archive` table is protected by sequential indexes and SHA-256 hash validation preventing silent record mutation.
3. **Database Migration Runner**: Handled via [`server/migrations/run.js`](file:///H:/Ideas/Mail/server/migrations/run.js) with transactional state tracking in the `migrations` metadata table.
