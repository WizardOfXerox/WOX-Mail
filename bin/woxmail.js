#!/usr/bin/env node

import { getConfig, saveConfig, clearToken } from './lib/config.js';
import { apiRequest } from './lib/api.js';
import { banner, colors, printTable } from './lib/formatter.js';

const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();
const subArgs = args.slice(1);

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    banner();
    console.log(`
${colors.bold}USAGE:${colors.reset}
  woxmail <command> [subcommand] [options]

${colors.bold}AUTH & SESSION:${colors.reset}
  woxmail login <email> <password>     Authenticate CLI with WoxMail account
  woxmail logout                       Clear local session token
  woxmail whoami                       Display active user credentials and tier
  woxmail config set serverUrl <url>   Change target API server (default: http://localhost:3000)

${colors.bold}EMAIL SUITE:${colors.reset}
  woxmail mail list [folder]           List emails in INBOX or folder (page 1)
  woxmail mail read <uid>              Display full plaintext/parsed message
  woxmail mail send --to <e> --sub <s> --body <b>
  woxmail mail secure --to <e> --pin <p> [--burn]

${colors.bold}TEMPORARY MAILBOXES:${colors.reset}
  woxmail temp new [hours]             Generate disposable email address (1-72 hours)
  woxmail temp inbox <address>         Check incoming messages for disposable address

${colors.bold}HEY-GRADE SCREENER:${colors.reset}
  woxmail screener list                List quarantined first-contact senders
  woxmail screener allow <email>       Allow sender into primary Inbox
  woxmail screener block <email>       Quarantine and block sender

${colors.bold}HELP & SUPPORT DESK:${colors.reset}
  woxmail tickets list                 View your open support tickets
  woxmail tickets new --sub <s> --body <b>

${colors.bold}NEWSLETTER BROADCASTER:${colors.reset}
  woxmail campaigns list               List campaigns and delivery metrics

${colors.bold}ADMIN COMMANDS (Super Admin):${colors.reset}
  woxmail admin users                  List registered system users
  woxmail admin pool                   Inspect temp mail pool status
  woxmail admin stats                  Show server telemetry stats
`);
    return;
  }

  try {
    switch (command) {
      case 'login': {
        const email = subArgs[0];
        const password = subArgs[1];
        if (!email || !password) {
          console.error(`${colors.red}Error:${colors.reset} Usage: woxmail login <email> <password>`);
          process.exit(1);
        }
        const data = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        saveConfig({ token: data.token, email: data.user.email, username: data.user.username });
        console.log(`${colors.green}✓ Successfully authenticated as ${data.user.email} (${data.user.is_admin ? 'ADMIN' : 'Member'})${colors.reset}`);
        break;
      }

      case 'logout': {
        clearToken();
        console.log(`${colors.green}✓ Session cleared successfully.${colors.reset}`);
        break;
      }

      case 'whoami': {
        const config = getConfig();
        if (!config.token) {
          console.log(`${colors.amber}Not logged in.${colors.reset} Use "woxmail login <email> <password>" or "woxmail temp new"`);
          break;
        }
        const data = await apiRequest('/api/auth/me');
        console.log([
          `${colors.bold}ACTIVE IDENTITY:${colors.reset}`,
          `  User:      ${data.user.username} (${data.user.email})`,
          `  Role:      ${data.user.is_admin ? `${colors.purple}SUPER ADMIN${colors.reset}` : 'Verified Member'}`,
          `  Created:   ${new Date(data.user.created_at).toLocaleDateString()}`,
          `  Server:    ${config.serverUrl}`,
        ].join('\n'));
        break;
      }

      case 'config': {
        const action = subArgs[0]?.toLowerCase();
        if (action === 'set' && subArgs[1] && subArgs[2]) {
          saveConfig({ [subArgs[1]]: subArgs[2] });
          console.log(`${colors.green}✓ Config updated: ${subArgs[1]} = ${subArgs[2]}${colors.reset}`);
        } else {
          console.log(JSON.stringify(getConfig(), null, 2));
        }
        break;
      }

      case 'mail': {
        const sub = subArgs[0]?.toLowerCase();
        if (sub === 'list') {
          const folder = subArgs[1] || 'INBOX';
          const data = await apiRequest(`/api/mail/messages?folder=${encodeURIComponent(folder)}&page=1`);
          const rows = (data.messages || []).map((m) => [
            String(m.uid),
            (m.from?.name || m.from?.address || 'Unknown').substring(0, 25),
            (m.subject || '(no subject)').substring(0, 30),
            m.date ? new Date(m.date).toLocaleDateString() : '',
          ]);
          console.log(`\n${colors.bold}MESSAGES IN ${folder.toUpperCase()} (${data.messages?.length || 0}):${colors.reset}`);
          printTable(['UID', 'FROM', 'SUBJECT', 'DATE'], rows);
        } else if (sub === 'read') {
          const uid = subArgs[1];
          if (!uid) {
            console.error('Usage: woxmail mail read <uid>');
            break;
          }
          const data = await apiRequest(`/api/mail/message/${uid}?folder=INBOX`);
          console.log([
            `\n${colors.bold}FROM:${colors.reset}    ${data.from?.text || data.from?.address}`,
            `${colors.bold}TO:${colors.reset}      ${data.to?.text || data.to?.map?.((t) => t.address).join(', ')}`,
            `${colors.bold}DATE:${colors.reset}    ${new Date(data.date).toLocaleString()}`,
            `${colors.bold}SUBJECT:${colors.reset} ${data.subject}`,
            '─'.repeat(70),
            data.text || '[HTML Only message]',
          ].join('\n'));
        } else if (sub === 'send') {
          let to = '', subLine = 'CLI Message', body = '';
          for (let i = 1; i < subArgs.length; i++) {
            if (subArgs[i] === '--to') to = subArgs[++i];
            if (subArgs[i] === '--sub') subLine = subArgs[++i];
            if (subArgs[i] === '--body') body = subArgs[++i];
          }
          if (!to || !body) {
            console.error('Usage: woxmail mail send --to <e> --sub <s> --body <b>');
            break;
          }
          await apiRequest('/api/mail/send', {
            method: 'POST',
            body: JSON.stringify({ to, subject: subLine, text: body }),
          });
          console.log(`${colors.green}✓ Email successfully dispatched to ${to}!${colors.reset}`);
        } else if (sub === 'secure') {
          let to = '', pin = '', burn = false, subLine = 'Confidential Message', body = 'Encrypted Payload';
          for (let i = 1; i < subArgs.length; i++) {
            if (subArgs[i] === '--to') to = subArgs[++i];
            if (subArgs[i] === '--pin') pin = subArgs[++i];
            if (subArgs[i] === '--sub') subLine = subArgs[++i];
            if (subArgs[i] === '--body') body = subArgs[++i];
            if (subArgs[i] === '--burn') burn = true;
          }
          if (!to || !pin) {
            console.error('Usage: woxmail mail secure --to <e> --pin <p> [--burn]');
            break;
          }
          const resVault = await apiRequest('/api/mail/secure-send', {
            method: 'POST',
            body: JSON.stringify({
              recipientEmail: to,
              subject: subLine,
              content: body,
              passcode: pin,
              destroyAfterRead: burn,
            }),
          });
          console.log([
            `\n${colors.purple}${colors.bold}[ENCLAVE] CONFIDENTIAL MESSAGE DISPATCHED:${colors.reset}`,
            `  Unlock URL:  ${resVault.unlockUrl}`,
            `  Passcode:    ${pin}`,
            `  Burn-on-read:${burn ? 'YES' : 'NO'}`,
          ].join('\n'));
        }
        break;
      }

      case 'temp': {
        const sub = subArgs[0]?.toLowerCase();
        if (sub === 'new' || !sub) {
          const hours = parseInt(subArgs[1], 10) || 24;
          const data = await apiRequest('/api/tempmail/generate', {
            method: 'POST',
            body: JSON.stringify({ expiryHours: hours, forceNew: true }),
          });
          console.log([
            `\n${colors.purple}${colors.bold}[TEMP] DISPOSABLE MAILBOX CREATED:${colors.reset}`,
            `  Address:    ${colors.cyan}${data.address}${colors.reset}`,
            `  Expires in: ${hours} hours`,
          ].join('\n'));
        } else if (sub === 'inbox') {
          const addr = subArgs[1];
          if (!addr) {
            console.error('Usage: woxmail temp inbox <address>');
            break;
          }
          const data = await apiRequest(`/api/cli/temp/${encodeURIComponent(addr)}`);
          console.log(data);
        }
        break;
      }

      case 'screener': {
        const sub = subArgs[0]?.toLowerCase();
        if (sub === 'list' || !sub) {
          const data = await apiRequest('/api/screener/pending');
          const rows = (data.pending || []).map((p) => [
            p.email,
            String(p.totalEmails),
            p.firstSubject.substring(0, 35),
          ]);
          console.log(`\n${colors.bold}QUARANTINED FIRST-CONTACT SENDERS (${data.pending?.length || 0}):${colors.reset}`);
          printTable(['SENDER EMAIL', 'EMAILS', 'FIRST SUBJECT'], rows);
        } else if (sub === 'allow' || sub === 'block') {
          const email = subArgs[1];
          if (!email) {
            console.error(`Usage: woxmail screener ${sub} <email>`);
            break;
          }
          await apiRequest('/api/screener/decide', {
            method: 'POST',
            body: JSON.stringify({
              senderPattern: email,
              matchType: 'exact',
              destination: sub === 'allow' ? 'inbox' : 'blocked',
            }),
          });
          console.log(`${colors.green}✓ Sender ${email} rule set to: ${sub.toUpperCase()}${colors.reset}`);
        }
        break;
      }

      case 'tickets': {
        const sub = subArgs[0]?.toLowerCase();
        if (sub === 'list' || !sub) {
          const data = await apiRequest('/api/support/tickets');
          const rows = (data.tickets || []).map((t) => [
            t.ticket_number,
            t.status.toUpperCase(),
            t.priority.toUpperCase(),
            t.subject.substring(0, 30),
          ]);
          console.log(`\n${colors.bold}YOUR SUPPORT TICKETS (${data.tickets?.length || 0}):${colors.reset}`);
          printTable(['TICKET #', 'STATUS', 'PRIORITY', 'SUBJECT'], rows);
        }
        break;
      }

      case 'campaigns': {
        const data = await apiRequest('/api/campaigns');
        const rows = (data.campaigns || []).map((c) => [
          String(c.id),
          c.status.toUpperCase(),
          c.title.substring(0, 25),
          `${c.sent_count || 0}/${c.total_recipients || 0}`,
        ]);
        console.log(`\n${colors.bold}BROADCAST CAMPAIGNS (${data.campaigns?.length || 0}):${colors.reset}`);
        printTable(['ID', 'STATUS', 'TITLE', 'DELIVERED'], rows);
        break;
      }

      case 'admin': {
        const sub = subArgs[0]?.toLowerCase();
        if (sub === 'users') {
          const data = await apiRequest('/api/admin/users');
          const rows = (data.users || []).map((u) => [
            String(u.id),
            u.username,
            u.email,
            u.is_admin ? 'ADMIN' : 'Member',
          ]);
          console.log(`\n${colors.bold}REGISTERED USERS:${colors.reset}`);
          printTable(['ID', 'USERNAME', 'EMAIL', 'ROLE'], rows);
        } else if (sub === 'pool') {
          const data = await apiRequest('/api/admin/overview');
          console.log(`\n${colors.bold}TEMP POOL STATUS:${colors.reset}\n  Available: ${data.pool?.available || 0}`);
        } else if (sub === 'stats') {
          const data = await apiRequest('/api/cli/exec', {
            method: 'POST',
            body: JSON.stringify({ command: 'stats' }),
          });
          console.log(data.output);
        }
        break;
      }

      default:
        console.error(`Unknown command: "${command}". Run "woxmail --help" for documentation.`);
        break;
    }
  } catch (err) {
    console.error(`${colors.red}CLI Error:${colors.reset} ${err.message}`);
    process.exit(1);
  }
}

main();
