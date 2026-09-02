/**
 * WoxMail JMAP (JSON Meta Application Protocol - RFC 8620 & RFC 8621) Engine
 * High-performance modern JSON batch synchronization engine for webmail and mobile clients.
 */

import { query } from '../config/database.js';

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
        const mailboxes = [
          { id: 'mbx_inbox', name: 'Inbox', role: 'inbox', unreadEmails: 0, totalEmails: 0 },
          { id: 'mbx_sent', name: 'Sent', role: 'sent', unreadEmails: 0, totalEmails: 0 },
          { id: 'mbx_drafts', name: 'Drafts', role: 'drafts', unreadEmails: 0, totalEmails: 0 },
          { id: 'mbx_trash', name: 'Trash', role: 'trash', unreadEmails: 0, totalEmails: 0 },
          { id: 'mbx_spam', name: 'Spam', role: 'junk', unreadEmails: 0, totalEmails: 0 },
          { id: 'mbx_archive', name: 'Archive', role: 'archive', unreadEmails: 0, totalEmails: 0 },
        ];
        methodResponses.push(['Mailbox/get', { accountId, state: 'mbx_state_1', list: mailboxes }, callId]);
      } else if (methodName === 'Email/query') {
        methodResponses.push([
          'Email/query',
          {
            accountId,
            queryState: 'q_state_1',
            canCalculateChanges: false,
            position: args.position || 0,
            ids: [],
            total: 0,
          },
          callId,
        ]);
      } else if (methodName === 'Email/get') {
        methodResponses.push([
          'Email/get',
          {
            accountId,
            state: 'em_state_1',
            list: [],
            notFound: args.ids || [],
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
