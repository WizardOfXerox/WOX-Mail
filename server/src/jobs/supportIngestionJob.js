import { createConnection } from '../services/imap.js';
import { createTicketFromEmail } from '../services/supportService.js';
import { get, setex } from '../config/redis.js';
import { simpleParser } from 'mailparser';
import pino from 'pino';

const logger = pino({ name: 'woxmail:support-ingestion' });

/**
 * Process inbound support emails from support IMAP
 * Hardened with strict UNSEEN search, deduplication cache, and anti-loop guards.
 */
export async function processInboundSupportEmails() {
  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const adminEmail = process.env.ADMIN_EMAIL || `admin@${domain}`;
  const supportEmail = process.env.SUPPORT_EMAIL || `support@${domain}`;
  const noReplyEmail = process.env.NO_REPLY_EMAIL || `noreply@${domain}`;
  const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');

  if (!adminPass) {
    return 0;
  }

  let client;
  try {
    client = await createConnection(adminEmail, adminPass);
  } catch (err) {
    logger.warn({ err: err.message }, 'Support ingestion: failed to connect to IMAP');
    return 0;
  }

  let lock = null;
  let processedCount = 0;

  try {
    lock = await Promise.race([
      client.getMailboxLock('INBOX'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP mailbox lock timeout')), 8000)),
    ]);

    // 1. Search ONLY genuinely unseen messages
    const unseenUids = await client.search({ seen: false }, { uid: true });
    if (!unseenUids || unseenUids.length === 0) {
      return 0;
    }

    logger.info({ count: unseenUids.length }, 'Found unseen support emails to process');

    for (const uid of unseenUids) {
      const cacheKey = `support_ingested_uid:${uid}`;
      const alreadyProcessed = await get(cacheKey);

      if (alreadyProcessed) {
        // Ensure it's marked Seen on IMAP and skip
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        continue;
      }

      // Fetch single message with full envelope and source
      const msg = await client.fetchOne(String(uid), {
        envelope: true,
        source: true,
        flags: true,
        uid: true,
      });

      if (!msg) continue;

      const fromAddr = (msg.envelope?.from?.[0]?.address || '').toLowerCase().trim();
      const subject = msg.envelope?.subject || 'Support Inquiry';

      // Anti-loop guards
      if (
        !fromAddr ||
        fromAddr === adminEmail.toLowerCase() ||
        fromAddr === supportEmail.toLowerCase() ||
        fromAddr === noReplyEmail.toLowerCase() ||
        fromAddr.includes('mailer-daemon') ||
        fromAddr.includes('postmaster') ||
        fromAddr.includes('no-reply') ||
        fromAddr.includes('noreply')
      ) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        await setex(cacheKey, 86400 * 30, 'skipped');
        continue;
      }

      // Parse full MIME source
      let parsedText = '';
      let attachments = [];

      if (msg.source) {
        try {
          const parsed = await simpleParser(msg.source);
          parsedText = parsed.text || parsed.html?.replace(/<[^>]*>/g, ' ') || '';
          attachments = (parsed.attachments || []).map((att) => ({
            filename: att.filename || 'attachment',
            contentType: att.contentType,
            size: att.size,
          }));
        } catch {}
      }

      const fromName = msg.envelope?.from?.[0]?.name || fromAddr;

      const result = await createTicketFromEmail(fromAddr, fromName, subject, parsedText, attachments);
      processedCount++;

      logger.info({ from: fromAddr, ticketNumber: result.ticketNumber, action: result.action }, 'Support email processed');

      // Mark message as read on IMAP immediately
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
      await setex(cacheKey, 86400 * 30, 'completed');
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Notice in support ingestion worker');
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

export default { processInboundSupportEmails };
