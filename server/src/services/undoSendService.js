import { v4 as uuidv4 } from 'uuid';
import * as smtpService from './smtp.js';
import * as webhookDispatcher from './webhookDispatcher.js';
import * as outboxService from './outboxService.js';
import * as complianceArchiveService from './complianceArchiveService.js';
import * as imapService from './imap.js';
import { query } from '../config/database.js';
import { pino } from 'pino';

const logger = pino({ name: 'woxmail:undo-send' });

// In-memory registry for pending cancellable outbound dispatches
const pendingDispatches = new Map();

async function learnContacts(userId, recipientsList) {
  if (!userId || !recipientsList) return;
  try {
    const rawList = Array.isArray(recipientsList) ? recipientsList : [recipientsList];
    for (const item of rawList) {
      if (!item) continue;
      for (const p of String(item).split(',')) {
        const clean = p.trim();
        if (!clean) continue;
        let email = clean;
        let name = null;
        if (clean.includes('<') && clean.includes('>')) {
          const match = clean.match(/^(.*?)\s*<([^>]+)>/);
          if (match) {
            name = match[1].replace(/["']/g, '').trim() || null;
            email = match[2].trim().toLowerCase();
          }
        } else {
          email = clean.toLowerCase();
        }
        if (email.includes('@') && !email.endsWith('.onion')) {
          await query(
            `INSERT INTO contacts (user_id, email, name, last_emailed)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, email)
             DO UPDATE SET last_emailed = NOW(), name = COALESCE(EXCLUDED.name, contacts.name)`,
            [userId, email, name]
          );
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to auto-learn recipients in undoSend');
  }
}

/**
 * Queue an outbound email with a configurable cancellation buffer.
 *
 * @param {Object} params
 * @param {Object} params.user - Authenticated user record
 * @param {Object} params.emailPayload - Email options (from, to, subject, html, text, attachments, etc.)
 * @param {number} [params.delaySeconds=10] - Delay window in seconds
 * @param {Object} [params.reqMetadata] - IP address, user agent, reverse alias info
 * @param {number|string|null} [params.accountId=null] - Connected account ID
 * @param {Function} [params.getIMAPConnection] - IMAP connection factory for saving to Sent folder
 * @returns {Promise<{ dispatchId: string, delaySeconds: number, scheduledAt: Date }>}
 */
export async function queueOutboundMessage({
  user,
  emailPayload,
  delaySeconds = 10,
  reqMetadata = {},
  accountId = null,
  getIMAPConnection = null,
}) {
  const dispatchId = uuidv4();
  const parsedDelay = (delaySeconds === 0 || delaySeconds === '0')
    ? 0
    : (Number(delaySeconds) || 10);
  const clampedDelay = Math.max(0, Math.min(60, isNaN(parsedDelay) ? 10 : parsedDelay));
  const scheduledAt = new Date(Date.now() + clampedDelay * 1000);

  const dispatchRecord = {
    id: dispatchId,
    userId: user.id,
    user,
    emailPayload,
    delaySeconds: clampedDelay,
    scheduledAt,
    status: clampedDelay === 0 ? 'sending' : 'queued_undo',
    reqMetadata,
    accountId,
    getIMAPConnection,
    timer: null,
  };

  // Create real-time outbox tracking entry
  await outboxService.createOutboxEntry({
    userId: user.id,
    dispatchId,
    emailPayload,
    status: clampedDelay === 0 ? 'sending' : 'queued_undo',
    scheduledAt,
  });

  if (clampedDelay === 0) {
    // Zero-delay: dispatch immediately
    await executeDispatch(dispatchRecord);
    return { dispatchId, delaySeconds: 0, scheduledAt: new Date(), status: 'sent' };
  }

  // Schedule delayed execution
  dispatchRecord.timer = setTimeout(async () => {
    try {
      if (dispatchRecord.status === 'queued_undo') {
        await executeDispatch(dispatchRecord);
      }
    } catch (err) {
      logger.error({ err: err.message, dispatchId }, 'Failed executing delayed outbound dispatch');
    } finally {
      pendingDispatches.delete(dispatchId);
    }
  }, clampedDelay * 1000);

  pendingDispatches.set(dispatchId, dispatchRecord);
  logger.info({ dispatchId, userId: user.id, delaySeconds: clampedDelay }, 'Outbound email queued in undo-send buffer');

  return {
    dispatchId,
    delaySeconds: clampedDelay,
    scheduledAt,
    status: 'queued_undo',
  };
}

/**
 * Cancel a pending outbound dispatch during the undo window.
 *
 * @param {string|number} userId - User ID requesting the cancellation
 * @param {string} dispatchId - Unique dispatch UUID
 * @returns {{ success: boolean, message: string }}
 */
export function cancelUndoSend(userId, dispatchId) {
  const record = pendingDispatches.get(dispatchId);

  if (!record) {
    return {
      success: false,
      message: 'Dispatch already processed or not found',
    };
  }

  if (String(record.userId) !== String(userId)) {
    return {
      success: false,
      message: 'Unauthorized to cancel this dispatch',
    };
  }

  if (record.status !== 'queued_undo') {
    return {
      success: false,
      message: `Cannot cancel dispatch with status '${record.status}'`,
    };
  }

  // Atomic cancellation
  record.status = 'cancelled';
  if (record.timer) {
    clearTimeout(record.timer);
    record.timer = null;
  }
  pendingDispatches.delete(dispatchId);

  // Remove cancelled dispatch from outbox strictly by dispatch_id (never parseInt on UUID)
  query('DELETE FROM outbox_emails WHERE user_id = $1 AND dispatch_id = $2', [userId, dispatchId]).catch(() => {});

  logger.info({ dispatchId, userId }, 'Outbound email successfully cancelled by user');
  return {
    success: true,
    message: 'Email send was successfully cancelled',
  };
}

/**
 * Internal executor that performs the actual SMTP transmission.
 *
 * @param {Object} record - Dispatch record
 */
async function executeDispatch(record) {
  record.status = 'dispatching';
  const { user, emailPayload, reqMetadata, getIMAPConnection } = record;
  await outboxService.updateOutboxStatus(record.id, { status: 'sending' }, user.id);

  try {
    const { transporter, senderEmail: defaultSender, accountId: resolvedAccountId } = await smtpService.getTransporterForUser(user.id, record.accountId);
    const effectiveAccountId = record.accountId !== undefined && record.accountId !== null ? record.accountId : resolvedAccountId;

    const rawFrom = String(emailPayload.from || defaultSender || user.email || '');
    const senderMatch = rawFrom.match(/<([^>]+)>/);
    const senderEmail = (senderMatch ? senderMatch[1] : rawFrom).trim();

    const isProton = Boolean(
      transporter?.isProton ||
      (senderEmail && (
        senderEmail.endsWith('@proton.me') ||
        senderEmail.endsWith('@pm.me') ||
        senderEmail.endsWith('@protonmail.com') ||
        senderEmail.endsWith('@protonmail.ch')
      ))
    );

    let result;
    if (isProton) {
      const { sendProtonMail } = await import('./protonServerSync.js');
      result = await sendProtonMail(senderEmail, {
        ...emailPayload,
        from: senderEmail,
      });
    } else {
      result = await smtpService.sendEmail(transporter, emailPayload);
    }

    await outboxService.updateOutboxStatus(record.id, { status: 'sent', sentAt: new Date() }, user.id);
    await learnContacts(user.id, [emailPayload.to, emailPayload.cc, emailPayload.bcc]);

    // Record to Domain-Wide Compliance Archive
    const normList = (val) => (Array.isArray(val) ? val : val ? [val] : []);
    complianceArchiveService.archiveEmail({
      direction: 'outbound',
      mailboxOwnerId: user.id,
      mailboxOwnerEmail: user.email,
      senderAddress: senderEmail,
      senderName: user.display_name || user.username,
      recipientAddresses: normList(emailPayload.to),
      ccAddresses: normList(emailPayload.cc),
      bccAddresses: normList(emailPayload.bcc),
      subject: emailPayload.subject,
      bodyHtml: emailPayload.html,
      bodyText: emailPayload.text,
      attachments: emailPayload.attachments || [],
      ipAddress: reqMetadata.ip || null,
      provider: isProton ? 'proton' : 'woxmail',
      messageId: result.messageId,
    }).catch((archErr) => logger.warn({ err: archErr.message }, 'Failed to record compliance archive in undoSend'));

    // Dispatch webhook event
    webhookDispatcher.dispatchEvent(user.id, 'mail.sent', {
      to: emailPayload.to,
      subject: emailPayload.subject,
      messageId: result.messageId,
      isReverseAlias: !!reqMetadata.reverseMapping,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
       VALUES ('user', $1, 'send_email', $2, $3)`,
      [
        String(user.id),
        JSON.stringify({
          to: emailPayload.to,
          subject: emailPayload.subject,
          messageId: result.messageId,
          isReverseAlias: !!reqMetadata.reverseMapping,
          from: emailPayload.from,
        }),
        reqMetadata.ip || null,
      ]
    );

    // Update daily stats
    await query(
      `INSERT INTO daily_stats (date, emails_sent)
       VALUES (CURRENT_DATE, 1)
       ON CONFLICT (date) DO UPDATE SET emails_sent = daily_stats.emails_sent + 1`
    );

    // Append copy to user's Sent IMAP folder & clean up previous draft if applicable
    if (getIMAPConnection && !isProton) {
      try {
        const client = await getIMAPConnection(user, effectiveAccountId);
        if (client) {
          await smtpService.saveSentMessage(client, {
            from: emailPayload.from,
            to: emailPayload.to,
            cc: emailPayload.cc,
            bcc: emailPayload.bcc,
            subject: emailPayload.subject,
            html: emailPayload.html,
            text: emailPayload.text,
            attachments: emailPayload.attachments,
            messageId: result.messageId,
            date: new Date(),
          });
          if (reqMetadata.previousDraftUid) {
            const prevUid = parseInt(reqMetadata.previousDraftUid, 10);
            if (!isNaN(prevUid)) {
              await imapService.deleteMessages(client, 'Drafts', [prevUid]).catch(() => {});
            }
          }
        }
      } catch (saveErr) {
        logger.warn({ err: saveErr.message }, 'Failed to append sent message to Sent folder');
      }
    }

    record.status = 'sent';
    record.result = result;
    logger.info({ dispatchId: record.id, messageId: result.messageId }, 'Outbound email dispatched to SMTP');
    return result;
  } catch (err) {
    record.status = 'failed';
    await outboxService.updateOutboxStatus(record.id, { status: 'failed', errorMessage: err.message }, user.id);
    logger.error({ err: err.message, dispatchId: record.id }, 'Outbound SMTP dispatch failed');
    throw err;
  }
}

export default {
  queueOutboundMessage,
  cancelUndoSend,
};
