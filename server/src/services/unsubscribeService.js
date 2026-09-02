/**
 * WoxMail One-Click List-Unsubscribe Daemon (RFC 2369 / RFC 8058)
 * Automatically processes header-based unsubscriptions via HTTP POST or mailto dispatch.
 */

import pino from 'pino';

const logger = pino({ name: 'unsubscribe-daemon' });

/**
 * Parses List-Unsubscribe and List-Unsubscribe-Post headers.
 * @param {string} listUnsubscribeHeader - e.g. "<https://example.com/unsub?id=123>, <mailto:unsub@example.com?subject=unsub>"
 * @param {string} [listUnsubscribePostHeader] - e.g. "List-Unsubscribe=One-Click"
 * @returns {{ httpUrl?: string, mailto?: string, isOneClick: boolean }}
 */
export function parseUnsubscribeHeaders(listUnsubscribeHeader, listUnsubscribePostHeader) {
  if (!listUnsubscribeHeader || typeof listUnsubscribeHeader !== 'string') {
    return { isOneClick: false };
  }

  let httpUrl = null;
  let mailto = null;

  const matches = listUnsubscribeHeader.match(/<([^>]+)>/g) || [];
  for (const match of matches) {
    const raw = match.slice(1, -1).trim();
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      if (!httpUrl) httpUrl = raw;
    } else if (raw.startsWith('mailto:')) {
      if (!mailto) mailto = raw;
    }
  }

  const isOneClick = Boolean(
    listUnsubscribePostHeader && listUnsubscribePostHeader.toLowerCase().includes('list-unsubscribe=one-click')
  );

  return { httpUrl, mailto, isOneClick };
}

/**
 * Executes a one-click unsubscription in the background.
 * @param {string} listUnsubscribeHeader
 * @param {string} [listUnsubscribePostHeader]
 * @returns {Promise<{ success: boolean, method: string, message: string }>}
 */
export async function executeUnsubscribe(listUnsubscribeHeader, listUnsubscribePostHeader) {
  const { httpUrl, mailto, isOneClick } = parseUnsubscribeHeaders(listUnsubscribeHeader, listUnsubscribePostHeader);

  if (!httpUrl && !mailto) {
    throw new Error('No valid List-Unsubscribe URL or mailto found in email headers');
  }

  // 1. If RFC 8058 One-Click HTTP POST endpoint is supported
  if (httpUrl && isOneClick) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(httpUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'WoxMail-Unsubscribe-Agent/1.0',
        },
        body: 'List-Unsubscribe=One-Click',
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        return { success: true, method: 'RFC8058_HTTP_POST', message: 'Successfully unsubscribed via RFC 8058 One-Click POST.' };
      }
    } catch (err) {
      logger.warn({ err, httpUrl }, 'RFC 8058 POST failed, trying standard GET fallback');
    }
  }

  // 2. Standard HTTP GET fallback
  if (httpUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(httpUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WoxMail/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (res.ok) {
        return { success: true, method: 'HTTP_GET', message: 'Successfully requested unsubscribe page.' };
      }
    } catch (err) {
      logger.warn({ err, httpUrl }, 'HTTP GET unsubscribe failed');
    }
  }

  // 3. Mailto target available
  if (mailto) {
    return {
      success: true,
      method: 'MAILTO',
      message: `Unsubscribe mailto instruction prepared (${mailto}).`,
      mailto,
    };
  }

  return { success: false, method: 'NONE', message: 'Failed to complete automatic unsubscription.' };
}

export default {
  parseUnsubscribeHeaders,
  executeUnsubscribe,
};
