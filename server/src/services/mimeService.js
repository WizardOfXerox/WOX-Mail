/**
 * RFC 2047 MIME Header & Encoded-Word Decoder and Sanitizer (Server-Side).
 * Cleans encoded words (=?UTF-8?Q?...?=, =?UTF-8?B?...?=), quoted-printable artifacts
 * (=22, =3C, =3E, =40, =2E), and ensures email headers and snippets are sanitized.
 */

function decodeBytesWithCharset(buffer, charset = 'utf-8') {
  const raw = String(charset || 'utf-8').trim().toLowerCase();
  const normalized = raw === 'utf8' ? 'utf-8' : raw === 'us-ascii' || raw === 'ascii' ? 'utf-8' : raw;
  try {
    return new TextDecoder(normalized, { fatal: false }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    } catch {
      return buffer.toString('latin1');
    }
  }
}

function decodeQpHeaderArtifacts(str) {
  if (!str || typeof str !== 'string') return str || '';
  if (!/=22|=3C|=3E|=40|=2E/i.test(str)) return str;
  return str
    .replace(/=22/gi, '"')
    .replace(/=3C/gi, '<')
    .replace(/=3E/gi, '>')
    .replace(/=40/gi, '@')
    .replace(/=2E/gi, '.');
}

export function decodeMimeWords(str) {
  if (!str || typeof str !== 'string') return str || '';

  // Join adjacent encoded-words separated only by linear whitespace
  let cleaned = str.replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(=\?[^?]+\?[bBqQ]\?[^?]*\?=)/g, '$1$2');

  cleaned = cleaned.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (match, charset, encoding, text) => {
    try {
      const enc = encoding.toUpperCase();
      if (enc === 'B') {
        const bytes = Buffer.from(text, 'base64');
        return decodeBytesWithCharset(bytes, charset);
      } else if (enc === 'Q') {
        const qStr = text.replace(/_/g, ' ');
        const bytes = [];
        for (let i = 0; i < qStr.length; i++) {
          if (qStr[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(qStr.slice(i + 1, i + 3))) {
            bytes.push(parseInt(qStr.slice(i + 1, i + 3), 16));
            i += 2;
          } else {
            const charBytes = Buffer.from(qStr[i], 'utf8');
            for (const b of charBytes) bytes.push(b);
          }
        }
        return decodeBytesWithCharset(Buffer.from(bytes), charset);
      }
    } catch {
      return match;
    }
    return match;
  });

  return cleaned;
}

export function cleanEmailAddress(addr) {
  if (!addr) return '';
  const raw = typeof addr === 'object' ? (addr.address || addr.value?.[0]?.address || '') : String(addr);
  if (!raw) return '';

  let str = decodeQpHeaderArtifacts(decodeMimeWords(raw));

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

  let str = decodeQpHeaderArtifacts(decodeMimeWords(name));

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

  // Strip HTML tags safely without affecting math like "2 < 5"
  str = str.replace(/<\/?[a-zA-Z!][^>]*>/g, ' ');
  // Strip truncated/incomplete RFC 2047 encoded-word fragments at snippet boundaries
  str = str.replace(/(?:<=?\?|(?<![a-zA-Z0-9])=\?)[A-Za-z0-9_-]+\?[bBqQ]\?[^?]*$/g, '');
  str = str.replace(/\s+/g, ' ').trim();

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
