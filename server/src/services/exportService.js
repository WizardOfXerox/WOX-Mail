/**
 * WoxMail Export Service
 * Supports .eml (single message) and .mbox (folder batch) export formats.
 * Uses native Node.js streams — $0, zero dependencies.
 */

import * as imapService from './imap.js';

/**
 * Export a single message as RFC 5322 .eml format
 * @param {object} client - IMAP client
 * @param {string} folder - IMAP folder name
 * @param {number} uid - Message UID
 * @returns {Promise<{filename: string, content: string, contentType: string}>}
 */
export async function exportAsEml(client, folder, uid) {
  const msg = await imapService.fetchMessage(client, folder, uid);
  if (!msg) {
    throw Object.assign(new Error('Message not found'), { status: 404 });
  }

  // fetchMessage returns the raw source via msg.source or we reconstruct from msg data
  let rawSource = msg.source || msg.raw || '';

  // If raw source is unavailable, construct a minimal RFC 5322 message
  if (!rawSource) {
    const headers = [
      `From: ${typeof msg.from === 'object' ? `${msg.from.name || ''} <${msg.from.address}>` : msg.from || ''}`,
      `To: ${(msg.to || []).map(r => typeof r === 'object' ? `${r.name || ''} <${r.address}>` : r).join(', ')}`,
      `Subject: ${msg.subject || '(No Subject)'}`,
      `Date: ${msg.date || new Date().toUTCString()}`,
      `Message-ID: ${msg.messageId || `<${uid}@woxmail.export>`}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      `Content-Transfer-Encoding: quoted-printable`,
    ];
    rawSource = headers.join('\r\n') + '\r\n\r\n' + (msg.html || msg.text || '');
  }

  const safeSubject = (msg.subject || 'message').replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 60);
  return {
    filename: `${safeSubject}_${uid}.eml`,
    content: rawSource,
    contentType: 'message/rfc822',
  };
}

/**
 * Export an entire folder as .mbox format (Unix mbox — concatenated messages)
 * Each message is separated by "From " envelope line per RFC 4155.
 * @param {object} client - IMAP client
 * @param {string} folder - IMAP folder name
 * @param {object} options - { limit: number }
 * @returns {Promise<{filename: string, content: string, contentType: string, count: number}>}
 */
export async function exportAsMbox(client, folder, options = {}) {
  const limit = Math.min(options.limit || 500, 2000);
  const { messages = [] } = await imapService.fetchMessages(client, folder, { page: 1, limit });

  const mboxParts = [];

  for (const msg of messages) {
    // Build mbox envelope line
    const fromAddr = typeof msg.from === 'object' ? (msg.from.address || 'unknown') : (msg.from || 'unknown');
    const date = msg.date ? new Date(msg.date).toUTCString() : new Date().toUTCString();
    const envelopeLine = `From ${fromAddr} ${date}`;

    let body = msg.source || msg.raw || '';
    if (!body) {
      const headers = [
        `From: ${typeof msg.from === 'object' ? `${msg.from.name || ''} <${msg.from.address}>` : msg.from || ''}`,
        `To: ${(msg.to || []).map(r => typeof r === 'object' ? `${r.name || ''} <${r.address}>` : r).join(', ')}`,
        `Subject: ${msg.subject || '(No Subject)'}`,
        `Date: ${date}`,
        `Message-ID: ${msg.messageId || `<${msg.uid}@woxmail.export>`}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset=utf-8`,
      ];
      body = headers.join('\r\n') + '\r\n\r\n' + (msg.text || msg.snippet || '');
    }

    // Escape any "From " lines in message body (mbox quoting convention)
    const escapedBody = body.replace(/^From /gm, '>From ');

    mboxParts.push(envelopeLine + '\r\n' + escapedBody + '\r\n');
  }

  const safeFolderName = folder.replace(/[^a-zA-Z0-9_\- ]/g, '_');
  return {
    filename: `${safeFolderName}_export_${new Date().toISOString().split('T')[0]}.mbox`,
    content: mboxParts.join('\r\n'),
    contentType: 'application/mbox',
    count: messages.length,
  };
}

export default { exportAsEml, exportAsMbox };
