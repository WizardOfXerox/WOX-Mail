import { query } from '../config/database.js';
import { createTransporter, sendEmail } from './smtp.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:support-service' });

/**
 * Generate next formatted ticket number: WOX-TK-00001
 */
export async function generateTicketNumber() {
  const res = await query(`SELECT LPAD(nextval('support_ticket_seq')::text, 5, '0') AS num`);
  const num = res.rows[0]?.num || '00001';
  return `WOX-TK-${num}`;
}

/**
 * Send automated notification email from support@wox.world
 */
async function sendSupportEmail({ to, subject, html, text }) {
  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const adminEmail = process.env.ADMIN_EMAIL || `admin@${domain}`;
  const supportEmail = process.env.SUPPORT_EMAIL || `support@${domain}`;
  const noReplyEmail = process.env.NO_REPLY_EMAIL || `noreply@${domain}`;
  const senderName = process.env.SYSTEM_SENDER_NAME || 'WoxMail Sovereign Support';
  const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');

  const cleanTo = (to || '').toLowerCase().trim();
  if (
    process.env.NODE_ENV === 'test' ||
    !cleanTo ||
    cleanTo === adminEmail.toLowerCase() ||
    cleanTo === supportEmail.toLowerCase() ||
    cleanTo === noReplyEmail.toLowerCase() ||
    cleanTo.startsWith('support@') ||
    cleanTo.startsWith('admin@') ||
    cleanTo.includes('mailer-daemon') ||
    cleanTo.includes('postmaster') ||
    cleanTo.includes('noreply')
  ) {
    logger.debug({ to }, 'Suppressed support email to system address or test mode');
    return;
  }

  if (!adminEmail || !adminPass) {
    logger.debug('Skipping support email: ADMIN_EMAIL or ADMIN_PASSWORD not configured');
    return;
  }

  try {
    const transporter = createTransporter(adminEmail, adminPass);
    await sendEmail(transporter, {
      from: `"${senderName}" <${supportEmail}>`,
      to: cleanTo,
      subject,
      html,
      text
    });
  } catch (err) {
    logger.warn({ err: err.message, to }, 'Failed to send support notification email');
  }
}

/**
 * Create a new support ticket (from Web UI or API)
 */
export async function createTicket(userId, { creatorEmail, creatorName, subject, category = 'general', priority = 'medium', messageText, attachments = [] }) {
  const ticketNumber = await generateTicketNumber();

  const VALID_CATEGORIES = ['general', 'security', 'delivery', 'tempmail', 'vault', 'bug', 'feature'];
  const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
  const safeCategory = VALID_CATEGORIES.includes(category?.toLowerCase()) ? category.toLowerCase() : 'general';
  const safePriority = VALID_PRIORITIES.includes(priority?.toLowerCase()) ? priority.toLowerCase() : 'medium';

  const ticketRes = await query(
    `INSERT INTO support_tickets (ticket_number, user_id, creator_email, creator_name, subject, category, priority, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')
     RETURNING *`,
    [ticketNumber, userId || null, creatorEmail.toLowerCase().trim(), creatorName?.trim() || '', subject.trim(), safeCategory, safePriority]
  );

  const ticket = ticketRes.rows[0];

  // Insert initial message
  await query(
    `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_email, message_text, attachments, is_internal_note)
     VALUES ($1, 'user', $2, $3, $4, $5, FALSE)`,
    [ticket.id, userId || null, creatorEmail.toLowerCase().trim(), messageText.trim(), JSON.stringify(attachments)]
  );

  // Send acknowledgement email
  await sendSupportEmail({
    to: creatorEmail,
    subject: `[${ticketNumber}] We received your support request: ${subject}`,
    text: `Hello ${creatorName || 'Member'},\n\nThank you for reaching out. Your ticket #${ticketNumber} has been opened.\nCategory: ${category}\nPriority: ${priority}\n\nOur team will review your request shortly.\n\nYou can reply directly to this email to add more details.\n\n— WoxMail Sovereign Support`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #f0f0f5; padding: 30px; border-radius: 12px;">
        <div style="max-width: 580px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; padding: 25px;">
          <h2 style="color: #7c3aed; margin-top: 0;">Support Ticket Opened: <span style="color: #f0f0f5;">${ticketNumber}</span></h2>
          <p>Hello ${creatorName || 'Member'},</p>
          <p>We have received your support request regarding <strong>${subject}</strong>.</p>
          <div style="background: #141424; border-left: 4px solid #7c3aed; padding: 12px 16px; margin: 15px 0; border-radius: 4px;">
            <p style="margin: 0 0 6px 0; font-size: 13px; color: #9898b0;"><strong>Category:</strong> ${category.toUpperCase()} | <strong>Priority:</strong> ${priority.toUpperCase()}</p>
            <p style="margin: 0; color: #e0e0f0;">${messageText}</p>
          </div>
          <p style="color: #9898b0; font-size: 13px;">You can track this ticket from your <a href="${process.env.BASE_URL || 'https://' + (process.env.DOMAIN_TEMP || 'mail.wox.world')}/dashboard" style="color: #8b5cf6;">WoxMail Dashboard</a> or simply reply to this email.</p>
          <hr style="border: 0; border-top: 1px solid #2a2a4a; margin: 20px 0;" />
          <p style="color: #6868a0; font-size: 11px; margin: 0;">WoxMail Sovereign Privacy Suite • ${process.env.SUPPORT_EMAIL || 'support@' + (process.env.DOMAIN_PERMANENT || 'wox.world')}</p>
        </div>
      </div>
    `
  });

  return ticket;
}

/**
 * Handle incoming email to support@wox.world
 */
export async function createTicketFromEmail(fromEmail, fromName, subject, bodyText, attachments = []) {
  const match = (subject || '').match(/\[(WOX-TK-\d+)\]/i);

  if (match) {
    const ticketNumber = match[1].toUpperCase();
    const existing = await query('SELECT * FROM support_tickets WHERE ticket_number = $1', [ticketNumber]);

    if (existing.rows.length > 0) {
      const ticket = existing.rows[0];
      await query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, sender_email, message_text, attachments, is_internal_note)
         VALUES ($1, 'user', $2, $3, $4, FALSE)`,
        [ticket.id, fromEmail.toLowerCase().trim(), bodyText.trim(), JSON.stringify(attachments)]
      );

      // Reopen ticket if it was resolved or waiting
      await query(
        `UPDATE support_tickets
         SET status = 'open', updated_at = NOW()
         WHERE id = $1 AND status IN ('resolved', 'waiting_customer')`,
        [ticket.id]
      );

      return { action: 'appended', ticketNumber };
    }
  }

  // Create brand new ticket
  const ticket = await createTicket(null, {
    creatorEmail: fromEmail,
    creatorName: fromName,
    subject: subject || 'No Subject Support Request',
    category: 'general',
    priority: 'medium',
    messageText: bodyText || '(Empty message body)',
    attachments
  });

  return { action: 'created', ticketNumber: ticket.ticket_number };
}

/**
 * Add message / reply to a ticket thread
 */
export async function addMessage(ticketId, { senderType = 'user', senderId = null, senderEmail, messageText, attachments = [], isInternalNote = false }) {
  const ticketRes = await query('SELECT * FROM support_tickets WHERE id = $1', [ticketId]);
  if (ticketRes.rows.length === 0) {
    throw new Error('Ticket not found');
  }

  const ticket = ticketRes.rows[0];

  const msgRes = await query(
    `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_email, message_text, attachments, is_internal_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [ticketId, senderType, senderId, senderEmail, messageText.trim(), JSON.stringify(attachments), isInternalNote]
  );

  // If staff replied and it's not an internal note, email the user
  if (senderType === 'staff' && !isInternalNote) {
    await query(
      `UPDATE support_tickets
       SET status = 'waiting_customer', updated_at = NOW()
       WHERE id = $1`,
      [ticketId]
    );

    await sendSupportEmail({
      to: ticket.creator_email,
      subject: `[${ticket.ticket_number}] Update on your support ticket: ${ticket.subject}`,
      text: `Hello,\n\nOur support team replied to your ticket #${ticket.ticket_number}:\n\n${messageText}\n\nReply to this email or visit https://mail.wox.world/dashboard to reply.\n\n— WoxMail Support`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #f0f0f5; padding: 30px; border-radius: 12px;">
          <div style="max-width: 580px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 10px; padding: 25px;">
            <h3 style="color: #7c3aed; margin-top: 0;">New Reply on <span style="color: #f0f0f5;">${ticket.ticket_number}</span></h3>
            <p><strong>Subject:</strong> ${ticket.subject}</p>
            <div style="background: #141424; border-left: 4px solid #22c55e; padding: 14px 18px; margin: 15px 0; border-radius: 4px; color: #f0f0f5;">
              ${messageText}
            </div>
            <p style="color: #9898b0; font-size: 13px;">You can reply directly to this email to continue the conversation.</p>
          </div>
        </div>
      `
    });
  } else if (senderType === 'user') {
    await query(
      `UPDATE support_tickets
       SET status = 'open', updated_at = NOW()
       WHERE id = $1`,
      [ticketId]
    );
  }

  return msgRes.rows[0];
}

/**
 * Update ticket metadata (status, priority, assigned_to)
 */
export async function updateTicketStatus(ticketId, { status, priority, category, assignedTo }) {
  const updates = [];
  const params = [ticketId];

  if (status) {
    params.push(status);
    updates.push(`status = $${params.length}`);
    if (status === 'resolved') {
      updates.push('resolved_at = NOW()');
    } else if (status === 'closed') {
      updates.push('closed_at = NOW()');
    }
  }

  if (priority) {
    params.push(priority);
    updates.push(`priority = $${params.length}`);
  }

  if (category) {
    params.push(category);
    updates.push(`category = $${params.length}`);
  }

  if (assignedTo !== undefined) {
    params.push(assignedTo);
    updates.push(`assigned_to = $${params.length}`);
  }

  updates.push('updated_at = NOW()');

  const result = await query(
    `UPDATE support_tickets
     SET ${updates.join(', ')}
     WHERE id = $1
     RETURNING *`,
    params
  );

  return result.rows[0] || null;
}

/**
 * List tickets with filter options
 */
export async function listTickets({ userId = null, status, category, priority, assignedTo, page = 1, limit = 25 } = {}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (userId) {
    params.push(userId);
    conditions.push(`t.user_id = $${params.length}`);
  }

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (category && category !== 'all') {
    params.push(category);
    conditions.push(`t.category = $${params.length}`);
  }

  if (priority && priority !== 'all') {
    params.push(priority);
    conditions.push(`t.priority = $${params.length}`);
  }

  if (assignedTo) {
    params.push(assignedTo);
    conditions.push(`t.assigned_to = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM support_tickets t ${where}`, params);
  const total = countRes.rows[0]?.total || 0;

  params.push(limit, offset);
  const rowsRes = await query(
    `SELECT t.*,
            u.username AS assigned_username,
            (SELECT message_text FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
            (SELECT COUNT(*)::int FROM ticket_messages WHERE ticket_id = t.id) AS message_count
     FROM support_tickets t
     LEFT JOIN users u ON u.id = t.assigned_to
     ${where}
     ORDER BY t.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    tickets: rowsRes.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Get ticket thread with all messages
 */
export async function getTicketThread(ticketId, userId = null, isAdmin = false) {
  let ticketQuery = 'SELECT t.*, u.username AS assigned_username FROM support_tickets t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.id = $1';
  const params = [ticketId];

  if (!isAdmin && userId) {
    ticketQuery += ' AND t.user_id = $2';
    params.push(userId);
  }

  const ticketRes = await query(ticketQuery, params);
  if (ticketRes.rows.length === 0) return null;

  const ticket = ticketRes.rows[0];

  // Filter internal notes for non-admins
  let msgQuery = 'SELECT * FROM ticket_messages WHERE ticket_id = $1';
  if (!isAdmin) {
    msgQuery += ' AND is_internal_note = FALSE';
  }
  msgQuery += ' ORDER BY created_at ASC';

  const msgRes = await query(msgQuery, [ticketId]);

  return {
    ticket,
    messages: msgRes.rows
  };
}

/**
 * Get aggregated helpdesk statistics
 */
export async function getSupportStats() {
  const result = await query(`
    SELECT
      COUNT(*)::int AS total_tickets,
      COUNT(CASE WHEN status = 'open' THEN 1 END)::int AS open_tickets,
      COUNT(CASE WHEN status = 'in_progress' THEN 1 END)::int AS in_progress_tickets,
      COUNT(CASE WHEN status = 'waiting_customer' THEN 1 END)::int AS waiting_tickets,
      COUNT(CASE WHEN status = 'resolved' THEN 1 END)::int AS resolved_tickets,
      COUNT(CASE WHEN status = 'closed' THEN 1 END)::int AS closed_tickets,
      COUNT(CASE WHEN priority = 'urgent' AND status NOT IN ('resolved', 'closed') THEN 1 END)::int AS urgent_open
    FROM support_tickets
  `);
  return result.rows[0];
}

/**
 * Format support tickets as interactive webmail messages for support@wox.world inbox.
 */
export async function getSupportTicketsAsMessages({ page = 1, limit = 25, search = '', status = 'all' } = {}) {
  const offset = Math.max(0, (page - 1) * limit);
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (search) {
    params.push(`%${search.toLowerCase().trim()}%`);
    conditions.push(`(
      LOWER(t.ticket_number) LIKE $${params.length} OR
      LOWER(t.subject) LIKE $${params.length} OR
      LOWER(t.creator_email) LIKE $${params.length} OR
      LOWER(t.creator_name) LIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await query(`SELECT COUNT(*) AS total FROM support_tickets t ${whereClause}`, params);
  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const dataRes = await query(
    `SELECT t.*, 
            (SELECT message_text FROM ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS latest_message,
            (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = t.id) AS message_count
     FROM support_tickets t
     ${whereClause}
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  const messages = dataRes.rows.map((t) => {
    const statusUpper = (t.status || 'open').toUpperCase().replace('_', ' ');
    const priorityUpper = (t.priority || 'medium').toUpperCase();
    const categoryUpper = (t.category || 'general').toUpperCase();

    return {
      uid: `ticket_${t.id}`,
      id: t.id,
      ticketNumber: t.ticket_number,
      subject: `[${t.ticket_number}] [${statusUpper}] ${t.subject}`,
      rawSubject: t.subject,
      from: {
        address: t.creator_email,
        name: t.creator_name || t.creator_email,
      },
      from_name: t.creator_name || t.creator_email,
      to: [{ address: 'support@wox.world', name: 'WoxMail Support Desk' }],
      date: t.updated_at || t.created_at,
      seen: t.status !== 'open',
      starred: t.priority === 'urgent' || t.priority === 'high',
      flags: t.status !== 'open' ? ['\\Seen'] : [],
      preview: `${categoryUpper} • ${priorityUpper} — ${t.latest_message || ''}`.slice(0, 140),
      isSupportTicket: true,
      category: t.category,
      priority: t.priority,
      status: t.status,
      messageCount: parseInt(t.message_count || 1, 10),
    };
  });

  return {
    messages,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Fetch full ticket thread formatted for webmail message viewer
 */
export async function getSupportTicketMessageById(id) {
  const numId = parseInt(String(id).replace(/^ticket_/, ''), 10);
  if (isNaN(numId)) return null;

  const thread = await getTicketThread(numId, null, true);
  if (!thread) return null;

  const { ticket, messages } = thread;
  const statusUpper = (ticket.status || 'open').toUpperCase().replace('_', ' ');
  const priorityUpper = (ticket.priority || 'medium').toUpperCase();

  const conversationHtml = messages.map((m) => {
    const isStaff = m.sender_type === 'staff' || m.sender_type === 'admin';
    const bg = isStaff ? '#1e1b4b' : '#18182f';
    const border = isStaff ? '#8b5cf6' : '#2a2a4a';
    const title = isStaff ? '🛡️ Support Staff Reply' : `👤 ${m.sender_email}`;
    const time = new Date(m.created_at).toLocaleString();

    return `
      <div style="margin-bottom: 16px; background: ${bg}; border: 1px solid ${border}; border-radius: 8px; padding: 14px 18px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; color: #a5b4fc;">
          <strong>${title}</strong>
          <span>${time}</span>
        </div>
        <div style="color: #f0f0f5; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">${m.message_text}</div>
      </div>
    `;
  }).join('');

  const fullHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f0f0f5;">
      <div style="background: #141424; border: 1px solid #2a2a4a; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
          <span style="background: #7c3aed; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${ticket.ticket_number}</span>
          <span style="background: #252545; color: #e0e0f0; padding: 2px 8px; border-radius: 4px; font-size: 12px;">STATUS: ${statusUpper}</span>
          <span style="background: #252545; color: #e0e0f0; padding: 2px 8px; border-radius: 4px; font-size: 12px;">PRIORITY: ${priorityUpper}</span>
          <span style="background: #252545; color: #e0e0f0; padding: 2px 8px; border-radius: 4px; font-size: 12px;">CATEGORY: ${(ticket.category || 'general').toUpperCase()}</span>
        </div>
        <div style="font-size: 13px; color: #9898b0;">
          Requester: <strong style="color: #f0f0f5;">${ticket.creator_name || ticket.creator_email}</strong> (${ticket.creator_email})
        </div>
      </div>
      <h4 style="color: #c4b5fd; margin-bottom: 12px;">Conversation History (${messages.length} message${messages.length === 1 ? '' : 's'})</h4>
      ${conversationHtml}
    </div>
  `;

  return {
    uid: `ticket_${ticket.id}`,
    id: ticket.id,
    ticketNumber: ticket.ticket_number,
    subject: `[${ticket.ticket_number}] [${statusUpper}] ${ticket.subject}`,
    rawSubject: ticket.subject,
    from: {
      address: ticket.creator_email,
      name: ticket.creator_name || ticket.creator_email,
    },
    from_name: ticket.creator_name || ticket.creator_email,
    to: [{ address: 'support@wox.world', name: 'WoxMail Support Desk' }],
    date: ticket.updated_at || ticket.created_at,
    html: fullHtml,
    text: messages.map(m => `[${m.sender_type.toUpperCase()} - ${new Date(m.created_at).toLocaleString()}]\n${m.message_text}`).join('\n\n---\n\n'),
    isSupportTicket: true,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
  };
}

export default {
  generateTicketNumber,
  createTicket,
  createTicketFromEmail,
  addMessage,
  updateTicketStatus,
  listTickets,
  getTicketThread,
  getSupportStats,
  getSupportTicketsAsMessages,
  getSupportTicketMessageById,
};
