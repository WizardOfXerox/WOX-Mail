import crypto from 'crypto';
import pino from 'pino';
import { Resvg } from '@resvg/resvg-js';
import { query, getClient } from '../config/database.js';
import { createTransporter, sendEmail, saveSentMessage } from './smtp.js';

const logger = pino({ name: 'woxmail:ephemeral-stream' });
const MASTER_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function deriveKey(token) {
  return crypto.createHmac('sha256', MASTER_SECRET).update(token).digest();
}

function encryptContent(text, token) {
  const key = deriveKey(token);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { encryptedContent: encrypted, iv: iv.toString('hex'), authTag };
}

function decryptContent(encryptedContent, ivHex, authTagHex, token) {
  const key = deriveKey(token);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function escapeXml(unsafe) {
  return (unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap text into lines of specified max characters
 */
function wrapLines(text, maxChars = 56) {
  const rawLines = (text || '').split('\n');
  const wrapped = [];
  for (const raw of rawLines) {
    if (!raw.trim()) {
      wrapped.push('');
      continue;
    }
    const words = raw.split(' ');
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxChars) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) wrapped.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) wrapped.push(currentLine);
  }
  return wrapped;
}

/**
 * Create a new In-Inbox Dynamic Ephemeral Stream
 */
export async function createEphemeralStream({
  senderId,
  senderEmail,
  recipientEmail,
  subject,
  content,
  maxViews = 1,
  expirationHours = 24,
}) {
  const token = crypto.randomBytes(24).toString('hex');
  const { encryptedContent, iv, authTag } = encryptContent(content, token);
  const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000);

  const res = await query(
    `INSERT INTO ephemeral_streams (
       token, sender_id, sender_email, recipient_email, subject,
       encrypted_content, iv, auth_tag, max_views, expires_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, token, expires_at, max_views`,
    [
      token,
      senderId || null,
      senderEmail,
      recipientEmail.trim().toLowerCase(),
      subject.trim(),
      encryptedContent,
      iv,
      authTag,
      Math.max(1, parseInt(maxViews, 10) || 1),
      expiresAt,
    ]
  );

  const row = res.rows[0];
  const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'https://mail.wox.world';
  const streamUrl = `${baseUrl}/api/ephemeral/render/${token}.png`;

  return {
    id: row.id,
    token: row.token,
    streamUrl,
    expiresAt: row.expires_at,
    maxViews: row.max_views,
  };
}

/**
 * Render dynamic PNG stream (100% compatible with Gmail proxy and mobile apps)
 */
export async function renderStreamPng(token, options = {}) {
  const svg = await renderStreamSvg(token, options);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'sans-serif',
    },
  });
  return resvg.render().asPng();
}

/**
 * Check if request comes from automated security crawler, proxy, or Google ASN
 */
export function isProxyCrawler(ua = '', via = '', ip = '') {
  const s = `${ua || ''} ${via || ''} ${ip || ''}`.toLowerCase();
  const isUaMatch = (
    s.includes('googleimageproxy') ||
    s.includes('googlebot') ||
    s.includes('feedfetcher-google') ||
    s.includes('bingpreview') ||
    s.includes('yahoo! slurp') ||
    s.includes('duckduckbot') ||
    s.includes('applebot') ||
    s.includes('bytespider') ||
    s.includes('google')
  );

  const isGoogleIp = (
    ip.startsWith('66.249.') ||
    ip.startsWith('66.102.') ||
    ip.startsWith('72.14.') ||
    ip.startsWith('74.125.') ||
    ip.startsWith('209.85.') ||
    ip.startsWith('216.239.') ||
    ip.startsWith('108.177.') ||
    ip.startsWith('35.190.') ||
    ip.startsWith('35.191.')
  );

  return isUaMatch || isGoogleIp;
}

/**
 * Render dynamic SVG stream and trigger zero-click burn on view
 */
export async function renderStreamSvg(token, { userAgent = '', via = '', ip = '' } = {}) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const res = await client.query(
      `SELECT * FROM ephemeral_streams WHERE token = $1 FOR UPDATE`,
      [token]
    );

    if (res.rows.length === 0) {
      await client.query('ROLLBACK');
      return generateStatusSvg('404 NOT FOUND', 'This ephemeral stream token does not exist or has been purged.', '#ef4444');
    }

    const row = res.rows[0];

    // Check expiration
    if (new Date() > new Date(row.expires_at)) {
      if (row.status !== 'expired') {
        await client.query(`UPDATE ephemeral_streams SET status = 'expired' WHERE id = $1`, [row.id]);
      }
      await client.query('COMMIT');
      return generateStatusSvg('⌛ EXPIRED MESSAGE', 'This confidential message has expired and is no longer viewable.', '#f59e0b');
    }

    // Check if already burned
    if (row.status === 'burned' || row.view_count >= row.max_views) {
      await client.query('COMMIT');
      return generateStatusSvg('🔥 MESSAGE SELF-DESTRUCTED', 'This confidential message was already opened and permanently destroyed.', '#ef4444', row.view_count, row.max_views);
    }

    // Decrypt content
    let text = '';
    try {
      text = decryptContent(row.encrypted_content, row.iv, row.auth_tag, token);
    } catch (err) {
      logger.error({ err: err.message }, 'Failed decrypting ephemeral stream content');
      await client.query('ROLLBACK');
      return generateStatusSvg('⚠️ DECRYPTION ERROR', 'Unable to decrypt payload.', '#ef4444');
    }

    // Increment view count on every stream request (including Gmail/Outlook proxy views)
    const newCount = row.view_count + 1;
    const isBurned = newCount >= row.max_views;

    await client.query(
      `UPDATE ephemeral_streams SET
         view_count = $1,
         first_viewed_at = COALESCE(first_viewed_at, NOW()),
         status = $2,
         encrypted_content = $3,
         burned_at = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [
        newCount,
        isBurned ? 'burned' : 'active',
        isBurned ? '[BURNED]' : row.encrypted_content,
        isBurned ? new Date() : null,
        row.id,
      ]
    );

    await client.query('COMMIT');

    logger.info({ token, viewCount: newCount, maxViews: row.max_views, isBurned }, 'Served ephemeral stream');

    // Generate Crisp Vector SVG with the text
    return generateContentSvg({
      senderEmail: row.sender_email,
      subject: row.subject,
      text,
      viewCount: newCount,
      maxViews: row.max_views,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.error({ err: err.message }, 'Error in renderStreamSvg');
    return generateStatusSvg('⚠️ SERVER ERROR', 'An error occurred while loading stream.', '#ef4444');
  } finally {
    client.release();
  }
}

/**
 * Generate Burned / Status SVG with View Counter
 */
function generateStatusSvg(title, subtitle, color = '#ef4444', viewCount = 1, maxViews = 1) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="220" viewBox="0 0 600 220">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#14101e" />
      <stop offset="100%" stop-color="#0c0a14" />
    </linearGradient>
  </defs>
  <rect width="600" height="220" rx="14" fill="url(#bg)" stroke="${color}" stroke-width="1.5" />
  
  <!-- Counter Bar in Burned Screen -->
  <rect x="200" y="16" width="200" height="24" rx="6" fill="#2d1218" stroke="${color}" stroke-width="1" />
  <text x="300" y="32" fill="${color}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-weight="700" font-size="11" text-anchor="middle">
    👁️ ACCESS COUNTER: ${viewCount}/${maxViews} (EXHAUSTED)
  </text>

  <g transform="translate(300, 75)" text-anchor="middle">
    <text y="0" fill="${color}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="19" letter-spacing="1">
      ${escapeXml(title)}
    </text>
    <text y="36" fill="#9898b0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13">
      ${escapeXml(subtitle)}
    </text>
    <text y="70" fill="#6868a0" font-family="'JetBrains Mono', monospace" font-size="11">
      🔒 WoxMail Zero-Trace Ephemeral Shield • Payload Shredded
    </text>
  </g>
</svg>`;
}

/**
 * Generate High-Resolution Typography SVG with live view counter
 */
function generateContentSvg({ senderEmail, subject, text, viewCount, maxViews }) {
  const lines = wrapLines(text, 58);
  const lineHeight = 22;
  const paddingY = 160;
  const contentHeight = Math.max(270, lines.length * lineHeight + paddingY);
  const remainingViews = Math.max(0, maxViews - viewCount);

  const lineElements = lines.map((line, idx) => {
    return `<text x="32" y="${110 + idx * lineHeight}" fill="#f0f0f5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14.5">${escapeXml(line)}</text>`;
  }).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${contentHeight}" viewBox="0 0 600 ${contentHeight}">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141428" />
      <stop offset="100%" stop-color="#0e0e1c" />
    </linearGradient>
  </defs>

  <!-- Background Card -->
  <rect width="600" height="${contentHeight}" rx="14" fill="url(#cardBg)" stroke="#7c3aed" stroke-width="1.5" />

  <!-- Security Header Bar -->
  <rect x="0" y="0" width="600" height="44" rx="14" fill="#7c3aed" fill-opacity="0.15" />
  <text x="24" y="28" fill="#a78bfa" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="700" font-size="12" letter-spacing="1">
    🔒 CONFIDENTIAL IN-INBOX STREAM
  </text>

  <!-- Live View Counter Badge -->
  <rect x="375" y="10" width="205" height="24" rx="6" fill="#1e1b4b" stroke="#8b5cf6" stroke-width="1" />
  <text x="477" y="26" fill="#c4b5fd" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="700" font-size="11" text-anchor="middle">
    👁️ ACCESS: VIEW ${viewCount}/${maxViews} (${remainingViews} LEFT)
  </text>

  <!-- Sender & Meta Info -->
  <text x="32" y="68" fill="#9898b0" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="12">
    From: <tspan fill="#8b5cf6" font-weight="600">${escapeXml(senderEmail)}</tspan> • <tspan fill="#f59e0b">🔥 Self-Destruct Active</tspan>
  </text>
  <line x1="32" y1="82" x2="568" y2="82" stroke="#2a2a4a" stroke-width="1" />

  <!-- Decrypted Message Content -->
  <g>
    ${lineElements}
  </g>

  <!-- Burn Notice Footer -->
  <line x1="32" y1="${contentHeight - 44}" x2="568" y2="${contentHeight - 44}" stroke="#2a2a4a" stroke-width="1" />
  <text x="32" y="${contentHeight - 20}" fill="#ef4444" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="11.5" font-weight="600">
    ⚡ WARNING: Reaching ${maxViews} total accesses will permanently incinerate this message.
  </text>
</svg>`;
}

/**
 * Dispatch In-Inbox Ephemeral Email
 */
export async function sendEphemeralStreamEmail({
  senderId,
  senderEmail,
  senderPass,
  recipientEmail,
  subject,
  content,
  maxViews = 1,
  expirationHours = 24,
}) {
  const stream = await createEphemeralStream({
    senderId,
    senderEmail,
    recipientEmail,
    subject,
    content,
    maxViews,
    expirationHours,
  });

  const transporter = createTransporter(senderEmail, senderPass);

  const emailHtml = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a12; color: #f0f0f5; padding: 24px; border-radius: 16px; max-width: 640px; margin: 0 auto; border: 1px solid #2a2a4a;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #2a2a4a;">
        <span style="font-size: 16px; font-weight: bold; color: #8b5cf6;">✉️ WoxMail Ephemeral Shield</span>
        <span style="background: rgba(239,68,68,0.2); color: #ef4444; padding: 3px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold;">🔥 ${maxViews}-VIEW BURN ACTIVE</span>
      </div>

      <div style="margin: 16px 0; border-radius: 12px; overflow: hidden; background: #141428; border: 1px solid #7c3aed;">
        <a href="${stream.streamUrl}" target="_blank" style="display: block; text-decoration: none;">
          <img src="${stream.streamUrl}" alt="Confidential Locked Message Stream" style="width: 100%; height: auto; display: block;" />
        </a>
      </div>

      <div style="text-align: center; margin: 12px 0;">
        <a href="${stream.streamUrl}" target="_blank" style="display: inline-block; padding: 8px 16px; background: rgba(124, 58, 237, 0.2); color: #c4b5fd; border: 1px solid #7c3aed; border-radius: 9999px; font-size: 12px; font-weight: 600; text-decoration: none;">
          🔍 Open Direct Stream (Bypasses Client Caches)
        </a>
      </div>

      <div style="background: #14101e; border: 1px solid #3b1828; border-radius: 8px; padding: 12px 14px; margin-top: 16px;">
        <div style="font-size: 12px; color: #f87171; font-weight: 600; margin-bottom: 2px;">
          🔥 Zero-Click In-Inbox Self-Destruction
        </div>
        <p style="font-size: 11.5px; color: #9898b0; margin: 0; line-height: 1.4;">
          The confidential content above is rendered directly from WoxMail's encrypted ephemeral vector stream. Each access increments the live counter. Reaching ${maxViews} views will permanently shred the decryption key.
        </p>
      </div>

      <div style="margin-top: 16px; text-align: center; color: #6868a0; font-size: 11px;">
        Sent via WoxMail Privacy Core • ${new Date().toUTCString()}
      </div>
    </div>
  `;

  const info = await sendEmail(transporter, {
    from: `"WoxMail Ephemeral Stream" <${senderEmail}>`,
    to: recipientEmail,
    subject: `🔥 [Self-Destructing Message] ${subject}`,
    html: emailHtml,
  });

  // Append copy to sender's Sent folder
  try {
    const { createConnection } = await import('./imap.js');
    const imapClient = await createConnection(senderEmail, senderPass);
    if (imapClient) {
      await saveSentMessage(imapClient, {
        from: `"WoxMail Ephemeral Stream" <${senderEmail}>`,
        to: recipientEmail,
        subject: `🔥 [Self-Destructing Message] ${subject}`,
        html: emailHtml,
        messageId: info.messageId,
        date: new Date(),
      });
      await imapClient.logout();
    }
  } catch (sentErr) {
    logger.warn({ err: sentErr.message }, 'Failed to append ephemeral stream message to Sent folder');
  }

  return {
    ...stream,
    messageId: info.messageId,
  };
}

export default {
  createEphemeralStream,
  renderStreamSvg,
  sendEphemeralStreamEmail,
};
