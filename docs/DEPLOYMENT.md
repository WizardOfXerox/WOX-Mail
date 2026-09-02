# WoxMail — Deployment Guide

## Prerequisites

- **Node.js** 20+ (LTS)
- **Docker Desktop** (for PostgreSQL + Redis)
- **Cloudflare account** (free tier)
- **cloudflared** CLI installed
- **Purelymail** account with API token
- Domain: `wox.world` (permanent) + `mail.wox.world` (temp)

---

## Local Stack

### 1. Start Database & Cache

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL 16** on port 5432 (user: `woxmail`, pass: `woxmail`, db: `woxmail`)
- **Redis 7** on port 6379

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
DATABASE_URL=postgresql://woxmail:woxmail@localhost:5432/woxmail
REDIS_URL=redis://localhost:6379
SESSION_SECRET=<random-64-chars>
JWT_SECRET=<random-64-chars>

# Purelymail
PURELYMAIL_API_TOKEN=<your-token>
DOMAIN_PERMANENT=wox.world
DOMAIN_TEMP=mail.wox.world

# hCaptcha
HCAPTCHA_SECRET=<your-secret>
HCAPTCHA_SITE_KEY=<your-site-key>

# Web Push (optional)
VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
VAPID_EMAIL=admin@wox.world
```

Generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```

### 3. Run Migrations

```bash
npm run migrate
```

This applies all 26 database migrations including compliance journaling, passkeys, user notes vault, and HEY gatekeeper screener.

### 4. Build React Client

```bash
npm run build --workspace=client
```

Output is compiled to `public/dist/` (`dashboard.js`, `settings.js`, `admin.js`).

### 5. Run Verification Test Suites

```bash
npm test
```

Executes the complete 42-Suite Master Test Matrix across unit, service, REST API, daemons, and Playwright browser E2E flows.

### 6. Start Server

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

Server runs at `http://localhost:3001`.

---

## Cloudflare Tunnel

### Install cloudflared

```powershell
# Windows (winget)
winget install Cloudflare.cloudflared

# Or download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
```

### Create Tunnel

```bash
cloudflared tunnel login
cloudflared tunnel create woxmail
```

### Configure Tunnel

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: woxmail
credentials-file: C:\Users\<you>\.cloudflared\<tunnel-id>.json

ingress:
  - hostname: mail.wox.world
    service: http://localhost:3001
  - service: http_status:404
```

### Set DNS Records

```bash
cloudflared tunnel route dns woxmail mail.wox.world
```

Or in Cloudflare Dashboard:
- `mail.wox.world` → CNAME → `<tunnel-id>.cfargotunnel.com`
*(Note: `wox.world` root domain remains free to point to your main landing page / other projects)*

### Run Tunnel

```bash
cloudflared tunnel run woxmail
```

### Auto-Start on Windows Boot

Create a Windows Task Scheduler task:
1. Open Task Scheduler → Create Task
2. **General**: Run whether user is logged on or not
3. **Trigger**: At system startup
4. **Action**: Start a program
   - Program: `C:\Program Files (x86)\cloudflared\cloudflared.exe`
   - Arguments: `tunnel run woxmail`
5. **Conditions**: Uncheck "Start only if on AC power"
6. **Settings**: Allow task to be run on demand, restart on failure

---

## Purelymail DNS

Ensure these DNS records exist for both domains:

### wox.world
| Type | Name | Value |
|---|---|---|
| MX | @ | `mailserver.purelymail.com` (priority 10) |
| TXT | @ | `v=spf1 include:_spf.purelymail.com ~all` |
| TXT | `purelymail._domainkey` | (DKIM key from Purelymail) |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@wox.world` |

### mail.wox.world
| Type | Name | Value |
|---|---|---|
| MX | mail | `mailserver.purelymail.com` (priority 10) |
| TXT | mail | `v=spf1 include:_spf.purelymail.com ~all` |

---

## Backups

### Automatic (pg_dump)

The `backup.js` job runs on a configurable schedule:
- Default: daily at 03:00
- Location: `./backups/`
- Retention: 7 backups (configurable via `MAX_BACKUPS` env var)

### Manual

```bash
pg_dump postgresql://woxmail:woxmail@localhost:5432/woxmail > backup_$(date +%Y%m%d).sql
```

### Docker Volume Backup

```bash
docker run --rm -v mail_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_data.tar.gz /data
```

---

## Monitoring

- **Health check**: `GET /api/health` returns DB + Redis status
- **Pino logs**: Structured JSON in production, pretty-printed in dev
- **Audit log**: All admin actions logged in `audit_log` table
- **Analytics**: Daily/hourly stats aggregated nightly

---

## Cost Summary

| Item | Monthly |
|---|---|
| Purelymail | ~$0.83 |
| Cloudflare Tunnel + DNS | $0 |
| Electricity (your PC) | ~$5-10 |
| Domain (wox.world) | ~$1-3 |
| **Total** | **~$7-14** |
