import crypto from 'crypto';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:compliance-archive' });

/**
 * Calculate tamper-evident SHA-256 checksum for legal & compliance non-repudiation.
 */
function calculateChecksum(payload) {
  const data = [
    payload.direction,
    payload.senderAddress,
    (payload.recipientAddresses || []).sort().join(','),
    payload.subject || '',
    payload.bodyText || payload.bodyHtml || '',
    payload.sentOrReceivedAt ? new Date(payload.sentOrReceivedAt).toISOString() : new Date().toISOString(),
  ].join('|');

  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Archive an incoming or outgoing email into the Domain-Wide Compliance Vault.
 */
export async function archiveEmail({
  direction = 'outbound',
  mailboxOwnerId = null,
  mailboxOwnerEmail,
  senderAddress,
  senderName = '',
  recipientAddresses = [],
  ccAddresses = [],
  bccAddresses = [],
  subject = '(No Subject)',
  bodyHtml = '',
  bodyText = '',
  attachments = [],
  headers = {},
  ipAddress = null,
  provider = 'woxmail',
  sentOrReceivedAt = new Date(),
  messageId = null,
}) {
  const cleanOwnerEmail = (mailboxOwnerEmail || senderAddress || 'system@wox.world').toLowerCase().trim();
  const cleanSender = (senderAddress || 'system@wox.world').trim();
  const cleanRecipients = Array.isArray(recipientAddresses)
    ? recipientAddresses.map(r => (typeof r === 'object' ? (r.address || r.email || '') : String(r)).trim()).filter(Boolean)
    : [String(recipientAddresses || '').trim()].filter(Boolean);

  const cleanCc = Array.isArray(ccAddresses)
    ? ccAddresses.map(r => (typeof r === 'object' ? (r.address || r.email || '') : String(r)).trim()).filter(Boolean)
    : (ccAddresses ? [String(ccAddresses).trim()] : []);

  const cleanBcc = Array.isArray(bccAddresses)
    ? bccAddresses.map(r => (typeof r === 'object' ? (r.address || r.email || '') : String(r)).trim()).filter(Boolean)
    : (bccAddresses ? [String(bccAddresses).trim()] : []);

  const checksum = calculateChecksum({
    direction,
    senderAddress: cleanSender,
    recipientAddresses: cleanRecipients,
    subject,
    bodyText,
    bodyHtml,
    sentOrReceivedAt,
  });

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  try {
    const res = await query(
      `INSERT INTO compliance_archive (
        message_id, direction, mailbox_owner_id, mailbox_owner_email,
        sender_address, sender_name, recipient_addresses, cc_addresses, bcc_addresses,
        subject, body_html, body_text, has_attachments, attachments,
        headers, ip_address, provider, checksum, sent_or_received_at, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
      RETURNING id, checksum, created_at`,
      [
        messageId || `comp-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        direction,
        mailboxOwnerId,
        cleanOwnerEmail,
        cleanSender,
        senderName || '',
        cleanRecipients,
        cleanCc,
        cleanBcc,
        subject || '(No Subject)',
        bodyHtml || '',
        bodyText || '',
        hasAttachments,
        JSON.stringify(attachments || []),
        JSON.stringify(headers || {}),
        ipAddress,
        provider,
        checksum,
        sentOrReceivedAt,
      ]
    );

    logger.info(
      { id: res.rows[0]?.id, direction, sender: cleanSender, to: cleanRecipients, checksum },
      'Archived email in domain-wide compliance journal'
    );

    return res.rows[0];
  } catch (err) {
    logger.error({ err: err.message, direction, sender: cleanSender }, 'Failed to write compliance archive entry');
    return null;
  }
}

/**
 * Retrieve paginated archived messages for archive@wox.world / Admin Review.
 */
export async function getArchivedMessages({
  page = 1,
  limit = 25,
  search = '',
  direction = 'all',
  mailbox = '',
} = {}) {
  const offset = Math.max(0, (page - 1) * limit);
  const conditions = [];
  const params = [];

  if (direction && direction !== 'all') {
    params.push(direction);
    conditions.push(`direction = $${params.length}`);
  }

  if (mailbox) {
    params.push(`%${mailbox.toLowerCase().trim()}%`);
    conditions.push(`(LOWER(mailbox_owner_email) LIKE $${params.length} OR LOWER(sender_address) LIKE $${params.length} OR $${params.length} = ANY(recipient_addresses))`);
  }

  if (search) {
    params.push(`%${search.toLowerCase().trim()}%`);
    conditions.push(`(
      LOWER(subject) LIKE $${params.length} OR
      LOWER(sender_address) LIKE $${params.length} OR
      LOWER(sender_name) LIKE $${params.length} OR
      LOWER(body_text) LIKE $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count
  const countRes = await query(`SELECT COUNT(*) AS total FROM compliance_archive ${whereClause}`, params);
  const total = parseInt(countRes.rows[0]?.total || 0, 10);

  // Fetch paginated records
  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const dataRes = await query(
    `SELECT id, message_id, direction, mailbox_owner_email, sender_address, sender_name,
            recipient_addresses, cc_addresses, bcc_addresses, subject, body_text, has_attachments,
            attachments, provider, checksum, is_read, is_starred, sent_or_received_at, created_at
     FROM compliance_archive
     ${whereClause}
     ORDER BY sent_or_received_at DESC, id DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  const messages = dataRes.rows.map((r) => {
    const isOutbound = r.direction === 'outbound';
    const tag = isOutbound ? '[OUTBOUND]' : '[INBOUND]';
    const cleanSender = r.sender_name ? `${r.sender_name} <${r.sender_address}>` : r.sender_address;

    return {
      uid: `comp_${r.id}`,
      id: r.id,
      messageId: r.message_id,
      direction: r.direction,
      subject: `${tag} ${r.subject || '(No Subject)'}`,
      rawSubject: r.subject,
      from: {
        address: r.sender_address,
        name: r.sender_name || (isOutbound ? `Sent by ${r.mailbox_owner_email}` : r.sender_address),
      },
      from_name: r.sender_name || r.sender_address,
      to: (r.recipient_addresses || []).map((addr) => ({ address: addr, name: '' })),
      cc: (r.cc_addresses || []).map((addr) => ({ address: addr, name: '' })),
      bcc: (r.bcc_addresses || []).map((addr) => ({ address: addr, name: '' })),
      date: r.sent_or_received_at,
      seen: true,
      starred: r.is_starred,
      flags: ['\\Seen'],
      has_attachments: r.has_attachments,
      preview: (r.body_text || '').slice(0, 140).replace(/\s+/g, ' '),
      mailboxOwnerEmail: r.mailbox_owner_email,
      provider: r.provider,
      checksum: r.checksum,
      isComplianceArchive: true,
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
 * Fetch full details of an individual archived compliance message.
 */
export async function getArchivedMessageById(id) {
  const numId = parseInt(String(id).replace(/^comp_/, ''), 10);
  if (isNaN(numId)) return null;

  const res = await query(`SELECT * FROM compliance_archive WHERE id = $1`, [numId]);
  if (res.rows.length === 0) return null;

  const r = res.rows[0];
  const isOutbound = r.direction === 'outbound';
  const tag = isOutbound ? '[OUTBOUND]' : '[INBOUND]';

  return {
    uid: `comp_${r.id}`,
    id: r.id,
    messageId: r.message_id,
    direction: r.direction,
    subject: `${tag} ${r.subject || '(No Subject)'}`,
    rawSubject: r.subject,
    from: {
      address: r.sender_address,
      name: r.sender_name || r.sender_address,
    },
    from_name: r.sender_name || r.sender_address,
    to: (r.recipient_addresses || []).map((addr) => ({ address: addr, name: '' })),
    cc: (r.cc_addresses || []).map((addr) => ({ address: addr, name: '' })),
    bcc: (r.bcc_addresses || []).map((addr) => ({ address: addr, name: '' })),
    date: r.sent_or_received_at,
    html: r.body_html || (r.body_text ? `<pre style="white-space:pre-wrap;font-family:inherit;">${r.body_text}</pre>` : '<p style="color:#9898b0;">(Empty message body)</p>'),
    text: r.body_text || '',
    attachments: (typeof r.attachments === 'string' ? JSON.parse(r.attachments) : r.attachments) || [],
    headers: (typeof r.headers === 'string' ? JSON.parse(r.headers) : r.headers) || {},
    mailboxOwnerEmail: r.mailbox_owner_email,
    provider: r.provider,
    checksum: r.checksum,
    ipAddress: r.ip_address,
    isComplianceArchive: true,
  };
}
