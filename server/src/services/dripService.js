import { query } from '../config/database.js';
import { createTransporter, sendEmail } from './smtp.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:drip-service' });

/**
 * Create a new drip sequence.
 */
export async function createSequence(userId, listId, { name, description = '' }) {
  const result = await query(
    `INSERT INTO drip_sequences (user_id, list_id, name, description, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING *`,
    [userId, listId, name.trim(), description.trim()]
  );
  return result.rows[0];
}

/**
 * List all drip sequences for a list (or user).
 */
export async function listSequences(userId, listId) {
  let q = `
    SELECT ds.*, 
           COUNT(DISTINCT dst.id)::int AS total_steps,
           COUNT(DISTINCT dq.id)::int AS total_queued
    FROM drip_sequences ds
    LEFT JOIN drip_steps dst ON dst.sequence_id = ds.id
    LEFT JOIN drip_queue dq ON dq.sequence_id = ds.id AND dq.status = 'pending'
    WHERE ds.user_id = $1
  `;
  const params = [userId];

  if (listId) {
    params.push(listId);
    q += ` AND ds.list_id = $2`;
  }

  q += ` GROUP BY ds.id ORDER BY ds.created_at DESC`;

  const result = await query(q, params);
  return result.rows;
}

/**
 * Get a single drip sequence by ID with all its steps.
 */
export async function getSequence(userId, sequenceId) {
  const seqRes = await query(
    `SELECT * FROM drip_sequences WHERE id = $1 AND user_id = $2`,
    [sequenceId, userId]
  );
  if (seqRes.rows.length === 0) return null;

  const stepsRes = await query(
    `SELECT * FROM drip_steps WHERE sequence_id = $1 ORDER BY step_order ASC`,
    [sequenceId]
  );

  return {
    ...seqRes.rows[0],
    steps: stepsRes.rows
  };
}

/**
 * Update a sequence (e.g. toggle is_active, rename).
 */
export async function updateSequence(userId, sequenceId, { name, description, is_active }) {
  const current = await query(
    `SELECT * FROM drip_sequences WHERE id = $1 AND user_id = $2`,
    [sequenceId, userId]
  );
  if (current.rows.length === 0) return null;

  const row = current.rows[0];
  const newName = name !== undefined ? name.trim() : row.name;
  const newDesc = description !== undefined ? description.trim() : row.description;
  const newActive = is_active !== undefined ? is_active : row.is_active;

  const result = await query(
    `UPDATE drip_sequences 
     SET name = $1, description = $2, is_active = $3, updated_at = NOW()
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [newName, newDesc, newActive, sequenceId, userId]
  );
  return result.rows[0];
}

/**
 * Delete a sequence and cascade steps & queue.
 */
export async function deleteSequence(userId, sequenceId) {
  const result = await query(
    `DELETE FROM drip_sequences WHERE id = $1 AND user_id = $2 RETURNING id`,
    [sequenceId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Add a step to a sequence.
 */
export async function addStep(userId, sequenceId, stepData) {
  // Ensure user owns sequence
  const ownerCheck = await query(
    `SELECT id FROM drip_sequences WHERE id = $1 AND user_id = $2`,
    [sequenceId, userId]
  );
  if (ownerCheck.rows.length === 0) {
    throw new Error('Sequence not found or access denied');
  }

  const {
    step_order,
    delay_days = 0,
    delay_hours = 0,
    subject,
    from_name = 'WoxMail',
    from_email,
    html_content,
    plain_content = ''
  } = stepData;

  // Determine order if not specified
  let order = step_order;
  if (!order) {
    const maxRes = await query(
      `SELECT COALESCE(MAX(step_order), 0) + 1 AS next_order FROM drip_steps WHERE sequence_id = $1`,
      [sequenceId]
    );
    order = maxRes.rows[0].next_order;
  }

  const result = await query(
    `INSERT INTO drip_steps 
     (sequence_id, step_order, delay_days, delay_hours, subject, from_name, from_email, html_content, plain_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      sequenceId,
      order,
      delay_days,
      delay_hours,
      subject.trim(),
      from_name.trim(),
      from_email ? from_email.trim() : null,
      html_content,
      plain_content
    ]
  );
  return result.rows[0];
}

/**
 * List steps in a sequence.
 */
export async function listSteps(sequenceId) {
  const res = await query(
    `SELECT * FROM drip_steps WHERE sequence_id = $1 ORDER BY step_order ASC`,
    [sequenceId]
  );
  return res.rows;
}

/**
 * Update an existing step.
 */
export async function updateStep(userId, stepId, stepData) {
  const check = await query(
    `SELECT ds.id FROM drip_steps ds
     JOIN drip_sequences s ON s.id = ds.sequence_id
     WHERE ds.id = $1 AND s.user_id = $2`,
    [stepId, userId]
  );
  if (check.rows.length === 0) return null;

  const currentRes = await query(`SELECT * FROM drip_steps WHERE id = $1`, [stepId]);
  const cur = currentRes.rows[0];

  const order = stepData.step_order !== undefined ? stepData.step_order : cur.step_order;
  const days = stepData.delay_days !== undefined ? stepData.delay_days : cur.delay_days;
  const hours = stepData.delay_hours !== undefined ? stepData.delay_hours : cur.delay_hours;
  const subj = stepData.subject !== undefined ? stepData.subject.trim() : cur.subject;
  const fName = stepData.from_name !== undefined ? stepData.from_name.trim() : cur.from_name;
  const fEmail = stepData.from_email !== undefined ? stepData.from_email.trim() : cur.from_email;
  const html = stepData.html_content !== undefined ? stepData.html_content : cur.html_content;
  const plain = stepData.plain_content !== undefined ? stepData.plain_content : cur.plain_content;

  const result = await query(
    `UPDATE drip_steps
     SET step_order = $1, delay_days = $2, delay_hours = $3, subject = $4,
         from_name = $5, from_email = $6, html_content = $7, plain_content = $8,
         updated_at = NOW()
     WHERE id = $9
     RETURNING *`,
    [order, days, hours, subj, fName, fEmail, html, plain, stepId]
  );
  return result.rows[0];
}

/**
 * Delete a step.
 */
export async function deleteStep(userId, stepId) {
  const check = await query(
    `SELECT ds.id FROM drip_steps ds
     JOIN drip_sequences s ON s.id = ds.sequence_id
     WHERE ds.id = $1 AND s.user_id = $2`,
    [stepId, userId]
  );
  if (check.rows.length === 0) return false;

  await query(`DELETE FROM drip_steps WHERE id = $1`, [stepId]);
  return true;
}

/**
 * Enroll a subscriber in all active drip sequences on their list.
 */
export async function enrollSubscriberInDrips(subscriber) {
  if (!subscriber || !subscriber.list_id || subscriber.status !== 'active') {
    return 0;
  }

  const seqs = await query(
    `SELECT id FROM drip_sequences WHERE list_id = $1 AND is_active = true`,
    [subscriber.list_id]
  );

  let enrolled = 0;
  for (const seq of seqs.rows) {
    // Find first step
    const firstStepRes = await query(
      `SELECT * FROM drip_steps WHERE sequence_id = $1 ORDER BY step_order ASC LIMIT 1`,
      [seq.id]
    );

    if (firstStepRes.rows.length > 0) {
      const step = firstStepRes.rows[0];
      const delayMs = (step.delay_days * 24 * 60 + step.delay_hours * 60) * 60 * 1000;
      const scheduledAt = new Date(Date.now() + delayMs);

      const ins = await query(
        `INSERT INTO drip_queue (sequence_id, step_id, subscriber_id, scheduled_at, status)
         VALUES ($1, $2, $3, $4, 'pending')
         ON CONFLICT (step_id, subscriber_id) DO NOTHING
         RETURNING id`,
        [seq.id, step.id, subscriber.id, scheduledAt]
      );

      if (ins.rows.length > 0) enrolled++;

      logger.info({
        subscriberId: subscriber.id,
        sequenceId: seq.id,
        stepId: step.id,
        scheduledAt
      }, 'Enrolled subscriber in drip step');
    }
  }
  return enrolled;
}

/**
 * Helper to substitute merge tags in email content.
 */
function substituteMergeTags(template, subscriber, appDomain = 'wox.world') {
  if (!template) return '';
  const unsubUrl = `https://${appDomain}/api/campaigns/unsubscribe/${subscriber.unsubscribe_token}`;
  
  return template
    .replace(/\{\{\s*first_name\s*\}\}/gi, subscriber.first_name || 'Subscriber')
    .replace(/\{\{\s*last_name\s*\}\}/gi, subscriber.last_name || '')
    .replace(/\{\{\s*email\s*\}\}/gi, subscriber.email || '')
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsubUrl);
}

/**
 * Background worker: Process pending due drip steps.
 */
export async function processDueDripSteps(batchSize = 25) {
  const queueRes = await query(
    `SELECT dq.id AS queue_id, dq.sequence_id, dq.step_id, dq.subscriber_id,
            dst.step_order, dst.delay_days, dst.delay_hours, dst.subject, dst.from_name,
            dst.from_email, dst.html_content, dst.plain_content,
            s.email AS sub_email, s.first_name, s.last_name, s.status AS sub_status,
            s.unsubscribe_token,
            u.email AS sender_user_email, u.imap_password, u.is_admin AS sender_is_admin
     FROM drip_queue dq
     JOIN drip_steps dst ON dst.id = dq.step_id
     JOIN drip_sequences ds ON ds.id = dq.sequence_id
     JOIN users u ON u.id = ds.user_id
     JOIN subscribers s ON s.id = dq.subscriber_id
     WHERE dq.status = 'pending' 
       AND dq.scheduled_at <= NOW()
       AND ds.is_active = true
     ORDER BY dq.scheduled_at ASC
     LIMIT $1`,
    [batchSize]
  );

  let processed = 0;

  for (const item of queueRes.rows) {
    // 1. If subscriber unsubscribed or inactive, cancel and don't advance
    if (item.sub_status !== 'active') {
      await query(
        `UPDATE drip_queue SET status = 'cancelled', error = 'Subscriber is inactive or unsubscribed' WHERE id = $1`,
        [item.queue_id]
      );
      continue;
    }

    try {
      const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
      const fromAddr = item.from_email || item.sender_user_email || (process.env.ADMIN_EMAIL || `newsletter@${domain}`);
      const fromHeader = item.from_name ? `"${item.from_name}" <${fromAddr}>` : fromAddr;
      const htmlBody = substituteMergeTags(item.html_content, item);
      const plainBody = substituteMergeTags(item.plain_content || '', item);
      const appBaseUrl = process.env.APP_URL || `https://mail.${domain}`;
      const unsubUrl = `${appBaseUrl}/api/campaigns/unsubscribe/${item.unsubscribe_token}`;
      const pass = item.imap_password || (item.sender_is_admin ? (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '') : null);
      if (!pass) {
        throw new Error('No valid outbound credentials for drip sender');
      }
      const transporter = createTransporter(fromAddr, pass);

      // 2. Dispatch via SMTP
      await sendEmail(transporter, {
        from: fromHeader,
        to: item.sub_email,
        subject: substituteMergeTags(item.subject, item),
        text: plainBody,
        html: htmlBody,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>, <mailto:unsub@${domain}?subject=unsub-${item.unsubscribe_token}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'X-WoxMail-Drip-Step': String(item.step_id)
        }
      });

      // 3. Mark current step as sent
      await query(
        `UPDATE drip_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [item.queue_id]
      );

      // 4. Queue next step if one exists
      const nextStepRes = await query(
        `SELECT * FROM drip_steps 
         WHERE sequence_id = $1 AND step_order > $2 
         ORDER BY step_order ASC LIMIT 1`,
        [item.sequence_id, item.step_order]
      );

      if (nextStepRes.rows.length > 0) {
        const nextStep = nextStepRes.rows[0];
        const delayMs = (nextStep.delay_days * 24 * 60 + nextStep.delay_hours * 60) * 60 * 1000;
        const nextScheduledAt = new Date(Date.now() + delayMs);

        await query(
          `INSERT INTO drip_queue (sequence_id, step_id, subscriber_id, scheduled_at, status)
           VALUES ($1, $2, $3, $4, 'pending')
           ON CONFLICT (step_id, subscriber_id) DO NOTHING`,
          [item.sequence_id, nextStep.id, item.subscriber_id, nextScheduledAt]
        );
      }

      processed++;
    } catch (err) {
      logger.error({ err: err.message, queueId: item.queue_id }, 'Failed to dispatch drip step');
      await query(
        `UPDATE drip_queue SET status = 'failed', error = $1 WHERE id = $2`,
        [err.message, item.queue_id]
      );
    }
  }

  return processed;
}
