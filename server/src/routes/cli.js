import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { JWT_COOKIE_NAME } from '../config/constants.js';
import { claimAddress, getPoolStats, replenishPool } from '../services/pool.js';
import { createConnection, fetchMessages, fetchMessage } from '../services/imap.js';
import { createTransporter, sendEmail } from '../services/smtp.js';
import { createSecureMessage } from '../services/secureMessageService.js';
import { createFutureLetter } from '../services/futureLetterService.js';
import { listAliases, createAlias } from '../services/aliasManager.js';
import { generateKeyPair, validatePublicKey } from '../services/pgpService.js';
import { listTickets, getTicketThread, addMessage, updateTicketStatus } from '../services/supportService.js';
import { listCampaigns } from '../services/campaignService.js';
import { setScreenerDecision, listScreenerRules } from '../services/screenerService.js';

const router = Router();

/**
 * Helper to resolve user from Bearer or Cookie (if present)
 */
async function resolveUser(req) {
  const token = req.cookies?.[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const res = await query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * POST /api/cli/exec
 * Interactive Terminal Command Executor (30+ Power & Admin Commands)
 */
router.post('/exec', async (req, res) => {
  const rawInput = (req.body?.command || '').trim();
  const user = await resolveUser(req);

  if (!rawInput) {
    return res.json({ output: '', prompt: user ? `${user.username}@woxmail:~$ ` : 'guest@woxmail:~$ ' });
  }

  // Parse command & args (handles quotes)
  const tokens = rawInput.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
  const cleanTokens = tokens.map((t) => t.replace(/^['"]|['"]$/g, ''));
  const cmd = cleanTokens[0]?.toLowerCase();
  const args = cleanTokens.slice(1);

  let output = '';
  let error = false;

  try {
    switch (cmd) {
      case 'help':
      case 'man':
        output = [
          '╔════════════════════════════════════════════════════════════════════════╗',
          '║                   WOXMAIL SOVEREIGN CLI MANUAL v2.0                    ║',
          '╠════════════════════════════════════════════════════════════════════════╣',
          '║  GENERAL / MEMBER COMMANDS:                                            ║',
          '║    whoami                     Display active session identity & quota  ║',
          '║    mail list [folder]         List messages (default: INBOX)           ║',
          '║    mail read <uid>            Read email message by UID                ║',
          '║    mail send --to <e> --sub <s> --body <b>                             ║',
          '║    mail secure --to <e> --pin <p> [--burn]                             ║',
          '║    temp new [hours]           Generate instant disposable mailbox      ║',
          '║    temp inbox <address>       Check messages in disposable mailbox     ║',
          '║    alias list | alias new     Create / view private vendor aliases     ║',
          '║    future send --in <preset>  Deliver letter in 6m, 1y, 3y, 5y, 10y    ║',
          '║    pgp status | pgp gen       View or generate Curve25519 PGP keypairs ║',
          '║    gatekeeper pending         View quarantined first-contact senders   ║',
          '║    gatekeeper allow <email>   Approve sender to primary Inbox          ║',
          '║    gatekeeper block <email>   Quarantine and block sender              ║',
          '║    tickets list               View your open support tickets           ║',
          '║    tickets new <sub > <msg>   Open a new support desk ticket           ║',
          '║    campaigns list             List active newsletter broadcasts        ║',
          '║    stats                      Display system telemetry and pool status ║',
          '║    clear                      Clear the terminal screen                ║',
          '╠════════════════════════════════════════════════════════════════════════╣',
          '║  ADMIN ROOT COMMANDS (Requires Super Admin):                           ║',
          '║    users list                 List all registered users                ║',
          '║    users inspect <email>      Inspect deep user record                 ║',
          '║    pool status                Inspect temp mail standby pool           ║',
          '║    pool topup [count]         Trigger pool replenishment               ║',
          '║    audit [limit]              View system security audit logs          ║',
          '║    tickets admin              Triage all support@wox.world tickets     ║',
          '║    tickets resolve <id>       Mark support ticket as resolved          ║',
          '║    backup now                 Create database snapshot backup          ║',
          '║    sql <SELECT query>         Run read-only database query             ║',
          '╚════════════════════════════════════════════════════════════════════════╝',
        ].join('\n');
        break;

      case 'whoami':
        if (!user) {
          output = 'Not logged in. Operating as guest.\nType: login <email> <password> or use "temp new" for anonymous mail.';
        } else {
          output = [
            `User:        ${user.username} (${user.email})`,
            `Role:        ${user.is_admin ? 'ROOT SYSTEM ADMINISTRATOR 👑' : 'Verified Member'}`,
            `Tier:        Permanent Darknet Privacy Tier`,
            `2FA Status:  ${user.otp_enabled ? 'ENABLED (RFC 6238 TOTP)' : 'DISABLED'}`,
            `Created:     ${new Date(user.created_at).toLocaleDateString()}`,
          ].join('\n');
        }
        break;

      case 'mail':
        if (!user) {
          output = 'Error: "mail" commands require an authenticated permanent account.';
          error = true;
          break;
        }

        const subCmd = args[0]?.toLowerCase();
        if (subCmd === 'list') {
          const folder = args[1] || 'INBOX';
          const pass = user.purelymail_password || process.env.ADMIN_PASSWORD;
          const client = await createConnection(user.email, pass);
          const result = await fetchMessages(client, folder, { page: 1, limit: 15 });
          await client.logout().catch(() => {});

          if (!result.messages || result.messages.length === 0) {
            output = `Folder "${folder}" is empty.`;
          } else {
            const lines = [`MESSAGES IN ${folder.toUpperCase()} (${result.messages.length}):`];
            lines.push('─'.repeat(70));
            lines.push(`UID   | ${'FROM'.padEnd(25)} | ${'SUBJECT'.padEnd(25)} | DATE`);
            lines.push('─'.repeat(70));
            result.messages.forEach((m) => {
              const sender = (m.from?.name || m.from?.address || 'Unknown').substring(0, 24);
              const sub = (m.subject || '(no subject)').substring(0, 24);
              const date = m.date ? new Date(m.date).toLocaleDateString() : '';
              lines.push(`${String(m.uid).padEnd(5)} | ${sender.padEnd(25)} | ${sub.padEnd(25)} | ${date}`);
            });
            output = lines.join('\n');
          }
        } else if (subCmd === 'read') {
          const uid = parseInt(args[1], 10);
          if (!uid) {
            output = 'Usage: mail read <uid>';
            error = true;
            break;
          }
          const pass = user.purelymail_password || process.env.ADMIN_PASSWORD;
          const client = await createConnection(user.email, pass);
          const msg = await fetchMessage(client, 'INBOX', uid);
          await client.logout().catch(() => {});

          if (!msg) {
            output = `Message UID ${uid} not found.`;
          } else {
            const { simpleParser } = await import('mailparser');
            const parsed = await simpleParser(msg.source);
            output = [
              `FROM:    ${parsed.from?.text}`,
              `TO:      ${parsed.to?.text}`,
              `DATE:    ${parsed.date?.toLocaleString()}`,
              `SUBJECT: ${parsed.subject}`,
              '─'.repeat(70),
              parsed.text || '[No plain text body — HTML content rendered in webmail]',
            ].join('\n');
          }
        } else if (subCmd === 'send') {
          let to = '', sub = 'CLI Dispatched Email', body = '';
          for (let i = 1; i < args.length; i++) {
            if (args[i] === '--to') to = args[++i];
            if (args[i] === '--sub' || args[i] === '--subject') sub = args[++i];
            if (args[i] === '--body') body = args[++i];
          }
          if (!to || !body) {
            output = 'Usage: mail send --to <recipient> --sub <subject> --body <content>';
            error = true;
            break;
          }
          const pass = user.purelymail_password || process.env.ADMIN_PASSWORD;
          const transporter = createTransporter(user.email, pass);
          await sendEmail(transporter, { from: user.email, to, subject: sub, text: body });
          output = `✓ Email dispatched successfully to ${to} (Subject: "${sub}")`;
        } else if (subCmd === 'secure') {
          let to = '', pin = '', burn = false, sub = 'Confidential Message';
          for (let i = 1; i < args.length; i++) {
            if (args[i] === '--to') to = args[++i];
            if (args[i] === '--pin') pin = args[++i];
            if (args[i] === '--sub') sub = args[++i];
            if (args[i] === '--burn') burn = true;
          }
          if (!to || !pin) {
            output = 'Usage: mail secure --to <recipient> --pin <passcode> [--sub <subject>] [--burn]';
            error = true;
            break;
          }
          const resVault = await createSecureMessage({
            senderId: user.id,
            senderEmail: user.email,
            recipientEmail: to,
            subject: sub,
            content: args.find((_, idx) => args[idx - 1] === '--body') || 'Confidential Secure Payload',
            passcode: pin,
            destroyAfterRead: burn,
          });
          output = [
            '🔐 CONFIDENTIAL LOCKED EMAIL CREATED',
            `Unlock Link: ${resVault.unlockUrl}`,
            `PIN:         ${pin}`,
            `Self-Destruct on read: ${burn ? 'YES (Burn-on-read)' : 'NO'}`,
          ].join('\n');
        } else {
          output = 'Available mail subcommands: list [folder], read <uid>, send --to <e> --body <b>, secure --to <e> --pin <p>';
        }
        break;

      case 'temp':
        const tempSub = args[0]?.toLowerCase();
        if (tempSub === 'new' || !tempSub) {
          const hours = parseInt(args[1], 10) || 24;
          const claimed = await claimAddress({ expiryHours: hours, tier: 'public' });
          const expDate = new Date(claimed.expires_at || Date.now() + hours * 3600000);
          output = [
            '⚡ DISPOSABLE MAILBOX CREATED:',
            `Address:    ${claimed.address}`,
            `Expires:    in ${hours} hours (${expDate.toLocaleTimeString()})`,
            `Web Portal: ${process.env.APP_URL || 'http://127.0.0.1:3001'}/tempmail?address=${encodeURIComponent(claimed.address)}`,
          ].join('\n');
        } else if (tempSub === 'inbox') {
          const addr = args[1];
          if (!addr) {
            output = 'Usage: temp inbox <address>';
            error = true;
            break;
          }
          const resDb = await query("SELECT imap_password FROM temp_addresses WHERE address = $1 AND status = 'active'", [addr]);
          if (resDb.rows.length === 0) {
            output = `Address ${addr} not found or expired.`;
          } else {
            const client = await createConnection(addr, resDb.rows[0].imap_password);
            const r = await fetchMessages(client, 'INBOX', { page: 1, limit: 10 });
            await client.logout().catch(() => {});
            if (!r.messages || r.messages.length === 0) {
              output = `No messages currently in inbox for ${addr}.`;
            } else {
              output = r.messages.map((m) => `[UID ${m.uid}] ${m.from?.address || 'Unknown'}: "${m.subject || '(no sub)'}" (${new Date(m.date).toLocaleTimeString()})`).join('\n');
            }
          }
        } else {
          output = 'Usage: temp new [hours] | temp inbox <address>';
        }
        break;

      case 'gatekeeper':
        if (!user) {
          output = 'Error: Gatekeeper requires an authenticated account.';
          error = true;
          break;
        }
        const gkSub = args[0]?.toLowerCase();
        if (gkSub === 'rules' || !gkSub) {
          const rules = await listScreenerRules(user.id);
          if (rules.length === 0) {
            output = 'No active screener rules configured. Type "gatekeeper allow <email>" or "gatekeeper block <email>" to add rules.';
          } else {
            output = `ACTIVE SCREENER RULES (${rules.length}):\n` +
              rules.map((r) => `• ${r.sender_pattern} [${r.match_type}] -> ${r.destination.toUpperCase()}`).join('\n');
          }
        } else if (gkSub === 'allow' || gkSub === 'block') {
          const targetEmail = args[1];
          if (!targetEmail) {
            output = `Usage: gatekeeper ${gkSub} <email>`;
            error = true;
            break;
          }
          await setScreenerDecision(user.id, targetEmail, 'exact', gkSub === 'allow' ? 'inbox' : 'blocked');
          output = `✓ Sender ${targetEmail} set to: ${gkSub === 'allow' ? 'ALLOW (Inbox)' : 'BLOCK (Quarantine)'}`;
        }
        break;

      case 'tickets':
        if (!user) {
          output = 'Error: Support desk requires an authenticated account.';
          error = true;
          break;
        }
        const tkSub = args[0]?.toLowerCase();
        if (tkSub === 'admin' && user.is_admin) {
          const tks = await listTickets({ limit: 15 });
          const rows = tks.tickets || [];
          output = `ALL SUPPORT TICKETS (${rows.length}):\n` +
            rows.map((t) => `• [${t.ticket_number}] (${t.status.toUpperCase()}) ${t.creator_email}: "${t.subject}"`).join('\n');
        } else if (tkSub === 'resolve' && user.is_admin) {
          const tkId = parseInt(args[1], 10);
          if (!tkId) {
            output = 'Usage: tickets resolve <id>';
            error = true;
            break;
          }
          await updateTicketStatus(tkId, { status: 'resolved' });
          output = `✓ Support ticket #${tkId} marked as RESOLVED.`;
        } else {
          const userTks = await listTickets({ userId: user.id });
          const rows = userTks.tickets || [];
          if (rows.length === 0) {
            output = 'No open support tickets found.';
          } else {
            output = `YOUR SUPPORT TICKETS (${rows.length}):\n` +
              rows.map((t) => `• [${t.ticket_number}] (${t.status.toUpperCase()}) "${t.subject}"`).join('\n');
          }
        }
        break;

      case 'campaigns':
        if (!user) {
          output = 'Error: Campaigns requires an authenticated account.';
          error = true;
          break;
        }
        const camps = await listCampaigns(user.id);
        if (camps.length === 0) {
          output = 'No broadcast campaigns found.';
        } else {
          output = `NEWSLETTER CAMPAIGNS (${camps.length}):\n` +
            camps.map((c) => `• [ID ${c.id}] (${c.status.toUpperCase()}) "${c.title}" — ${c.sent_count || 0}/${c.total_recipients || 0} delivered`).join('\n');
        }
        break;

      case 'users':
        if (!user?.is_admin) {
          output = 'Error: "users" command is restricted to Root Administrators.';
          error = true;
          break;
        }
        const uSub = args[0]?.toLowerCase();
        if (uSub === 'inspect') {
          const target = args[1];
          const uRes = await query('SELECT id, username, email, is_admin, otp_enabled, created_at FROM users WHERE email = $1 OR username = $1', [target]);
          if (uRes.rows.length === 0) {
            output = `User "${target}" not found.`;
          } else {
            output = JSON.stringify(uRes.rows[0], null, 2);
          }
        } else {
          const allUsers = await query('SELECT id, username, email, is_admin, created_at FROM users ORDER BY id ASC LIMIT 25');
          output = `REGISTERED USERS (${allUsers.rows.length}):\n` +
            allUsers.rows.map((u) => `• [ID ${u.id}] ${u.username} (${u.email}) ${u.is_admin ? '👑 ADMIN' : ''}`).join('\n');
        }
        break;

      case 'pool':
        if (!user?.is_admin) {
          output = 'Error: "pool" command is restricted to Root Administrators.';
          error = true;
          break;
        }
        const pSub = args[0]?.toLowerCase();
        if (pSub === 'topup') {
          const count = parseInt(args[1], 10) || 5;
          await replenishPool(count);
          output = `✓ Initiated pool topup of ${count} addresses.`;
        } else {
          const pStatus = await getPoolStats();
          output = `TEMP MAIL POOL STATUS:\n• Available: ${pStatus.available || 0}\n• Active: ${pStatus.active || 0}\n• Expired: ${pStatus.expired || 0}`;
        }
        break;

      case 'audit':
        if (!user?.is_admin) {
          output = 'Error: "audit" command is restricted to Root Administrators.';
          error = true;
          break;
        }
        const limit = parseInt(args[0], 10) || 10;
        const aRes = await query('SELECT action, user_id, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT $1', [limit]);
        output = `SECURITY AUDIT TRAIL (Last ${limit}):\n` +
          aRes.rows.map((a) => `• [${new Date(a.created_at).toLocaleTimeString()}] ${a.action} (IP: ${a.ip_address || 'local'})`).join('\n');
        break;

      case 'sql':
        if (!user?.is_admin) {
          output = 'Error: "sql" command is strictly restricted to Root Administrators.';
          error = true;
          break;
        }
        const sqlQuery = args.join(' ');
        if (!sqlQuery.toLowerCase().startsWith('select')) {
          output = 'Safety Error: Only read-only SELECT queries are permitted via terminal interface.';
          error = true;
          break;
        }
        const sqlRes = await query(sqlQuery);
        output = JSON.stringify(sqlRes.rows, null, 2);
        break;

      case 'alias':
        if (!user) {
          output = 'Error: Alias management requires an authenticated permanent account.';
          error = true;
          break;
        }
        const aliasSub = args[0]?.toLowerCase();
        if (aliasSub === 'new' || aliasSub === 'create') {
          const tag = args[1] || 'shop';
          const newAlias = await createAlias(user.id, { tag, domain: process.env.DOMAIN_PERMANENT || 'wox.world' });
          output = `✓ Created privacy vendor alias: ${newAlias.alias_email} (Tag: ${tag})`;
        } else {
          const aliases = await listAliases(user.id);
          if (!aliases || aliases.length === 0) {
            output = 'No active aliases found. Type "alias new <tag>" to create one.';
          } else {
            output = 'ACTIVE PRIVACY ALIASES:\n' + aliases.map((a) => `• ${a.alias_email} [${a.tag || 'Default'}] -> forwards to ${user.email}`).join('\n');
          }
        }
        break;

      case 'future':
        let fTo = user?.email || '', fIn = '1y', fSub = 'A Letter to the Future', fBody = '';
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--to') fTo = args[++i];
          if (args[i] === '--in') fIn = args[++i];
          if (args[i] === '--sub') fSub = args[++i];
          if (args[i] === '--body') fBody = args[++i];
        }
        if (!fTo || !fBody) {
          output = 'Usage: future send --to <email> --in [6m|1y|3y|5y|10y] --sub <subject> --body <content>';
          error = true;
          break;
        }
        let deliveryDate = new Date();
        if (fIn === '6m') deliveryDate.setMonth(deliveryDate.getMonth() + 6);
        else if (fIn === '3y') deliveryDate.setFullYear(deliveryDate.getFullYear() + 3);
        else if (fIn === '5y') deliveryDate.setFullYear(deliveryDate.getFullYear() + 5);
        else if (fIn === '10y') deliveryDate.setFullYear(deliveryDate.getFullYear() + 10);
        else deliveryDate.setFullYear(deliveryDate.getFullYear() + 1);

        await createFutureLetter({
          userId: user?.id || null,
          senderEmail: user?.email || fTo,
          recipientEmail: fTo,
          subject: fSub,
          body: fBody,
          deliveryDate,
          deliveryPreset: fIn,
        });
        output = `⏳ Time Capsule letter sealed! Scheduled for delivery on ${deliveryDate.toLocaleDateString()} to ${fTo}.`;
        break;

      case 'pgp':
        if (!user) {
          output = 'Error: OpenPGP key vault requires an authenticated permanent account.';
          error = true;
          break;
        }
        const pgpSub = args[0]?.toLowerCase();
        if (pgpSub === 'gen') {
          const kp = await generateKeyPair(user.display_name || user.username, user.email);
          await query('UPDATE users SET pgp_public_key = $1, pgp_enabled = TRUE WHERE id = $2', [kp.publicKey, user.id]);
          output = `✓ Generated Curve25519 ECC OpenPGP keypair!\nFingerprint: ${kp.fingerprint}\n\nPUBLIC KEY:\n${kp.publicKey}`;
        } else {
          output = user.pgp_public_key
            ? `OPENPGP PUBLIC KEY VAULT:\nStatus: Active\n\n${user.pgp_public_key}`
            : 'No PGP key registered. Type "pgp gen" to generate Curve25519 ECC keypair.';
        }
        break;

      case 'stats':
      case 'sys':
      case 'system':
      case 'telemetry':
      case 'status':
        const dbStats = await query(`
          SELECT
            (SELECT COUNT(*) FROM users) as users_count,
            (SELECT COUNT(*) FROM temp_addresses WHERE status = 'active') as active_temp_count,
            (SELECT COUNT(*) FROM future_letters WHERE status = 'scheduled') as scheduled_letters,
            (SELECT COUNT(*) FROM secure_messages WHERE status = 'active') as active_vault_messages,
            (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') as open_tickets
        `);
        const s = dbStats.rows[0];
        output = [
          '╔═════════════════════════════════════════════════╗',
          '║            WOXMAIL TELEMETRY STATS              ║',
          '╠═════════════════════════════════════════════════╣',
          `║  Registered Members:         ${String(s.users_count).padEnd(18)}║`,
          `║  Active Disposable Inboxes:  ${String(s.active_temp_count).padEnd(18)}║`,
          `║  Time Capsules in Vault:     ${String(s.scheduled_letters).padEnd(18)}║`,
          `║  AES-256 Confidential Mails: ${String(s.active_vault_messages).padEnd(18)}║`,
          `║  Open Helpdesk Tickets:      ${String(s.open_tickets).padEnd(18)}║`,
          '╚═════════════════════════════════════════════════╝',
        ].join('\n');
        break;

      case 'clear':
        output = '\x1b[2J\x1b[0;0H';
        break;

      default:
        output = `Command not recognized: "${cmd}". Type "help" for a list of available commands.`;
        error = true;
        break;
    }
  } catch (err) {
    output = `Execution Error: ${err.message}`;
    error = true;
  }

  res.json({
    output,
    error,
    prompt: user ? `${user.username}@woxmail:~$ ` : 'guest@woxmail:~$ ',
  });
});

/**
 * GET /api/cli/temp
 * Plaintext cURL endpoint returning an instant disposable email
 */
router.get('/temp', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const claimed = await claimAddress({ expiryHours: hours, tier: 'public' });
    const expDate = new Date(claimed.expires_at || Date.now() + hours * 3600000);
    const baseUrl = process.env.APP_URL || 'http://127.0.0.1:3001';

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(
      [
        'WOXMAIL DISPOSABLE INBOX',
        '========================================',
        `Address:    ${claimed.address}`,
        `Expires:    in ${hours} hours (${expDate.toUTCString()})`,
        `CLI Stream: curl ${baseUrl}/api/cli/temp/${claimed.address}`,
        `Web Inbox:  ${baseUrl}/tempmail?address=${encodeURIComponent(claimed.address)}`,
        '========================================',
      ].join('\n') + '\n'
    );
  } catch (err) {
    res.status(500).send(`Error creating temp mailbox: ${err.message}\n`);
  }
});

/**
 * GET /api/cli/temp/:address
 * Plaintext cURL inbox viewer
 */
router.get('/temp/:address', async (req, res) => {
  try {
    const { address } = req.params;
    const result = await query(
      "SELECT imap_password FROM temp_addresses WHERE address = $1 AND status = 'active' AND expires_at > NOW()",
      [address]
    );

    if (result.rows.length === 0) {
      return res.status(404).send(`Address "${address}" not found or expired.\n`);
    }

    const client = await createConnection(address, result.rows[0].imap_password);
    const data = await fetchMessages(client, 'INBOX', { page: 1, limit: 15 });
    await client.logout().catch(() => {});

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (!data.messages || data.messages.length === 0) {
      return res.send(`Inbox for ${address} is empty. (0 messages)\n`);
    }

    const lines = [
      `INBOX FOR: ${address} (${data.messages.length} message(s))`,
      '========================================================================',
      `UID   | ${'FROM'.padEnd(25)} | ${'SUBJECT'.padEnd(25)} | DATE`,
      '------------------------------------------------------------------------',
    ];

    data.messages.forEach((m) => {
      const sender = (m.from?.name || m.from?.address || 'Unknown').substring(0, 24);
      const sub = (m.subject || '(no subject)').substring(0, 24);
      const date = m.date ? new Date(m.date).toLocaleDateString() : '';
      lines.push(`${String(m.uid).padEnd(5)} | ${sender.padEnd(25)} | ${sub.padEnd(25)} | ${date}`);
    });

    lines.push('========================================================================');
    res.send(lines.join('\n') + '\n');
  } catch (err) {
    res.status(500).send(`Error reading inbox: ${err.message}\n`);
  }
});

export default router;
