/**
 * RFC 2047 MIME Header & Encoded-Word Decoder and Sanitizer (Server-Side).
 * Cleans encoded words (=?UTF-8?Q?...?=, =?UTF-8?B?...?=), quoted-printable artifacts
 * (=22, =3C, =3E, =40, =2E), and ensures email headers and snippets are sanitized.
 */

export function decodeMimeWords(str) {
  if (!str || typeof str !== 'string') return str || '';

  // Join adjacent encoded-words separated only by linear whitespace
  let cleaned = str.replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(=\?[^?]+\?[bBqQ]\?[^?]*\?=)/g, '$1$2');

  cleaned = cleaned.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/gi, (match, charset, encoding, text) => {
    try {
      const enc = encoding.toUpperCase();
      if (enc === 'B') {
        return Buffer.from(text, 'base64').toString(charset.toLowerCase().includes('utf') ? 'utf8' : 'latin1');
      } else if (enc === 'Q') {
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

  cleaned = cleaned
    .replace(/=22/gi, '"')
    .replace(/=3C/gi, '<')
    .replace(/=3E/gi, '>')
    .replace(/=40/gi, '@')
    .replace(/=2E/gi, '.')
    .replace(/=20/gi, ' ');

  return cleaned;
}

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

  const emailMatch = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    return emailMatch[1].trim();
  }

  return str.replace(/^["'<]+|["'>]+$/g, '').trim();
}

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

  if (str.includes('<') && str.includes('>')) {
    str = str.replace(/<[^>]+>/g, '').trim();
  }

  str = str.replace(/^22(?=[A-Za-z0-9])/, '');
  str = str.replace(/^["'\s<]+|["'\s>]+$/g, '').trim();

  return str || cleanEmailAddress(fallbackAddress);
}

export function cleanSnippet(snippet) {
  if (!snippet || typeof snippet !== 'string') return '';
  let str = decodeMimeWords(snippet);
  str = str
    .replace(/=22/gi, '"')
    .replace(/=3C/gi, '<')
    .replace(/=3E/gi, '>')
    .replace(/=40/gi, '@')
    .replace(/=2E/gi, '.');

  str = str.replace(/<=?\?[^>]+[=>]*/g, '').trim();
  str = str.replace(/^[<>=:\-\s]+/, '').trim();

  return str;
}

export function sanitizeFrom(fromObj) {
  if (!fromObj) return null;
  if (typeof fromObj === 'string') {
    const cleanAddr = cleanEmailAddress(fromObj);
    const cleanName = cleanSenderName(fromObj, cleanAddr);
    return { name: cleanName, address: cleanAddr };
  }
  const cleanAddr = cleanEmailAddress(fromObj.address);
  const cleanName = cleanSenderName(fromObj.name, cleanAddr);
  return {
    name: cleanName,
    address: cleanAddr || fromObj.address,
  };
}

export function sanitizeSubject(subject) {
  if (!subject) return '(no subject)';
  const decoded = decodeMimeWords(String(subject)).trim();
  return decoded || '(no subject)';
}

export default {
  decodeMimeWords,
  cleanEmailAddress,
  cleanSenderName,
  cleanSnippet,
  sanitizeFrom,
  sanitizeSubject,
};
