/**
 * RFC 2047 MIME Header & Encoded-Word Decoder and Sanitizer.
 * Cleans encoded words (=?UTF-8?Q?...?=, =?UTF-8?B?...?=), quoted-printable artifacts
 * (=22, =3C, =3E, =40, =2E), and ensures email addresses and sender names render cleanly.
 */

/**
 * Decode RFC 2047 MIME encoded words in a string.
 * Handles both Base64 ('B') and Quoted-Printable ('Q') encodings,
 * and concatenates adjacent encoded words separated by whitespace.
 *
 * @param {string} str
 * @returns {string}
 */
export function decodeMimeWords(str) {
  if (!str || typeof str !== 'string') return str || '';

  // RFC 2047: Join adjacent encoded-words separated only by linear whitespace
  let cleaned = str.replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(=\?[^?]+\?[bBqQ]\?[^?]*\?=)/g, '$1$2');

  // Decode standard encoded words
  cleaned = cleaned.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/gi, (match, charset, encoding, text) => {
    try {
      const enc = encoding.toUpperCase();
      if (enc === 'B') {
        // Base64 decoding
        if (typeof Buffer !== 'undefined') {
          return Buffer.from(text, 'base64').toString('utf8');
        } else if (typeof atob === 'function') {
          return decodeURIComponent(escape(atob(text)));
        }
      } else if (enc === 'Q') {
        // Quoted-Printable decoding
        // In RFC 2047 Q-encoding, '_' stands for space
        let q = text.replace(/_/g, ' ');
        q = q.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        try {
          return decodeURIComponent(escape(q));
        } catch {
          return q;
        }
      }
    } catch {
      return match;
    }
    return match;
  });

  // Clean up any residual quoted-printable hex artifacts
  cleaned = cleaned
    .replace(/=22/gi, '"')
    .replace(/=3C/gi, '<')
    .replace(/=3E/gi, '>')
    .replace(/=40/gi, '@')
    .replace(/=2E/gi, '.')
    .replace(/=20/gi, ' ');

  return cleaned;
}

/**
 * Extract and sanitize a clean email address from a string or object.
 * Strips angle brackets, escaped quotes, MIME words, and extracts standard email pattern.
 *
 * @param {string|object} addr
 * @returns {string}
 */
export function cleanEmailAddress(addr) {
  if (!addr) return '';
  const raw = typeof addr === 'object' ? (addr.address || addr.value?.[0]?.address || '') : String(addr);
  if (!raw) return '';

  let str = decodeMimeWords(raw);
  str = str
    .replace(/=22/gi, '"')
    .replace(/=3C/gi, '<')
    .replace(/=3E/gi, '>')
    .replace(/=40/gi, '@')
    .replace(/=2E/gi, '.');

  // Match valid email pattern (e.g. support@wox.world)
  const emailMatch = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    return emailMatch[1].trim();
  }

  // Fallback: strip surrounding quotes and angle brackets
  return str.replace(/^["'<]+|["'>]+$/g, '').trim();
}

/**
 * Sanitize a sender display name.
 * Strips leaked angle-bracketed emails, stray quotes, and MIME markers.
 *
 * @param {string} name
 * @param {string} [fallbackAddress='']
 * @returns {string}
 */
export function cleanSenderName(name, fallbackAddress = '') {
  if (!name || typeof name !== 'string') {
    return cleanEmailAddress(fallbackAddress) || '';
  }

  let str = decodeMimeWords(name);
  str = str
    .replace(/=22/gi, '"')
    .replace(/=3C/gi, '<')
    .replace(/=3E/gi, '>')
    .replace(/=40/gi, '@')
    .replace(/=2E/gi, '.');

  // Strip nested angle brackets if email was included inside name: "Foo <foo@bar.com>"
  if (str.includes('<') && str.includes('>')) {
    str = str.replace(/<[^>]+>/g, '').trim();
  }

  // Strip leading '22' artifact from unescaped =22
  str = str.replace(/^22(?=[A-Za-z0-9])/, '');

  // Strip leading/trailing quotes and brackets
  str = str.replace(/^["'\s<]+|["'\s>]+$/g, '').trim();

  return str || cleanEmailAddress(fallbackAddress);
}

/**
 * Clean and format message snippet previews.
 * Removes raw MIME header leaks (<=?UTF-8?Q?...=>), strips leading brackets.
 *
 * @param {string} snippet
 * @returns {string}
 */
export function cleanSnippet(snippet) {
  if (!snippet || typeof snippet !== 'string') return '';
  let str = decodeMimeWords(snippet);
  str = str
    .replace(/=22/gi, '"')
    .replace(/=3C/gi, '<')
    .replace(/=3E/gi, '>')
    .replace(/=40/gi, '@')
    .replace(/=2E/gi, '.');

  // Strip any raw MIME word tags remaining in preview (like <=?UTF-8?Q?...=> or =?UTF-8?Q?...?=)
  str = str.replace(/<=?\?[^>]+[=>]*/g, '').trim();
  str = str.replace(/^[<>=:\-\s]+/, '').trim();

  return str;
}

export default {
  decodeMimeWords,
  cleanEmailAddress,
  cleanSenderName,
  cleanSnippet,
};
