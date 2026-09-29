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
export const PROTON_CATEGORY_PATTERNS = {
  feed: /\b(?:newsletter|digest|weekly|monthly|updates?|news|shield|guide|announcements?|welcome\s+to|bulletin|medium|substack|dev\.to|github\s*digests?)\b/i,
  paperTrail: /\b(?:future\s*letters?|time\s*capsule|receipts?|invoices?|payments?|transactions?|billings?|tickets?|pin|otp|verif(?:y|ication)|statements?|purchases?|tracking\s*(?:#|number|code|link|info)?|support\s*requests?|e2e)\b|\b(?:order\s*(?:#|no\.?|num|confirma|detail|summary|placed|status|update|receipt)|your\s*order|orders@)\b|\b(?:security|auth|login|access|verification)\s*code\b|\bcode\s*(?:is|:)/i,
  promotions: /\b(?:promo(?:tion)?s?|discounts?|sales?|deals?|offers?|coupons?|save|clearance|exclusive\s*offers?|shop\s*now|special\s*offers?|free\s*shipping|limited\s*time|flash\s*sales?|rewards?|cashback|gift\s*cards?|vouchers?|perks?|stores?)\b/i,
  social: /\b(?:github|linkedin|twitter|x\.com|facebook|instagram|discord|reddit|slack|youtube|tiktok|pinterest|threads|medium|mastodon|twitch|community|followers?|mentions?|commented|invited\s*you|connection\s*requests?)\b/i,
};

export async function fetchProtonMessages(folderName = 'INBOX', page = 1, limit = 25, email = null) {
  const labelId = PROTON_FOLDER_MAP[folderName] || '0';
  const pageIndex = Math.max(0, page - 1);
  const result = await protonClient.getMessages(labelId, pageIndex, limit, email);

  let rawMessages = (result.messages || []).map(m => {
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
  });

  // Apply smart category filtering if viewing a virtual category folder
  if (folderName === 'The Feed') {
    rawMessages = rawMessages.filter((m) => {
      const text = `${m.subject || ''} ${m.from?.name || ''} ${m.from?.address || ''}`;
      return !PROTON_CATEGORY_PATTERNS.paperTrail.test(text) &&
             !PROTON_CATEGORY_PATTERNS.promotions.test(text) &&
             !PROTON_CATEGORY_PATTERNS.social.test(text) &&
             PROTON_CATEGORY_PATTERNS.feed.test(text);
    });
  } else if (folderName === 'Paper Trail') {
    rawMessages = rawMessages.filter((m) => {
      const text = `${m.subject || ''} ${m.from?.name || ''} ${m.from?.address || ''}`;
      return PROTON_CATEGORY_PATTERNS.paperTrail.test(text);
    });
  } else if (folderName === 'Promotions') {
    rawMessages = rawMessages.filter((m) => {
      const text = `${m.subject || ''} ${m.from?.name || ''} ${m.from?.address || ''}`;
      return !PROTON_CATEGORY_PATTERNS.paperTrail.test(text) && PROTON_CATEGORY_PATTERNS.promotions.test(text);
    });
  } else if (folderName === 'Social') {
    rawMessages = rawMessages.filter((m) => {
      const text = `${m.subject || ''} ${m.from?.name || ''} ${m.from?.address || ''}`;
      return !PROTON_CATEGORY_PATTERNS.paperTrail.test(text) && PROTON_CATEGORY_PATTERNS.social.test(text);
    });
  }

  const total = rawMessages.length;
  return {
    messages: rawMessages,
    pagination: {
      page,
      limit,
      total: folderName === 'INBOX' ? result.total : total,
      pages: Math.ceil((folderName === 'INBOX' ? result.total : total) / limit) || 1,
    }
  };
}

/**
 * Fetch and decrypt a single message from Proton Mail.
 */
export async function fetchProtonMessage(messageId, email = null) {
  const msg = await protonClient.getMessage(messageId, null, email);
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
