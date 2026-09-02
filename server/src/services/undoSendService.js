import { v4 as uuidv4 } from 'uuid';
import * as smtpService from './smtp.js';
import * as webhookDispatcher from './webhookDispatcher.js';
import * as outboxService from './outboxService.js';
import { query } from '../config/database.js';
import { pino } from 'pino';

const logger = pino({ name: 'woxmail:undo-send' });

// In-memory registry for pending cancellable outbound dispatches
const pendingDispatches = new Map();

/**
 * Queue an outbound email with a configurable cancellation buffer.
 *
 * @param {Object} params
 * @param {Object} params.user - Authenticated user record
 * @param {Object} params.emailPayload - Email options (from, to, subject, html, text, attachments, etc.)
 * @param {number} [params.delaySeconds=10] - Delay window in seconds
 * @param {Object} [params.reqMetadata] - IP address, user agent, reverse alias info
 * @param {Function} [params.getIMAPConnection] - IMAP connection factory for saving to Sent folder
 * @returns {Promise<{ dispatchId: string, delaySeconds: number, scheduledAt: Date }>}
 */
export async function queueOutboundMessage({
  user,
  emailPayload,
  delaySeconds = 10,
  reqMetadata = {},
  getIMAPConnection = null,
}) {
  const dispatchId = uuidv4();
  const clampedDelay = Math.max(0, Math.min(60, Number(delaySeconds) || 10));
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

  // Remove cancelled dispatch from outbox
  outboxService.deleteOutboxMessage(userId, dispatchId).catch(() => {});

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
  await outboxService.updateOutboxStatus(record.id, { status: 'sending' });
  const { user, emailPayload, reqMetadata, getIMAPConnection } = record;

  try {
    const { transporter } = await smtpService.getTransporterForUser(user.id, record.accountId);

    const result = await smtpService.sendEmail(transporter, emailPayload);

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

    // Append copy to user's Sent IMAP folder if connection provider is supplied
    if (getIMAPConnection) {
      try {
        const client = await getIMAPConnection(user);
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
        }
      } catch (saveErr) {
        logger.warn({ err: saveErr.message }, 'Failed to append sent message to Sent folder');
      }
    }

    record.status = 'sent';
    record.result = result;
    await outboxService.updateOutboxStatus(record.id, { status: 'sent', sentAt: new Date() });
    logger.info({ dispatchId: record.id, messageId: result.messageId }, 'Outbound email dispatched to SMTP');
    return result;
  } catch (err) {
    record.status = 'failed';
    await outboxService.updateOutboxStatus(record.id, { status: 'failed', errorMessage: err.message });
    logger.error({ err: err.message, dispatchId: record.id }, 'Outbound SMTP dispatch failed');
    throw err;
  }
}

export default {
  queueOutboundMessage,
  cancelUndoSend,
};
