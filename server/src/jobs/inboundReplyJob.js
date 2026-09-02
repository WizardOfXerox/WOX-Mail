/**
 * @fileoverview Background IMAP Ingestion Worker for Inbound Verification Replies.
 * Polls system mailbox for unread verification replies, extracts codes, and completes verification.
 */

import { createConnection } from '../services/imap.js';
import { processInboundReply } from '../services/verificationService.js';
import { get, setex } from '../config/redis.js';
import { simpleParser } from 'mailparser';
import pino from 'pino';

const logger = pino({ name: 'woxmail:inbound-reply-job' });

export async function processInboundVerificationReplies() {
  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const adminEmail = process.env.ADMIN_EMAIL || `admin@${domain}`;
  const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');

  if (!adminPass) return 0;

  let client;
  try {
    client = await createConnection(adminEmail, adminPass);
  } catch (err) {
    return 0;
  }

  let processedCount = 0;

  try {
    const lock = await Promise.race([
      client.getMailboxLock('INBOX'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP lock timeout')), 8000)),
    ]);

    try {
      const unseenUids = await client.search({ seen: false }, { uid: true });
      if (!unseenUids || unseenUids.length === 0) return 0;

      for (const uid of unseenUids) {
        const cacheKey = `reply_ingested_uid:${uid}`;
        const alreadyDone = await get(cacheKey);
        if (alreadyDone) continue;

        const msg = await client.fetchOne(String(uid), {
          envelope: true,
          flags: true,
          source: true,
          uid: true,
        }, { uid: true });

        if (!msg) continue;

        const fromAddr = (msg.envelope?.from?.[0]?.address || '').toLowerCase().trim();
        const toAddr = (msg.envelope?.to?.[0]?.address || '').toLowerCase().trim();
        const subject = msg.envelope?.subject || '';

        // Check if message relates to verification
        const isVerp = toAddr.includes('verify+');
        const hasVerifyTag = subject.includes('[VERIFY-') || subject.includes('Verification Code');

        if (!isVerp && !hasVerifyTag) {
          continue;
        }

        await setex(cacheKey, 86400, 'processing');

        let textBody = msg.snippet || '';
        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);
            textBody = parsed.text || parsed.html || textBody;
          } catch {}
        }

        const result = await processInboundReply({
          fromEmail: fromAddr,
          toEmail: toAddr,
          subject,
          textBody,
        });

        if (result.processed) {
          processedCount++;
          logger.info({ from: fromAddr, sessionToken: result.sessionToken }, 'Inbound email verification reply processed successfully');
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Inbound reply job notice');
  } finally {
    await client.logout().catch(() => {});
  }

  return processedCount;
}

export default { processInboundVerificationReplies };
