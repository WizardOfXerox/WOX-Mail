# 📘 WoxMail REST & Real-Time API Master Reference Manual

> **Version**: 1.0.0  
> **Server Base URL**: `https://mail.wox.world` (Production) | `http://localhost:3001` (Local Dev)  
> **Interactive Documentation**: [`/api/docs`](https://mail.wox.world/api/docs) or [`/docs`](https://mail.wox.world/docs)  
> **OpenAPI 3.1.0 Specification**: [`/api/docs/openapi.json`](https://mail.wox.world/api/docs/openapi.json)

---

## 📑 Table of Contents

1. [Authentication & Security Architecture](#1-authentication--security-architecture)
2. [Error Handling & Standard Responses](#2-error-handling--standard-responses)
3. [Rate Limiting Quotas](#3-rate-limiting-quotas)
4. [API Endpoints by Module](#4-api-endpoints-by-module)
   - [4.1 Authentication & 2FA (`/api/auth`)](#41-authentication--2fa-apiauth)
   - [4.2 Mailbox & Message Operations (`/api/mail`)](#42-mailbox--message-operations-apimail)
   - [4.3 Pre-Flight Recipient Email Verification (`/api/mail/verify-recipient`)](#43-pre-flight-recipient-email-verification)
   - [4.4 Application Passwords & SMTP App Codes (`/api/settings/app-passwords`)](#44-application-passwords--smtp-app-codes)
   - [4.5 User Settings & Security (`/api/settings`)](#45-user-settings--security-apisettings)
   - [4.6 Temporary / Disposable Mail (`/api/tempmail`)](#46-temporary--disposable-mail-apitempmail)
   - [4.7 Enclave Vault Secure Messages (`/api/secure`, `/api/mail/secure-messages`)](#47-enclave-vault-secure-messages)
   - [4.8 In-Inbox Ephemeral Vector Streams (`/api/ephemeral`)](#48-in-inbox-ephemeral-vector-streams-apiephemeral)
   - [4.9 Time Capsule Future Letters (`/api/futureme`)](#49-time-capsule-future-letters-apifutureme)
   - [4.10 The Gatekeeper / Cold Email Screener (`/api/screener`)](#410-the-gatekeeper--cold-email-screener-apiscreener)
   - [4.11 Sovereign Mass Broadcasts & Campaigns (`/api/campaigns`)](#411-sovereign-mass-broadcasts--campaigns-apicampaigns)
   - [4.12 Outbound Webhooks & Event Dispatcher (`/api/mail/webhooks`)](#412-outbound-webhooks--event-dispatcher)
   - [4.13 Privacy Reverse Aliases (`/api/aliases`, `/api/mail/reverse-aliases`)](#413-privacy-reverse-aliases)
   - [4.14 WoxSMS Android Device Bridge (`/api/sms`)](#414-woxsms-android-device-bridge-apisms)
   - [4.15 Notes & Annotations (`/api/notes`)](#415-notes--annotations-apinotes)
   - [4.16 Dead Man's Switch / Digital Inheritance (`/api/deadman`)](#416-dead-mans-switch--digital-inheritance-apideadman)
   - [4.17 WoxCalendar & iCal Engine (`/api/calendar`)](#417-woxcalendar--ical-engine-apicalendar)
   - [4.18 WoxAuth OpenID Connect & 2FA (`/api/woxauth`)](#418-woxauth-openid-connect--2fa-apiwoxauth)
   - [4.19 Developer CLI Gateway (`/api/cli`)](#419-developer-cli-gateway-apicli)
   - [4.20 Customer Support Desk (`/api/support`)](#420-customer-support-desk-apisupport)
   - [4.21 Verification Gateway (`/api/verify`)](#421-verification-gateway-apiverify)
   - [4.22 Autodiscover & Autoconfig (`/autodiscover`, `/.well-known`)](#422-autodiscover--autoconfig)
   - [4.23 Administrator & Domain Control (`/api/admin`)](#423-administrator--domain-control-apiadmin)
   - [4.24 System Health & Diagnostics (`/api/health`)](#424-system-health--diagnostics-apihealth)

---

## 1. Authentication & Security Architecture

WoxMail supports multiple authentication modes depending on whether requests originate from the web application, developer scripts, third-party mail clients, or temporary throwaway sessions:

### Authentication Schemes

| Scheme | Header / Cookie | Format / Example | Target Use Case |
|---|---|---|---|
| **JWT Access Token** | `Authorization: Bearer <token>` or cookie `woxmail_token` | Standard JWT HS256 signed string | Dashboard Web UI, SPA, Session management |
| **Application Passwords (App Codes)** | `Authorization: Bearer wox_app_...` or Basic Auth `username:wox_app_...` | `wox_app_xxxx-xxxx-xxxx-xxxx` | Thunderbird, Apple Mail, Python/Node scripts, CLI |
| **API Key** | `x-api-key: <key>` | Alphanumeric API key | CI/CD automation, server-to-server daemons |
| **Temp Mailbox Cookie** | Cookie `woxmail_temp=<encrypted_session>` | Encrypted session cookie | Anonymous disposable mailbox access |
| **CSRF Protection** | `x-csrf-token: <csrf_token>` | Cookie-to-Header double submit token | All state-mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`) |

---

## 2. Error Handling & Standard Responses

All API endpoints return standard HTTP status codes and JSON error objects:

```json
{
  "error": "Human-readable error description",
  "code": "OPTIONAL_ERROR_CODE",
  "details": {}
}
```

### Common Status Codes
- `200 OK`: Request completed successfully.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Malformed syntax, invalid parameters, or dead recipient MX.
- `401 Unauthorized`: Missing, expired, or revoked token / app password.
- `403 Forbidden`: Account suspended, insufficient permissions, or CSRF mismatch.
- `404 Not Found`: Resource (message, folder, contact, vault) does not exist.
- `409 Conflict`: Resource already exists (e.g. username taken).
- `410 Gone`: Vault message or temporary inbox has expired or self-destructed.
- `422 Unprocessable Entity`: Validation error on payload fields.
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Server exception.

---

## 3. Rate Limiting Quotas

- **Global API Limiter**: 100 requests / minute per IP.
- **Login Rate Limiter**: 10 attempts / 15 minutes per IP.
- **Temp Generation**: 10 new disposable mailboxes / hour per IP.
- **Daily Send Limit**: 500 outbound emails / day per user account.

---

## 4. API Endpoints by Module

### 4.1 Authentication & 2FA (`/api/auth`)

#### `POST /api/auth/register`

**Description**: Register a permanent @wox.world email account using an invite code.

**Authentication**: `Public (with CSRF token)`

**Request Body** (`application/json`):
```json
{
  "username": "alice",
  "password": "SecurePassword123!",
  "inviteCode": "INVITE-CODE-HERE",
  "displayName": "Alice"
}
```

**Success Response** (`HTTP 201`):
```json
{
  "message": "Account created successfully",
  "token": "jwt_token_string",
  "user": {
    "id": 1,
    "email": "alice@wox.world"
  }
}
```

**Example cURL**:
```bash
curl -X POST https://mail.wox.world/api/auth/register -H "Content-Type: application/json" -d '{"username":"alice","password":"SecurePassword123!","inviteCode":"CODE"}'
```

---

#### `POST /api/auth/login`

**Description**: Authenticate permanent user. Returns JWT token and sets secure session cookie.

**Authentication**: `Public (with CSRF token)`

**Request Body** (`application/json`):
```json
{
  "username": "alice@wox.world",
  "password": "SecurePassword123!",
  "otp": "123456"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "token": "jwt_token_string",
  "user": {
    "id": 1,
    "email": "alice@wox.world",
    "displayName": "Alice"
  }
}
```

**Example cURL**:
```bash
curl -X POST https://mail.wox.world/api/auth/login -H "Content-Type: application/json" -d '{"username":"alice@wox.world","password":"SecurePassword123!"}'
```

---

#### `GET /api/auth/me`

**Description**: Fetch profile and settings for currently authenticated user.

**Authentication**: `JWT Bearer / App Password`

**Success Response** (`HTTP 200`):
```json
{
  "user": {
    "id": 1,
    "email": "alice@wox.world",
    "displayName": "Alice",
    "theme": "dark",
    "signature": "--\\nAlice"
  }
}
```

**Example cURL**:
```bash
curl https://mail.wox.world/api/auth/me -H "Authorization: Bearer <token>"
```

---

#### `POST /api/auth/logout`

**Description**: Revoke active session token and clear cookies.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "message": "Logged out successfully"
}
```

**Example cURL**:
```bash
curl -X POST https://mail.wox.world/api/auth/logout -H "Authorization: Bearer <token>"
```

---

#### `POST /api/auth/2fa/setup`

**Description**: Generate TOTP secret and QR code URI for authenticator setup.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,..."
}
```

---

#### `POST /api/auth/2fa/verify`

**Description**: Confirm 6-digit TOTP code to activate 2FA and receive 10 emergency recovery codes.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "code": "582910"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "2FA activated",
  "recoveryCodes": [
    "1a2b-3c4d",
    "5e6f-7g8h"
  ]
}
```

---

#### `POST /api/auth/2fa/disable`

**Description**: Disable two-factor authentication.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "password": "CurrentPassword123!"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "2FA disabled successfully"
}
```

---


### 4.2 Mailbox & Message Operations (`/api/mail`)

#### `GET /api/mail/folders`

**Description**: List all IMAP folders (INBOX, Sent, Drafts, Trash, Spam, Archive, The Feed, Paper Trail) with total and unread message counts.

**Authentication**: `JWT Bearer / App Password`

**Success Response** (`HTTP 200`):
```json
{
  "folders": [
    {
      "name": "INBOX",
      "path": "INBOX",
      "specialUse": "\\Inbox",
      "messages": 55,
      "unseen": 0
    },
    {
      "name": "Sent",
      "path": "Sent",
      "specialUse": "\\Sent",
      "messages": 8,
      "unseen": 0
    },
    {
      "name": "Trash",
      "path": "Trash",
      "specialUse": "\\Trash",
      "messages": 0,
      "unseen": 0
    }
  ]
}
```

**Example cURL**:
```bash
curl https://mail.wox.world/api/mail/folders -H "Authorization: Bearer <token>"
```

---

#### `GET /api/mail/messages`

**Description**: Retrieve paginated messages from a mailbox folder with full-text search and filtering.

**Authentication**: `JWT Bearer / App Password`

**Query Parameters**:
| Parameter | Type | Required | Description |
|---|---|---|---|
| `folder` | `string` | No | Folder name (default: "INBOX") |
| `page` | `integer` | No | Page number (default: 1) |
| `limit` | `integer` | No | Items per page (default: 25, max: 100) |
| `search` | `string` | No | Search query for sender, subject, or body |
| `unread` | `boolean` | No | Filter unread messages only |
| `starred` | `boolean` | No | Filter starred messages only |

**Success Response** (`HTTP 200`):
```json
{
  "messages": [
    {
      "uid": 105,
      "subject": "Project Status",
      "from": {
        "name": "Bob",
        "address": "bob@example.com"
      },
      "date": "2026-08-23T20:00:00Z",
      "unread": false,
      "preview": "Here is the update..."
    }
  ],
  "total": 55,
  "page": 1,
  "limit": 25
}
```

**Example cURL**:
```bash
curl "https://mail.wox.world/api/mail/messages?folder=INBOX&page=1&limit=25" -H "Authorization: Bearer <token>"
```

---

#### `GET /api/mail/message/:uid`

**Description**: Fetch full message content by UID with sanitized HTML, attachments metadata, security badges, and link previews.

**Authentication**: `JWT Bearer / App Password`

**Query Parameters**:
| Parameter | Type | Required | Description |
|---|---|---|---|
| `folder` | `string` | No | Folder containing message (default: "INBOX") |

**Success Response** (`HTTP 200`):
```json
{
  "uid": 105,
  "subject": "Weekly Brief",
  "from": {
    "name": "Support",
    "address": "support@wox.world"
  },
  "html": "<p>Content</p>",
  "text": "Content",
  "attachments": []
}
```

**Example cURL**:
```bash
curl https://mail.wox.world/api/mail/message/105 -H "Authorization: Bearer <token>"
```

---

#### `POST /api/mail/send`

**Description**: Send outbound email via SMTP with pre-flight recipient MX verification and automatic Sent folder archival.

**Authentication**: `JWT Bearer / App Password`

**Request Body** (`application/json`):
```json
{
  "to": "recipient@example.com",
  "subject": "Quarterly Review",
  "html": "<p>Hello from WoxMail!</p>",
  "text": "Hello from WoxMail!",
  "cc": "manager@example.com",
  "attachments": [
    {
      "name": "report.pdf",
      "type": "application/pdf",
      "content": "base64_encoded_string"
    }
  ]
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Email sent successfully",
  "messageId": "<uuid@wox.world>"
}
```

**Example cURL**:
```bash
curl -X POST https://mail.wox.world/api/mail/send -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"to":"user@example.com","subject":"Hello","text":"Hi"}'
```

---

#### `POST /api/mail/reply`

**Description**: Reply or Reply-All to an existing message.

**Authentication**: `JWT Bearer / App Password`

**Request Body** (`application/json`):
```json
{
  "uid": 105,
  "folder": "INBOX",
  "html": "<p>Thanks for the update!</p>",
  "replyAll": false
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Reply sent",
  "messageId": "<uuid@wox.world>"
}
```

---

#### `POST /api/mail/forward`

**Description**: Forward an email with original and new attachments.

**Authentication**: `JWT Bearer / App Password`

**Request Body** (`application/json`):
```json
{
  "uid": 105,
  "folder": "INBOX",
  "to": "partner@example.com",
  "html": "<p>FYI see forwarded message below</p>"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Message forwarded successfully"
}
```

---

#### `POST /api/mail/batch`

**Description**: Execute bulk batch actions (archive, delete, markRead, markUnread, star, unstar, move, spam) on multiple messages.

**Authentication**: `JWT Bearer / App Password`

**Request Body** (`application/json`):
```json
{
  "action": "archive",
  "uids": [
    101,
    102,
    103
  ],
  "folder": "INBOX"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Batch action \"archive\" executed on 3 messages"
}
```

---

#### `GET /api/mail/message/:uid/eml`

**Description**: Download original, raw unaltered RFC822 .eml file stream.

**Authentication**: `JWT Bearer / App Password`

**Success Response** (`HTTP 200`):
```json
"Binary message/rfc822 stream"
```

---

#### `GET /api/mail/message/:uid/attachment/:index`

**Description**: Download message attachment by index.

**Authentication**: `JWT Bearer / App Password`

**Success Response** (`HTTP 200`):
```json
"Binary attachment file stream"
```

---


### 4.3 Pre-Flight Recipient Email Verification

#### `GET /api/mail/verify-recipient`

**Description**: Pre-flight recipient email check: validates RFC 5322 syntax, detects domain typos (e.g. gamil.com -> gmail.com), and resolves DNS MX records.

**Authentication**: `JWT Bearer / App Password`

**Query Parameters**:
| Parameter | Type | Required | Description |
|---|---|---|---|
| `email` | `string` | **Yes** | Recipient email address to verify |

**Success Response** (`HTTP 200`):
```json
{
  "valid": true,
  "email": "founder@gamil.com",
  "localPart": "founder",
  "domain": "gamil.com",
  "suggestion": "founder@gmail.com",
  "mxRecords": [
    {
      "exchange": "gmail-smtp-in.l.google.com",
      "priority": 5
    }
  ]
}
```

**Example cURL**:
```bash
curl "https://mail.wox.world/api/mail/verify-recipient?email=founder@gamil.com" -H "Authorization: Bearer <token>"
```

---

#### `POST /api/mail/verify-recipients`

**Description**: Batch pre-flight verification of multiple recipient emails before mass dispatch.

**Authentication**: `JWT Bearer / App Password`

**Request Body** (`application/json`):
```json
{
  "emails": [
    "alice@gmail.com",
    "bob@gamil.com",
    "dead@unroutable-fake-domain.xyz"
  ]
}
```

**Success Response** (`HTTP 200`):
```json
{
  "valid": false,
  "verifiedCount": 2,
  "invalidEmails": [
    {
      "email": "dead@unroutable-fake-domain.xyz",
      "reason": "Domain does not have active mail servers (MX)"
    }
  ],
  "suggestions": [
    {
      "original": "bob@gamil.com",
      "suggested": "bob@gmail.com"
    }
  ]
}
```

---


### 4.4 Application Passwords & SMTP App Codes (`/api/settings/app-passwords`)

#### `GET /api/settings/app-passwords`

**Description**: List all active application passwords generated for third-party email clients and developer automation scripts.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "appPasswords": [
    {
      "id": 1,
      "name": "Thunderbird Desktop",
      "prefix": "wox_app_8f93-4a1",
      "scopes": [
        "smtp:send",
        "imap:read",
        "api:access"
      ],
      "lastUsedAt": "2026-08-23T21:40:00Z",
      "createdAt": "2026-08-23T20:00:00Z"
    }
  ]
}
```

**Example cURL**:
```bash
curl https://mail.wox.world/api/settings/app-passwords -H "Authorization: Bearer <token>"
```

---

#### `POST /api/settings/app-passwords`

**Description**: Generate a new 16-character application password token formatted as `wox_app_xxxx-xxxx-xxxx-xxxx`.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "name": "Python Backup Daemon",
  "scopes": [
    "smtp:send",
    "imap:read",
    "api:access"
  ]
}
```

**Success Response** (`HTTP 201`):
```json
{
  "message": "Application password created successfully. Save this code now; it will not be displayed again.",
  "appPassword": {
    "id": 2,
    "name": "Python Backup Daemon",
    "token": "wox_app_a1b2-c3d4-e5f6-g7h8",
    "prefix": "wox_app_a1b2-c3d",
    "scopes": [
      "smtp:send",
      "imap:read",
      "api:access"
    ]
  }
}
```

**Example cURL**:
```bash
curl -X POST https://mail.wox.world/api/settings/app-passwords -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"Python Script"}'
```

---

#### `DELETE /api/settings/app-passwords/:id`

**Description**: Revoke and terminate an application password.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "message": "Application password revoked successfully"
}
```

**Example cURL**:
```bash
curl -X DELETE https://mail.wox.world/api/settings/app-passwords/2 -H "Authorization: Bearer <token>"
```

---


### 4.5 User Settings & Security (`/api/settings`)

#### `GET /api/settings/profile`

**Description**: Retrieve user profile, avatar, language, and theme preferences.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "profile": {
    "displayName": "Alice",
    "avatarUrl": "",
    "language": "en",
    "theme": "dark"
  }
}
```

---

#### `PUT /api/settings/profile`

**Description**: Update user profile preferences.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "displayName": "Alice Smith",
  "theme": "dark",
  "language": "en"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Profile updated"
}
```

---

#### `PUT /api/settings/password`

**Description**: Change user master password.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword123!"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Password changed successfully"
}
```

---

#### `GET /api/settings/sessions`

**Description**: List active user login sessions with IP address, browser user-agent, and login timestamp.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "sessions": [
    {
      "id": 1,
      "ipAddress": "127.0.0.1",
      "userAgent": "Mozilla/5.0...",
      "lastActiveAt": "2026-08-23T22:00:00Z",
      "isCurrent": true
    }
  ]
}
```

---

#### `DELETE /api/settings/sessions/:id`

**Description**: Revoke a specific active login session.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "message": "Session revoked"
}
```

---

#### `GET /api/settings/pgp`

**Description**: Get user OpenPGP public key and encryption configuration.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "pgpEnabled": true,
  "publicKey": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n..."
}
```

---

#### `POST /api/settings/pgp/generate`

**Description**: Generate a new OpenPGP Curve25519 keypair on demand.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "message": "New PGP keypair generated",
  "publicKey": "...",
  "privateKey": "...",
  "fingerprint": "A1B2..."
}
```

---


### 4.6 Temporary / Disposable Mail (`/api/tempmail`)

#### `POST /api/tempmail/generate`

**Description**: Lease a new ephemeral disposable email address from the pre-warmed pool on @mail.wox.world.

**Authentication**: `Public`

**Request Body** (`application/json`):
```json
{
  "customAlias": "my-custom-prefix",
  "expiryHours": 24,
  "password": "optional_password"
}
```

**Success Response** (`HTTP 201`):
```json
{
  "address": "my-custom-prefix@mail.wox.world",
  "expiresAt": "2026-08-24T22:00:00Z",
  "sessionToken": "enc_token"
}
```

**Example cURL**:
```bash
curl -X POST https://mail.wox.world/api/tempmail/generate -H "Content-Type: application/json" -d '{"expiryHours":24}'
```

---

#### `GET /api/tempmail/inbox/:address`

**Description**: Fetch all incoming messages in a disposable mailbox.

**Authentication**: `Temp Session Cookie or Public`

**Success Response** (`HTTP 200`):
```json
{
  "address": "quick-fox-4829@mail.wox.world",
  "messages": [
    {
      "uid": 1,
      "subject": "Verification Code",
      "from": "no-reply@github.com",
      "date": "2026-08-23T22:10:00Z",
      "preview": "Your code is 948210"
    }
  ]
}
```

**Example cURL**:
```bash
curl https://mail.wox.world/api/tempmail/inbox/quick-fox-4829@mail.wox.world
```

---

#### `GET /api/tempmail/sse/:address`

**Description**: Real-time Server-Sent Events (SSE) live push stream for instantaneous message arrival notifications.

**Authentication**: `Public`

**Success Response** (`HTTP 200`):
```json
"text/event-stream"
```

---

#### `GET /api/tempmail/message/:address/:uid`

**Description**: Read full content, sanitized HTML, and attachment links for a disposable email.

**Authentication**: `Temp Session Cookie or Public`

**Success Response** (`HTTP 200`):
```json
{
  "uid": 1,
  "subject": "Verification Code",
  "html": "<p>Your code is <b>948210</b></p>",
  "text": "Your code is 948210"
}
```

---

#### `POST /api/tempmail/extend`

**Description**: Extend the active lease lifetime of a temporary mailbox.

**Authentication**: `Temp Session Cookie`

**Request Body** (`application/json`):
```json
{
  "address": "quick-fox-4829@mail.wox.world",
  "additionalHours": 48
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Inbox lifetime extended",
  "expiresAt": "2026-08-26T22:00:00Z"
}
```

---

#### `DELETE /api/tempmail/delete/:address`

**Description**: Instantly purge and self-destruct temporary mailbox and all messages.

**Authentication**: `Temp Session Cookie`

**Success Response** (`HTTP 200`):
```json
{
  "message": "Mailbox destroyed"
}
```

---


### 4.7 Enclave Vault Secure Messages (`/api/secure`, `/api/mail/secure-messages`)

#### `POST /api/mail/secure-send`

**Description**: Send an AES-256-GCM encrypted confidential message with PIN code authorization and auto-self-destruct.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "to": "recipient@example.com",
  "subject": "Classified Report",
  "body": "Sensitive data...",
  "passcode": "748291",
  "expirationHours": 24,
  "maxViews": 1,
  "destroyAfterRead": true
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Confidential message created",
  "vaultId": "sec_8f93a10"
}
```

---

#### `GET /api/mail/secure-messages`

**Description**: List active confidential messages sent by the user with remaining view counts.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "messages": [
    {
      "id": "sec_8f93a10",
      "recipient": "recipient@example.com",
      "subject": "Classified Report",
      "viewsRemaining": 1,
      "expiresAt": "2026-08-24T22:00:00Z"
    }
  ]
}
```

---

#### `POST /api/secure/unlock`

**Description**: Public / Guest unlock endpoint: verifies PIN passcode, decrypts message, and burns upon viewing if max views reached.

**Authentication**: `Public`

**Request Body** (`application/json`):
```json
{
  "token": "sec_8f93a10",
  "passcode": "748291"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "html": "<p>Sensitive data...</p>",
  "viewsLeft": 0,
  "destroyed": true
}
```

---


### 4.8 In-Inbox Ephemeral Vector Streams (`/api/ephemeral`)

#### `POST /api/ephemeral/send`

**Description**: Render text into a dynamic SVG vector stream with anti-screenshot watermarks and 1-view burn mechanism.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "to": "partner@example.com",
  "subject": "One-Time Secret",
  "content": "Secret OTP: 98124",
  "expiryMinutes": 60
}
```

**Success Response** (`HTTP 200`):
```json
{
  "streamId": "stream_9f821",
  "messageId": "<uuid@wox.world>"
}
```

---

#### `GET /api/ephemeral/render/:streamId`

**Description**: Serves dynamic image/svg+xml vector representation with burning timer and view destruction.

**Authentication**: `Public`

**Success Response** (`HTTP 200`):
```json
"image/svg+xml stream"
```

---


### 4.9 Time Capsule Future Letters (`/api/futureme`)

#### `POST /api/futureme/create`

**Description**: Schedule an email into the future (up to 50 years) with optional passcode lock and delivery confirmation.

**Authentication**: `JWT Bearer or Public with token verification`

**Request Body** (`application/json`):
```json
{
  "recipientEmail": "myfuture@example.com",
  "deliverAt": "2030-01-01T00:00:00Z",
  "subject": "Letter to Future Me",
  "body": "Remember your goals...",
  "isPublic": false,
  "passcode": "9841"
}
```

**Success Response** (`HTTP 201`):
```json
{
  "letterId": 12,
  "deliverAt": "2030-01-01T00:00:00Z"
}
```

---

#### `GET /api/futureme/my-letters`

**Description**: List all future letters scheduled by the user.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "letters": [
    {
      "id": 12,
      "recipientEmail": "myfuture@example.com",
      "deliverAt": "2030-01-01T00:00:00Z",
      "isDelivered": false
    }
  ]
}
```

---


### 4.10 The Gatekeeper / Cold Email Screener (`/api/screener`)

#### `GET /api/screener/pending`

**Description**: Fetch quarantined senders waiting for user screening decision.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "senders": [
    {
      "senderEmail": "sales@coldvendor.com",
      "firstSeenAt": "2026-08-23T22:00:00Z",
      "messageCount": 1
    }
  ]
}
```

---

#### `POST /api/screener/decide`

**Description**: Decide disposition for a screened sender (inbox, feed, papertrail, or block).

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "senderEmail": "sales@coldvendor.com",
  "decision": "feed"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Decision saved"
}
```

---


### 4.11 Sovereign Mass Broadcasts & Campaigns (`/api/campaigns`)

#### `GET /api/campaigns`

**Description**: List all mass broadcast newsletter campaigns.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "campaigns": [
    {
      "id": 1,
      "name": "August Newsletter",
      "status": "sent",
      "recipientsCount": 1200,
      "sentCount": 1200
    }
  ]
}
```

---

#### `POST /api/campaigns`

**Description**: Create and dispatch a broadcast campaign with variable templating.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "name": "Product Update",
  "subject": "What is new in v2",
  "htmlContent": "<p>Hello {{name}}...</p>",
  "recipientListId": 1
}
```

**Success Response** (`HTTP 201`):
```json
{
  "id": 2,
  "status": "scheduled"
}
```

---


### 4.12 Outbound Webhooks & Event Dispatcher (`/api/mail/webhooks`)

#### `GET /api/mail/webhooks`

**Description**: List all registered outbound webhook subscriptions.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "webhooks": [
    {
      "id": 1,
      "url": "https://api.mycrm.com/inbound",
      "events": [
        "email.received"
      ],
      "isActive": true
    }
  ]
}
```

---

#### `POST /api/mail/webhooks`

**Description**: Register a new HTTPS webhook endpoint with HMAC-SHA256 secret.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "url": "https://api.mycrm.com/inbound",
  "events": [
    "email.received",
    "email.sent"
  ]
}
```

**Success Response** (`HTTP 201`):
```json
{
  "id": 2,
  "secret": "whsec_8f93a10b4c2e"
}
```

---


### 4.13 Privacy Reverse Aliases (`/api/aliases`, `/api/mail/reverse-aliases`)

#### `GET /api/mail/reverse-aliases`

**Description**: List active reverse relay alias mappings.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "aliases": [
    {
      "id": 1,
      "aliasAddress": "relay-9812@mail.wox.world",
      "targetEmail": "vendor@external.com"
    }
  ]
}
```

---

#### `POST /api/mail/reverse-aliases/create`

**Description**: Generate a two-way anonymous relay address to communicate with external parties without exposing real identity.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "targetEmail": "vendor@external.com",
  "label": "Ebay Seller"
}
```

**Success Response** (`HTTP 201`):
```json
{
  "aliasAddress": "relay-4820@mail.wox.world"
}
```

---


### 4.14 WoxSMS Android Device Bridge (`/api/sms`)

#### `GET /api/sms/devices`

**Description**: List paired Android bridge devices.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "devices": [
    {
      "id": 1,
      "name": "Pixel 9 Pro",
      "isOnline": true,
      "batteryLevel": 85
    }
  ]
}
```

---

#### `POST /api/sms/send`

**Description**: Send an SMS text message through a paired Android device bridge.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "to": "+1234567890",
  "message": "Hello from WoxSMS"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "SMS queued for device dispatch",
  "messageId": "sms_98120"
}
```

---


### 4.15 Notes & Annotations (`/api/notes`)

#### `GET /api/notes`

**Description**: List private user notes and email thread annotations.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "notes": [
    {
      "id": 1,
      "title": "Meeting notes",
      "content": "Discussed API release",
      "emailUid": 105
    }
  ]
}
```

---

#### `PUT /api/notes/:uid`

**Description**: Create or update note attached to an email message UID.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "content": "Follow up next Tuesday"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "message": "Note saved"
}
```

---


### 4.16 Dead Man's Switch / Digital Inheritance (`/api/deadman`)

#### `GET /api/deadman`

**Description**: Get Dead Man's Switch configuration, heartbeat status, and designated inheritors.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "enabled": true,
  "timeoutDays": 90,
  "lastCheckinAt": "2026-08-23T22:00:00Z",
  "daysRemaining": 90
}
```

---

#### `POST /api/deadman/checkin`

**Description**: Ping heartbeat to confirm user vitality and reset countdown.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "message": "Vitality confirmed. Countdown reset to 90 days."
}
```

---


### 4.17 WoxCalendar & iCal Engine (`/api/calendar`)

#### `GET /api/calendar/events`

**Description**: List user calendar events with start/end time filters.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "events": [
    {
      "id": 1,
      "title": "Team Sync",
      "startAt": "2026-08-24T10:00:00Z",
      "endAt": "2026-08-24T11:00:00Z"
    }
  ]
}
```

---

#### `POST /api/calendar/events`

**Description**: Create calendar event and send standard iCalendar (.ics) email invitations to participants.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "title": "Product Review",
  "startAt": "2026-08-25T14:00:00Z",
  "endAt": "2026-08-25T15:00:00Z",
  "attendees": [
    "colleague@example.com"
  ]
}
```

**Success Response** (`HTTP 201`):
```json
{
  "id": 2,
  "message": "Event created and invitations dispatched"
}
```

---


### 4.18 WoxAuth OpenID Connect & 2FA (`/api/woxauth`)

#### `GET /api/woxauth`

**Description**: List registered 2FA TOTP accounts in WoxAuth authenticator.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "accounts": [
    {
      "id": 1,
      "issuer": "GitHub",
      "accountName": "alice",
      "currentCode": "849102",
      "remainingSeconds": 18
    }
  ]
}
```

---


### 4.19 Developer CLI Gateway (`/api/cli`)

#### `POST /api/cli/auth`

**Description**: Device authorization flow challenge for the terminal CLI tool.

**Authentication**: `Public`

**Request Body** (`application/json`):
```json
{
  "deviceName": "MacBook Pro CLI"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "userCode": "WOX-9481",
  "verificationUrl": "https://mail.wox.world/cli/auth",
  "deviceCode": "dev_8f93a10"
}
```

---

#### `POST /api/cli/send`

**Description**: Ultra-fast headless email dispatch for terminal scripts and CI/CD pipelines.

**Authentication**: `API Key / App Password / Bearer Token`

**Request Body** (`application/json`):
```json
{
  "to": "ops@company.com",
  "subject": "Build Successful",
  "body": "CI Pipeline passed all 84 test suites."
}
```

**Success Response** (`HTTP 200`):
```json
{
  "status": "sent",
  "messageId": "<uuid@wox.world>"
}
```

---


### 4.20 Customer Support Desk (`/api/support`)

#### `GET /api/support/tickets`

**Description**: List user customer support tickets.

**Authentication**: `JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "tickets": [
    {
      "id": 1,
      "subject": "Domain MX Configuration",
      "status": "open",
      "createdAt": "2026-08-23T20:00:00Z"
    }
  ]
}
```

---

#### `POST /api/support/tickets`

**Description**: Open a new customer support ticket.

**Authentication**: `JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "subject": "Question regarding PGP import",
  "message": "How do I import my GPG key?"
}
```

**Success Response** (`HTTP 201`):
```json
{
  "id": 2,
  "message": "Ticket created"
}
```

---


### 4.21 Verification Gateway (`/api/verify`)

#### `POST /api/verify/start`

**Description**: Initiate third-party email verification challenge session.

**Authentication**: `Public`

**Request Body** (`application/json`):
```json
{
  "email": "user@example.com"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "sessionToken": "vtok_8f93a10",
  "expiresAt": "2026-08-23T22:30:00Z"
}
```

---

#### `POST /api/verify/confirm`

**Description**: Confirm 6-digit verification code sent to email.

**Authentication**: `Public`

**Request Body** (`application/json`):
```json
{
  "sessionToken": "vtok_8f93a10",
  "code": "849201"
}
```

**Success Response** (`HTTP 200`):
```json
{
  "verified": true,
  "message": "Email successfully verified"
}
```

---


### 4.22 Autodiscover & Autoconfig (`/autodiscover`, `/.well-known`)

#### `GET /mail/config-v1.1.xml`

**Description**: Mozilla Thunderbird auto-configuration XML endpoint for zero-configuration IMAP/SMTP setup.

**Authentication**: `Public`

**Success Response** (`HTTP 200`):
```json
"XML configuration file"
```

---

#### `GET /apple.mobileconfig`

**Description**: Apple iOS / macOS Mail configuration profile for 1-click native account provisioning.

**Authentication**: `Public`

**Success Response** (`HTTP 200`):
```json
"application/x-apple-aspen-config binary profile"
```

---


### 4.23 Administrator & Domain Control (`/api/admin`)

#### `GET /api/admin/stats`

**Description**: Server analytics, total permanent users, active temp mailboxes, queue depths, and storage volume.

**Authentication**: `Admin JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "stats": {
    "totalUsers": 42,
    "activeTempMailboxes": 18,
    "sentToday": 154,
    "storageUsedBytes": 4294967296
  }
}
```

---

#### `GET /api/admin/users`

**Description**: List all registered permanent users with quotas, admin status, and suspension controls.

**Authentication**: `Admin JWT Bearer`

**Success Response** (`HTTP 200`):
```json
{
  "users": [
    {
      "id": 1,
      "email": "admin@wox.world",
      "isAdmin": true,
      "isSuspended": false
    }
  ]
}
```

---

#### `POST /api/admin/invites`

**Description**: Generate new permanent user invite codes.

**Authentication**: `Admin JWT Bearer`

**Request Body** (`application/json`):
```json
{
  "count": 5,
  "note": "Beta testers"
}
```

**Success Response** (`HTTP 201`):
```json
{
  "codes": [
    "INVITE-A1B2-C3D4",
    "INVITE-E5F6-G7H8"
  ]
}
```

---


### 4.24 System Health & Diagnostics (`/api/health`)

#### `GET /api/health`

**Description**: Health check probe for load balancers and container orchestrators.

**Authentication**: `Public`

**Success Response** (`HTTP 200`):
```json
{
  "status": "ok",
  "uptime": 12450,
  "timestamp": "2026-08-23T22:15:00.000Z",
  "services": {
    "database": "ok",
    "redis": "in-memory-store"
  }
}
```

**Example cURL**:
```bash
curl https://mail.wox.world/api/health
```

---

