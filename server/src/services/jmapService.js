/**
 * WoxMail JMAP (JSON Meta Application Protocol - RFC 8620 & RFC 8621) Engine
 * High-performance modern JSON batch synchronization engine for webmail and mobile clients.
 * Connected directly to database indexes and user mailboxes.
 */

import { query } from '../config/database.js';
import { generateBlindTokens } from './zeroKnowledgeSearchService.js';

/**
 * Returns the JMAP Session Object (RFC 8620 Section 2).
 * @param {object} user - Authenticated user object
 * @param {string} baseUrl
 * @returns {object}
 */
export function getJmapSession(user, baseUrl = 'https://mail.wox.world') {
  const accountId = `usr_${user.id}`;

  return {
    capabilities: {
      'urn:ietf:params:jmap:core': {
        maxSizeUpload: 50000000,
        maxConcurrentUpload: 4,
        maxSizeRequest: 10000000,
        maxConcurrentRequests: 8,
        maxCallsInRequest: 16,
        maxObjectsInGet: 500,
        maxObjectsInSet: 500,
        collationAlgorithms: ['i;ascii-numeric', 'i;ascii-casemap', 'i;unicode-casemap'],
      },
      'urn:ietf:params:jmap:mail': {
        maxMailboxesPerEmail: 10,
        maxMailboxDepth: 5,
        maxSizeMailboxName: 100,
        totalQuota: 10000000000,
        totalQuotaUsed: 0,
        mayCreateTopLevelMailbox: true,
      },
    },
    accounts: {
      [accountId]: {
        name: user.email,
        isPersonal: true,
        isReadOnly: false,
        accountCapabilities: {
          'urn:ietf:params:jmap:core': {},
          'urn:ietf:params:jmap:mail': {},
        },
      },
    },
    primaryAccounts: {
      'urn:ietf:params:jmap:mail': accountId,
    },
    username: user.email,
    apiUrl: `${baseUrl}/api/jmap`,
    downloadUrl: `${baseUrl}/api/jmap/download/{accountId}/{blobId}/{name}`,
    uploadUrl: `${baseUrl}/api/jmap/upload/{accountId}`,
    eventSourceUrl: `${baseUrl}/api/jmap/events/{accountId}`,
    state: 'v1.0.0',
  };
}

/**
 * Executes a batch JMAP method call array (RFC 8620 Section 3.3).
 * Connects directly to database mailboxes and user index.
 * @param {object} user
 * @param {{ using: Array<string>, methodCalls: Array<[string, object, string]> }} requestBody
 * @returns {Promise<{ methodResponses: Array<[string, object, string]>, sessionState: string }>}
 */
export async function executeJmapBatch(user, requestBody) {
  const methodCalls = Array.isArray(requestBody?.methodCalls) ? requestBody.methodCalls : [];
  const methodResponses = [];
  const accountId = `usr_${user.id}`;

  for (const [methodName, args, callId] of methodCalls) {
    try {
      if (methodName === 'Mailbox/get') {
        // Query database for user folders and counts
        const { rows: folderCounts } = await query(
          `SELECT folder, COUNT(DISTINCT message_uid) as total_count
           FROM encrypted_search_index
           WHERE user_id = $1
           GROUP BY folder`,
          [user.id]
        );

        const folderMap = new Map();
        for (const row of folderCounts) {
          folderMap.set(row.folder.toUpperCase(), parseInt(row.total_count, 10) || 0);
        }

        const standardMailboxes = [
          { id: 'mbx_inbox', name: 'Inbox', role: 'inbox', unreadEmails: 0, totalEmails: folderMap.get('INBOX') || 0 },
          { id: 'mbx_sent', name: 'Sent', role: 'sent', unreadEmails: 0, totalEmails: folderMap.get('SENT') || 0 },
          { id: 'mbx_drafts', name: 'Drafts', role: 'drafts', unreadEmails: 0, totalEmails: folderMap.get('DRAFTS') || 0 },
          { id: 'mbx_trash', name: 'Trash', role: 'trash', unreadEmails: 0, totalEmails: folderMap.get('TRASH') || 0 },
          { id: 'mbx_spam', name: 'Spam', role: 'junk', unreadEmails: 0, totalEmails: folderMap.get('SPAM') || 0 },
          { id: 'mbx_archive', name: 'Archive', role: 'archive', unreadEmails: 0, totalEmails: folderMap.get('ARCHIVE') || 0 },
        ];

        // Add custom user mailboxes if present in database
        for (const [folderName, count] of folderMap.entries()) {
          if (!['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE'].includes(folderName)) {
            standardMailboxes.push({
              id: `mbx_${folderName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`,
              name: folderName,
              role: null,
              unreadEmails: 0,
              totalEmails: count,
            });
          }
        }

        methodResponses.push(['Mailbox/get', { accountId, state: 'mbx_state_1', list: standardMailboxes }, callId]);
      } else if (methodName === 'Email/query') {
        const position = Number(args.position) || 0;
        const limit = Math.min(Number(args.limit) || 50, 200);
        const inMailbox = args.filter?.inMailbox ? args.filter.inMailbox.replace(/^mbx_/, '').toUpperCase() : null;
        const textQuery = args.filter?.text || args.filter?.hasKeyword;

        let ids = [];

        // Query compliance archive first
        let archiveSql = `SELECT id, sent_or_received_at FROM compliance_archive WHERE (mailbox_owner_id = $1 OR mailbox_owner_email = $2)`;
        const archiveParams = [user.id, user.email];

        if (inMailbox === 'SENT') {
          archiveSql += ` AND direction = 'outbound'`;
        } else if (inMailbox === 'INBOX') {
          archiveSql += ` AND direction = 'inbound'`;
        }

        if (textQuery) {
          archiveParams.push(`%${textQuery}%`);
          archiveSql += ` AND (subject ILIKE $${archiveParams.length} OR body_text ILIKE $${archiveParams.length})`;
        }

        archiveSql += ` ORDER BY sent_or_received_at DESC LIMIT $${archiveParams.length + 1} OFFSET $${archiveParams.length + 2}`;
        archiveParams.push(limit, position);

        const { rows: archiveRows } = await query(archiveSql, archiveParams);
        ids = archiveRows.map((r) => String(r.id));

        // If archive is empty, query encrypted search index
        if (ids.length === 0) {
          let searchSql = `SELECT DISTINCT message_uid, MAX(created_at) as created_at FROM encrypted_search_index WHERE user_id = $1`;
          const searchParams = [user.id];

          if (inMailbox) {
            searchParams.push(inMailbox);
            searchSql += ` AND UPPER(folder) = $${searchParams.length}`;
          }

          if (textQuery) {
            const userSalt = user.search_salt || `user_${user.id}_salt`;
            const tokens = generateBlindTokens(textQuery, userSalt);
            if (tokens.length > 0) {
              searchParams.push(tokens);
              searchSql += ` AND token_hash = ANY($${searchParams.length})`;
            }
          }

          searchSql += ` GROUP BY message_uid ORDER BY created_at DESC LIMIT $${searchParams.length + 1} OFFSET $${searchParams.length + 2}`;
          searchParams.push(limit, position);

          const { rows: searchRows } = await query(searchSql, searchParams);
          ids = searchRows.map((r) => String(r.message_uid));
        }

        const { rows: countRows } = await query(
          `SELECT (SELECT COUNT(*) FROM compliance_archive WHERE mailbox_owner_id = $1 OR mailbox_owner_email = $2) +
                  (SELECT COUNT(DISTINCT message_uid) FROM encrypted_search_index WHERE user_id = $1) as total`,
          [user.id, user.email]
        );
        const total = parseInt(countRows[0]?.total || '0', 10);

        methodResponses.push([
          'Email/query',
          {
            accountId,
            queryState: 'q_state_1',
            canCalculateChanges: false,
            position,
            ids,
            total,
          },
          callId,
        ]);
      } else if (methodName === 'Email/get') {
        const requestedIds = (args.ids || []).map((id) => String(id));
        const numericIds = requestedIds.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n));

        const list = [];
        const notFound = [];

        if (numericIds.length > 0) {
          // Check compliance archive for rich real RFC 8621 properties
          const { rows: archiveRows } = await query(
            `SELECT id, message_id, direction, sender_address, sender_name, recipient_addresses, cc_addresses,
                    subject, body_text, body_html, has_attachments, is_read, is_starred, sent_or_received_at, created_at, checksum
             FROM compliance_archive
             WHERE (mailbox_owner_id = $1 OR mailbox_owner_email = $2) AND id = ANY($3::int[])`,
            [user.id, user.email, numericIds]
          );

          const foundIds = new Set();
          for (const row of archiveRows) {
            foundIds.add(String(row.id));
            const bodyStr = row.body_html || row.body_text || '';
            const sizeBytes = Buffer.byteLength(bodyStr, 'utf8') || 1024;
            const keywords = {};
            if (row.is_read) keywords['$seen'] = true;
            if (row.is_starred) keywords['$flagged'] = true;

            list.push({
              id: String(row.id),
              blobId: row.checksum || `blob_${row.id}`,
              threadId: `th_${row.message_id ? row.message_id.replace(/[^a-zA-Z0-9_-]/g, '_') : row.id}`,
              mailboxIds: { [`mbx_${row.direction === 'outbound' ? 'sent' : 'inbox'}`]: true },
              keywords,
              size: sizeBytes,
              receivedAt: row.sent_or_received_at || row.created_at,
              messageId: row.message_id ? [row.message_id] : [`<msg_${row.id}@wox.world>`],
              from: [{ name: row.sender_name || '', email: row.sender_address || 'unknown@wox.world' }],
              to: (row.recipient_addresses || []).map((addr) => ({ email: addr })),
              cc: (row.cc_addresses || []).map((addr) => ({ email: addr })),
              subject: row.subject || '(No Subject)',
              preview: (row.body_text || '').slice(0, 256),
              hasAttachment: Boolean(row.has_attachments),
              bodyValues: {
                '1': {
                  value: bodyStr,
                  isTruncated: false,
                },
              },
            });
          }

          // Check encrypted search index for any remaining IDs
          const remainingUids = numericIds.filter((id) => !foundIds.has(String(id)));
          if (remainingUids.length > 0) {
            const { rows: searchRows } = await query(
              `SELECT DISTINCT message_uid, folder, MAX(created_at) as created_at
               FROM encrypted_search_index
               WHERE user_id = $1 AND message_uid = ANY($2::int[])
               GROUP BY message_uid, folder`,
              [user.id, remainingUids]
            );

            for (const row of searchRows) {
              foundIds.add(String(row.message_uid));
              list.push({
                id: String(row.message_uid),
                blobId: `blob_${row.message_uid}`,
                threadId: `th_${row.message_uid}`,
                mailboxIds: { [`mbx_${(row.folder || 'inbox').toLowerCase()}`]: true },
                keywords: { '$seen': true },
                size: 2048,
                receivedAt: row.created_at || new Date().toISOString(),
                subject: `Message #${row.message_uid}`,
                from: [{ name: 'Sender', email: 'sender@wox.world' }],
                to: [{ email: user.email }],
                preview: 'Encrypted message indexed in zero-knowledge store',
                hasAttachment: false,
              });
            }
          }

          for (const reqId of requestedIds) {
            if (!foundIds.has(reqId)) {
              notFound.push(reqId);
            }
          }
        } else {
          notFound.push(...requestedIds);
        }

        methodResponses.push([
          'Email/get',
          {
            accountId,
            state: 'em_state_1',
            list,
            notFound,
          },
          callId,
        ]);
      } else {
        // Method not supported fallback
        methodResponses.push([
          'error',
          { type: 'unknownMethod', description: `Method ${methodName} is not yet implemented in this JMAP server` },
          callId,
        ]);
      }
    } catch (err) {
      methodResponses.push([
        'error',
        { type: 'serverError', description: err.message },
        callId,
      ]);
    }
  }

  return {
    methodResponses,
    sessionState: 'v1.0.0',
  };
}

export default {
  getJmapSession,
  executeJmapBatch,
};
