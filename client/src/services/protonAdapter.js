import { protonClient } from './protonAPI.js';

export const PROTON_FOLDER_MAP = {
  'INBOX': '0',
  'Drafts': '1',
  'Sent': '2',
  'Trash': '3',
  'Spam': '4',
  'Archive': '6',
  'Starred': '10',
  'The Feed': '0',
  'Paper Trail': '0',
  'Promotions': '0',
  'Social': '0',
};

/**
 * Fetch messages for a specific folder from Proton Mail.
 */
export async function fetchProtonMessages(folderName = 'INBOX', page = 1, limit = 25) {
  const labelId = PROTON_FOLDER_MAP[folderName] || '0';
  const pageIndex = Math.max(0, page - 1);
  const result = await protonClient.getMessages(labelId, pageIndex, limit);

  return {
    messages: result.messages.map(m => {
      const fromAddr = m.from || m.sender || 'no-reply@news.proton.me';
      const fromName = m.from_name || (fromAddr.includes('proton') ? 'Proton Official' : fromAddr);
      return {
        uid: m.id,
        id: m.id,
        subject: m.subject || '(No Subject)',
        from: {
          address: fromAddr,
          name: fromName,
        },
        from_name: fromName,
        to: [{
          address: m.recipient || '',
          name: '',
        }],
        date: m.date,
        seen: m.seen,
        starred: m.starred,
        flags: m.seen ? ['\\Seen'] : [],
        has_attachments: m.has_attachments,
        preview: '',
        provider: 'proton',
      };
    }),
    pagination: {
      page,
      limit,
      total: result.total,
      pages: Math.ceil(result.total / limit) || 1,
    }
  };
}

/**
 * Fetch and decrypt a single message from Proton Mail.
 */
export async function fetchProtonMessage(messageId) {
  const msg = await protonClient.getMessage(messageId);
  const fromAddr = msg.sender || msg.from?.address || 'no-reply@news.proton.me';
  const fromName = msg.from_name || msg.from?.name || (fromAddr.includes('proton') ? 'Proton Official' : fromAddr);

  return {
    uid: msg.id,
    id: msg.id,
    subject: msg.subject || '(No Subject)',
    from: {
      address: fromAddr,
      name: fromName,
    },
    from_name: fromName,
    to: (msg.to || []).map(r => ({
      address: typeof r === 'string' ? r : r.Address || r.address || '',
      name: typeof r === 'string' ? '' : r.Name || r.name || '',
    })),
    cc: (msg.cc || []).map(r => ({
      address: typeof r === 'string' ? r : r.Address || r.address || '',
      name: typeof r === 'string' ? '' : r.Name || r.name || '',
    })),
    date: msg.date,
    html: msg.html,
    text: msg.text,
    attachments: (msg.attachments || []).map(a => ({
      id: a.id,
      filename: a.filename || 'attachment',
      size: a.size || 0,
      contentType: a.mimeType || 'application/octet-stream',
      isProton: true,
    })),
    provider: 'proton',
  };
}

/**
 * Send an email message via Proton Mail.
 */
export async function sendProtonMessage(mailData) {
  return await protonClient.sendMail(mailData);
}
