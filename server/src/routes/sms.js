/**
 * @fileoverview WoxSMS / Phone Bridge routes — 6 endpoints.
 * Connects Android phones via TextBee gateway for real-time SMS in webmail.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { query } from '../config/database.js';
import { extractOTP } from '../utils/otpDetector.js';
import crypto from 'crypto';
import pino from 'pino';

const logger = pino({ name: 'woxmail:sms' });
const router = Router();

/**
 * GET /api/sms/devices
 * List paired Android devices.
 */
router.get('/devices', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, device_name, phone_number, is_active, last_synced_at, created_at
       FROM user_devices
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ devices: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sms/devices/pair
 * Generate a pairing token / QR code for Android app.
 */
router.post('/devices/pair',
  requireAuth,
  validate({
    deviceName: { type: 'string', required: true, max: 100 },
    phoneNumber: { type: 'string', max: 20 },
  }),
  async (req, res, next) => {
    try {
      const token = crypto.randomBytes(32).toString('hex');

      const result = await query(
        `INSERT INTO user_devices (user_id, device_name, phone_number, device_token)
         VALUES ($1, $2, $3, $4)
         RETURNING id, device_name, phone_number, device_token, created_at`,
        [req.user.id, req.body.deviceName, req.body.phoneNumber || null, token]
      );

      const device = result.rows[0];

      // Pairing data for QR code
      const pairingData = {
        endpoint: `${process.env.BASE_URL || 'https://mail.wox.world'}/api/sms/webhook`,
        token: device.device_token,
        deviceId: device.id,
      };

      res.status(201).json({
        device: { id: device.id, name: device.device_name, phone: device.phone_number },
        pairing: pairingData,
        qrData: JSON.stringify(pairingData),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/sms/devices/:id
 * Unpair / revoke a device.
 */
router.delete('/devices/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM user_devices WHERE user_id = $1 AND id = $2 RETURNING id',
      [req.user.id, parseInt(req.params.id, 10)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Device not found' });
    res.json({ message: 'Device unpaired' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sms/webhook
 * Ingest incoming SMS from phone (TextBee webhook).
 * No auth middleware — uses device_token for authentication.
 */
router.post('/webhook',
  validate({
    token: { type: 'string', required: true },
    sender: { type: 'string', required: true },
    message: { type: 'string', required: true },
    receivedAt: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { token, sender, message, receivedAt } = req.body;

      // Authenticate via device token
      const deviceResult = await query(
        `SELECT d.id, d.user_id FROM user_devices d
         WHERE d.device_token = $1 AND d.is_active = TRUE`,
        [token]
      );

      if (deviceResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid device token' });
      }

      const device = deviceResult.rows[0];

      // Detect OTP codes
      const otpResult = extractOTP(message);

      // Store the SMS
      await query(
        `INSERT INTO sms_messages (user_id, device_id, sender_phone, message_body, direction, is_otp, otp_code, received_at)
         VALUES ($1, $2, $3, $4, 'inbound', $5, $6, $7)`,
        [device.user_id, device.id, sender, message, otpResult.isOtp, otpResult.code, receivedAt || new Date()]
      );

      // Update last_synced_at
      await query('UPDATE user_devices SET last_synced_at = NOW() WHERE id = $1', [device.id]);

      // TODO: Send Socket.IO notification to user for real-time toast
      // io.to(`user:${device.user_id}`).emit('sms:new', { sender, message, isOtp: otpResult.isOtp, otpCode: otpResult.code });

      res.json({ received: true, isOtp: otpResult.isOtp });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/sms/messages
 * Fetch SMS history (paginated, searchable).
 */
router.get('/messages', requireAuth, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const offset = (page - 1) * limit;
    const search = req.query.q || '';

    let whereClause = 'WHERE sm.user_id = $1';
    const values = [req.user.id];

    if (search) {
      values.push(`%${search}%`);
      whereClause += ` AND (sm.sender_phone ILIKE $${values.length} OR sm.message_body ILIKE $${values.length})`;
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM sms_messages sm ${whereClause}`,
      values
    );

    const result = await query(
      `SELECT sm.*, d.device_name
       FROM sms_messages sm
       LEFT JOIN user_devices d ON d.id = sm.device_id
       ${whereClause}
       ORDER BY sm.received_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    res.json({
      messages: result.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total, 10),
        totalPages: Math.ceil(countResult.rows[0].total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sms/send and POST /api/sms/messages/send
 * Dispatch outbound SMS via TextBee API or SMS Webhook relay.
 */
router.post(['/send', '/messages/send'],
  requireAuth,
  validate({
    deviceId: { type: 'number', required: true },
    to: { type: 'string', required: true },
    message: { type: 'string', required: true, max: 1600 },
  }),
  async (req, res, next) => {
    try {
      const { deviceId, to, message } = req.body;

      // Verify device belongs to user
      const device = await query(
        'SELECT * FROM user_devices WHERE id = $1 AND user_id = $2 AND is_active = TRUE',
        [deviceId, req.user.id]
      );
      if (device.rows.length === 0) return res.status(404).json({ error: 'Device not found' });

      // Store outbound SMS record
      const insertResult = await query(
        `INSERT INTO sms_messages (user_id, device_id, sender_phone, message_body, direction, received_at)
         VALUES ($1, $2, $3, $4, 'outbound', NOW())
         RETURNING id`,
        [req.user.id, deviceId, to, message]
      );
      const smsId = insertResult.rows[0]?.id;

      // Check if external SMS gateway provider is configured
      if (!process.env.TEXTBEE_API_KEY && !process.env.SMS_WEBHOOK_URL) {
        return res.json({
          message: 'SMS recorded in log (SMS gateway provider not configured on this host)',
          queued: true,
          smsId,
        });
      }

      // Dispatch via configured SMS gateway
      try {
        let dispatchResult;
        if (process.env.SMS_WEBHOOK_URL) {
          const webhookRes = await fetch(process.env.SMS_WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.SMS_WEBHOOK_SECRET ? { 'X-Webhook-Secret': process.env.SMS_WEBHOOK_SECRET } : {}),
            },
            body: JSON.stringify({
              to,
              message,
              deviceId,
              deviceToken: device.rows[0].device_token,
              smsId,
              timestamp: new Date().toISOString(),
            }),
          });

          if (!webhookRes.ok) {
            throw new Error(`SMS Webhook returned HTTP ${webhookRes.status}: ${webhookRes.statusText}`);
          }
          dispatchResult = { gateway: 'webhook', status: webhookRes.status };
        } else if (process.env.TEXTBEE_API_KEY) {
          const textbeeBaseUrl = process.env.TEXTBEE_BASE_URL || 'https://api.textbee.dev/api/v1';
          const deviceToken = device.rows[0].device_token;
          const endpoint = `${textbeeBaseUrl}/gateway/devices/${encodeURIComponent(deviceToken)}/send-sms`;

          const textbeeRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': process.env.TEXTBEE_API_KEY,
            },
            body: JSON.stringify({
              recipients: [to],
              message,
            }),
          });

          if (!textbeeRes.ok) {
            throw new Error(`TextBee API returned HTTP ${textbeeRes.status}: ${textbeeRes.statusText}`);
          }
          dispatchResult = { gateway: 'textbee', status: textbeeRes.status };
        }

        logger.info({ smsId, to, deviceId, gateway: dispatchResult?.gateway }, 'Outbound SMS dispatched successfully');
        return res.json({
          message: 'SMS sent successfully via gateway',
          queued: false,
          smsId,
          gateway: dispatchResult?.gateway,
        });
      } catch (dispatchErr) {
        logger.error({ err: dispatchErr.message, smsId, to, deviceId }, 'Failed to dispatch outbound SMS via gateway provider');
        return res.status(502).json({
          error: 'Failed to dispatch outbound SMS via gateway provider',
          details: dispatchErr.message,
          queued: true,
          smsId,
        });
      }
    } catch (err) {
      next(err);
    }
  }
);

export default router;
