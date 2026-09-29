/**
 * @fileoverview Background IMAP Ingestion Worker for Universal Compliance Archive.
 * Polls archive@wox.world IMAP mailbox for incoming messages (shadow copies, dual-delivery, direct),
 * parses MIME source & X-WoxMail-Journal-* metadata headers, and commits immutable SHA-256 records
 * to the compliance_archive PostgreSQL table.
 */

import { createConnection } from '../services/imap.js';
import * as complianceArchiveService from '../services/complianceArchiveService.js';
import { processEmailForChatForward } from '../services/chatForwardService.js';
import { query } from '../config/database.js';
import { get, setex } from '../config/redis.js';
import { simpleParser } from 'mailparser';
import pino from 'pino';

const logger = pino({ name: 'woxmail:archive-ingestion' });

/**
 * Ingest unseen messages from the domain compliance archive mailbox into PostgreSQL.
 * @returns {Promise<number>} Number of newly archived messages
 */
export async function processInboundArchiveEmails() {
  const isArchiveEnabled = process.env.COMPLIANCE_ARCHIVE_ENABLED === 'true';
  if (!isArchiveEnabled) {
    return 0;
  }

  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const archiveEmail = (process.env.ARCHIVE_EMAIL || `archive@${domain}`).toLowerCase().trim();

  // Retrieve archive password from env or database
  let archivePass = (process.env.ARCHIVE_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  if (!archivePass) {
    try {
      const userRes = await query('SELECT imap_password FROM users WHERE email = $1', [archiveEmail]);
      archivePass = userRes.rows[0]?.imap_password;
    } catch (dbErr) {
      logger.debug({ err: dbErr.message }, 'Could not retrieve archive password from database');
    }
  }

  if (!archivePass) {
    return 0;
  }

  let client;
  try {
    client = await createConnection(archiveEmail, archivePass);
  } catch (connErr) {
    logger.debug({ err: connErr.message }, 'Archive ingestion: failed to connect to IMAP');
    return 0;
  }

  let lock = null;
  let processedCount = 0;

  try {
    lock = await Promise.race([
      client.getMailboxLock('INBOX'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Archive IMAP lock timeout')), 8000)),
    ]);

    // Search for unseen messages
    const unseenUids = await client.search({ seen: false }, { uid: true });
    if (!unseenUids || unseenUids.length === 0) {
      return 0;
    }

    logger.info({ count: unseenUids.length }, 'Found unseen emails in compliance archive mailbox');

    for (const uid of unseenUids) {
      const cacheKey = `archive_ingested_uid:${uid}`;
      const alreadyProcessed = await get(cacheKey);

      if (alreadyProcessed) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        continue;
      }

      const msg = await client.fetchOne(String(uid), {
        envelope: true,
        flags: true,
        source: true,
        uid: true,
      }, { uid: true });

      if (!msg) continue;

      let parsed = null;
      let parsedHeaders = {};
      let attachments = [];

      if (msg.source) {
        try {
          parsed = await simpleParser(msg.source);
          if (parsed.headers) {
            for (const [key, val] of parsed.headers) {
              parsedHeaders[key.toLowerCase()] = typeof val === 'object' && val?.text ? val.text : String(val);
            }
          }
          attachments = (parsed.attachments || []).map((att) => ({
            filename: att.filename || 'attachment',
            contentType: att.contentType,
            size: att.size,
          }));
        } catch (parseErr) {
          logger.warn({ uid, err: parseErr.message }, 'Failed to parse archive message MIME source');
        }
      }

      // Check for Purelymail automated welcome email
      const rawFrom = (msg.envelope?.from?.[0]?.address || parsedHeaders['from'] || '').toLowerCase();
      const rawSubject = msg.envelope?.subject || parsed?.subject || '';
      if (rawFrom.includes('purelymail.com') && rawSubject.toLowerCase().includes('welcome to purelymail')) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        await setex(cacheKey, 86400 * 30, 'welcome_skipped');
        continue;
      }

      // Check for X-WoxMail-Journal-* metadata headers
      const journalFrom = parsedHeaders['x-woxmail-journal-original-from'];
      const journalTo = parsedHeaders['x-woxmail-journal-original-to'];
      const journalCc = parsedHeaders['x-woxmail-journal-original-cc'];
      const journalDirection = parsedHeaders['x-woxmail-journal-direction'];
      const journalTimestamp = parsedHeaders['x-woxmail-journal-timestamp'];

      let direction = 'inbound';
      let senderAddress = '';
      let senderName = '';
      let recipientAddresses = [];
      let ccAddresses = [];

      if (journalFrom) {
        // This is a shadow journaled copy of an outbound domain message
        direction = journalDirection || 'outbound';
        senderAddress = journalFrom;
        senderName = parsed?.from?.value?.[0]?.name || msg.envelope?.from?.[0]?.name || '';
        recipientAddresses = journalTo ? journalTo.split(',').map((s) => s.trim()).filter(Boolean) : [];
        ccAddresses = journalCc ? journalCc.split(',').map((s) => s.trim()).filter(Boolean) : [];
      } else {
        // Standard or dual-delivery inbound / direct email
        senderAddress = msg.envelope?.from?.[0]?.address || parsed?.from?.value?.[0]?.address || 'unknown@unknown.com';
        senderName = msg.envelope?.from?.[0]?.name || parsed?.from?.value?.[0]?.name || '';
        recipientAddresses = (msg.envelope?.to || parsed?.to?.value || []).map((t) => t.address).filter(Boolean);
        ccAddresses = (msg.envelope?.cc || parsed?.cc?.value || []).map((c) => c.address).filter(Boolean);

        const senderLower = senderAddress.toLowerCase();
        const isFromDomain = senderLower.endsWith(`@${domain}`) || senderLower.endsWith(`.${domain}`);
        const isToArchiveOnly = recipientAddresses.length === 1 && recipientAddresses[0].toLowerCase() === archiveEmail;

        if (isFromDomain && !isToArchiveOnly) {
          direction = 'outbound';
        } else {
          direction = 'inbound';
        }
      }

      const messageId = msg.envelope?.messageId || parsed?.messageId || `archive-${Date.now()}-${uid}@${domain}`;
      const sentOrReceivedAt = journalTimestamp ? new Date(journalTimestamp) : (msg.envelope?.date || parsed?.date || new Date());

      // Deduplication check in PostgreSQL compliance_archive
      const existingCheck = await query(
        'SELECT id FROM compliance_archive WHERE message_id = $1 LIMIT 1',
        [messageId]
      );

      if (existingCheck.rows.length === 0) {
        await complianceArchiveService.archiveEmail({
          messageId,
          direction,
          mailboxOwnerEmail: archiveEmail,
          senderAddress,
          senderName,
          recipientAddresses: recipientAddresses.length > 0 ? recipientAddresses : [archiveEmail],
          ccAddresses,
          subject: rawSubject || '(No Subject)',
          bodyHtml: parsed?.html || '',
          bodyText: parsed?.text || '',
          attachments,
          headers: parsedHeaders,
          provider: 'purelymail',
          sentOrReceivedAt,
        });

        // Trigger real-time chat forwarding rules (Discord/Telegram/Slack) for inbound emails
        if (direction === 'inbound' && recipientAddresses.length > 0) {
          for (const rcpt of recipientAddresses) {
            try {
              const userRes = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [rcpt]);
              if (userRes.rows.length > 0) {
                const recipientUserId = userRes.rows[0].id;
                await processEmailForChatForward(recipientUserId, {
                  from: senderAddress,
                  subject: rawSubject,
                  text: parsed?.text || '',
                  date: sentOrReceivedAt,
                  messageUid: uid,
                });
              }
            } catch (fwdErr) {
              logger.debug({ err: fwdErr.message, rcpt }, 'Chat forward notification skipped or failed');
            }
          }
        }

        processedCount++;
        logger.info({ uid, direction, sender: senderAddress, subject: rawSubject }, 'Ingested message into compliance archive');
      }

      // Mark message as seen on IMAP and record in Redis cache
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
      await setex(cacheKey, 86400 * 30, 'ingested');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Notice in archive ingestion worker');
  } finally {
    if (lock) {
      try { lock.release(); } catch {}
    }
    if (client) {
      await client.logout().catch(() => {});
    }
  }

  return processedCount;
}

export default { processInboundArchiveEmails };
