# 📡 WoxMail REST API & Real-Time Gateway Reference

> **Base URL**: `http://localhost:3001/api` (Production: `https://mail.wox.world/api`)  
> **Interactive OpenAPI Portal**: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

---

## 🔐 Authentication & Security Schemes

WoxMail supports three primary authentication schemes:

1. **JWT Bearer Token / Cookie**:
   - Header: `Authorization: Bearer <token>`
   - Cookie: `woxmail_token=<jwt>` (HttpOnly, Secure, SameSite=Lax)
2. **Developer Application Password**:
   - Header: `Authorization: Bearer wox_app_xxxx-xxxx-xxxx-xxxx` (or HTTP Basic Auth)
3. **Temp Mail Session Cookie**:
   - Cookie: `woxmail_temp=<session_token>`

---

## 📑 Core REST Endpoints Matrix

### 1. Authentication & Passkeys (`/api/auth`, `/api/auth/passkeys`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Create account with invite code & captcha |
| `POST` | `/api/auth/login` | Public | Password login (returns JWT or 2FA ticket) |
| `POST` | `/api/auth/verify-otp` | Public | Complete 2FA login with TOTP code |
| `POST` | `/api/auth/logout` | User | Revoke session and clear authentication cookies |
| `GET` | `/api/auth/me` | User | Get authenticated user profile & permissions |
| `POST` | `/api/auth/passkeys/register-options` | User | Generate FIDO2 registration challenge |
| `POST` | `/api/auth/passkeys/register-verify` | User | Verify and save WebAuthn passkey credential |
| `POST` | `/api/auth/passkeys/auth-options` | Public | Generate passwordless passkey login challenge |
| `POST` | `/api/auth/passkeys/auth-verify` | Public | Complete passwordless login with biometric assertion |

### 2. Webmail & Outbox Pipeline (`/api/mail`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/mail/inbox` | User | Fetch paginated inbox (auto-routes compliance for `archive@` and tickets for `support@`) |
| `GET` | `/api/mail/folder/:name` | User | Fetch messages from a specific folder (`Sent`, `Trash`, `Archive`, `Drafts`, `The Feed`, `Paper Trail`) |
| `GET` | `/api/mail/message/:uid` | User | Retrieve sanitized email message by UID |
| `POST` | `/api/mail/send` | User | Send or queue message (with undo-send delay buffer) |
| `POST` | `/api/mail/undo-send/:outboxId` | User | Cancel queued message before SMTP transmission |
| `POST` | `/api/mail/reply` | User | Send inline reply within existing thread |
| `POST` | `/api/mail/forward` | User | Forward message with attachments |
| `POST` | `/api/mail/schedule` | User | Schedule email for future delivery time |
| `POST` | `/api/mail/snooze` | User | Temporarily hide message until specified time |

### 3. Disposable Temp Mail (`/api/tempmail`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/tempmail/session` | Public | Check active temp mail cookie status |
| `POST` | `/api/tempmail/claim` | Public | Instantly claim standby pool address (&lt;5ms) |
| `POST` | `/api/tempmail/generate-custom` | Public | Provision custom username address on-demand |
| `GET` | `/api/tempmail/inbox/:address` | Public | Fetch live messages from IMAP for temp address |
| `GET` | `/api/tempmail/sse/:address` | Public | Server-Sent Events stream for instant real-time incoming mail |
| `DELETE` | `/api/tempmail/delete/:address` | Public | Explicitly purge disposable mailbox |

### 4. Support Desk API (`/api/support`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/support/ticket` | Public | Submit new customer support request |
| `GET` | `/api/support/ticket/:ticketNumber` | Public | Track ticket status and conversation thread |
| `POST` | `/api/support/ticket/:ticketNumber/reply` | Public/Staff | Post reply to existing support ticket thread |
| `GET` | `/api/support/tickets` | Admin/Staff | List and filter all platform support tickets |

### 5. FutureMe Time Capsule API (`/api/futureme`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/futureme/letter` | Public/User | Create scheduled letter to the future |
| `GET` | `/api/futureme/verify/:token` | Public | Verify guest email address and seal time capsule |
| `GET` | `/api/futureme/public` | Public | List anonymous community public letters |
| `POST` | `/api/futureme/letter/:id/unlock` | Public | Unlock passcode-sealed letter payload |

### 6. Proton Proxy Bridge (`/api/proton`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/proton/addresses` | User | List configured ProtonMail aliases and subdomains |
| `POST` | `/api/proton/send` | User | Outbound send via custom Proton alias with compliance journaling |

### 7. Autodiscovery & RFC Standards (`/`, `/api/autodiscover`, `/.well-known`)

| Method | Endpoint | Auth | Standard / Protocol |
| :--- | :--- | :--- | :--- |
| `GET` | `/mail/config-v1.1.xml` | Public | Mozilla Thunderbird Autoconfig XML (RFC 5321) |
| `POST` / `GET` | `/autodiscover/autodiscover.xml` | Public | Microsoft Outlook POX Autodiscover XML |
| `GET` | `/api/autodiscover/apple.mobileconfig` | Public | Apple iOS / iPadOS / macOS Profile |
| `GET` | `/.well-known/security.txt` | Public | RFC 9116 Vulnerability Disclosure Policy |
| `GET` | `/api/health` | Public | Real-time system health and service status |
