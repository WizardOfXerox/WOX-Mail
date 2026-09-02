import pino from 'pino';
import { createTransporter, sendEmail } from './smtp.js';

const logger = pino({ name: 'woxmail:welcome' });

/**
 * Send WoxMail Branded Welcome Email to new users and temp mail addresses
 */
export async function sendWoxWelcomeEmail(recipientEmail, { isTemp = false } = {}) {
  const domain = process.env.DOMAIN_PERMANENT;
  const senderEmail = process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || (domain ? `support@${domain}` : null);
  const senderName = process.env.SYSTEM_SENDER_NAME || 'WoxMail Support';
  const senderPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');

  if (process.env.NODE_ENV === 'test' || !senderEmail || !senderPass) {
    logger.info({ recipientEmail }, 'Skipping welcome email: unconfigured credentials or test mode');
    return;
  }

  const transporter = createTransporter(senderEmail, senderPass);

  const subject = isTemp
    ? '⚡ Welcome to WoxMail Disposable — Your Sovereign Privacy Shield'
    : '🛡️ Welcome to WoxMail — Sovereign Privacy & Zero-Trace Email Suite';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0c0a14; color: #f0f0f5; padding: 32px 24px; border-radius: 16px; max-width: 600px; margin: 0 auto; border: 1px solid #2a2a4a; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2a2a4a; padding-bottom: 16px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 24px;">✉️</span>
          <span style="font-size: 20px; font-weight: 800; color: #a78bfa; letter-spacing: 0.5px;">WoxMail</span>
        </div>
        <span style="background: rgba(124,58,237,0.2); color: #c4b5fd; border: 1px solid #7c3aed; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700;">
          SOVEREIGN ENCLAVE
        </span>
      </div>

      <h1 style="font-size: 22px; font-weight: 800; color: #f0f0f5; margin: 0 0 12px 0; line-height: 1.3;">
        Welcome to your secure inbox, <span style="color: #8b5cf6;">${recipientEmail.split('@')[0]}</span>!
      </h1>

      <p style="font-size: 14px; color: #9898b0; line-height: 1.6; margin-bottom: 24px;">
        Your WoxMail address <strong style="color: #f0f0f5;">${recipientEmail}</strong> is fully active and protected by our zero-trace privacy infrastructure.
      </p>

      <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 28px;">
        <div style="background: #141428; border: 1px solid #2a2a4a; border-radius: 12px; padding: 14px 16px;">
          <div style="font-size: 14px; font-weight: 700; color: #c4b5fd; margin-bottom: 4px;">
            🔥 Zero-Click In-Inbox Self-Destruction
          </div>
          <div style="font-size: 12.5px; color: #9898b0; line-height: 1.4;">
            Send confidential emails that render as dynamic vector streams directly in Gmail/Outlook and incinerate immediately upon reading.
          </div>
        </div>

        <div style="background: #141428; border: 1px solid #2a2a4a; border-radius: 12px; padding: 14px 16px;">
          <div style="font-size: 14px; font-weight: 700; color: #38bdf8; margin-bottom: 4px;">
            🔐 Enclave Vault (PIN + Watermark)
          </div>
          <div style="font-size: 12.5px; color: #9898b0; line-height: 1.4;">
            AES-256 encrypted messages locked with a 6-digit PIN and dynamic anti-leak recipient watermarking.
          </div>
        </div>

        <div style="background: #141428; border: 1px solid #2a2a4a; border-radius: 12px; padding: 14px 16px;">
          <div style="font-size: 14px; font-weight: 700; color: #4ade80; margin-bottom: 4px;">
            🛡️ Zero Metadata & IP Stripping
          </div>
          <div style="font-size: 12.5px; color: #9898b0; line-height: 1.4;">
            All outgoing messages have origin IPs, client software fingerprints, and tracking headers purged at the SMTP gateway.
          </div>
        </div>
      </div>

      <div style="background: #1e1b4b; border: 1px solid #8b5cf6; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 700; color: #e9d5ff; margin-bottom: 6px;">
          ⌨️ Power User Shortcuts
        </div>
        <div style="font-size: 12px; color: #c4b5fd; line-height: 1.6;">
          <code style="background: #0f0f1a; padding: 2px 6px; border-radius: 4px; color: #fff;">J</code> / <code style="background: #0f0f1a; padding: 2px 6px; border-radius: 4px; color: #fff;">K</code> Navigate • <code style="background: #0f0f1a; padding: 2px 6px; border-radius: 4px; color: #fff;">R</code> Refresh • <code style="background: #0f0f1a; padding: 2px 6px; border-radius: 4px; color: #fff;">N</code> New Message • <code style="background: #0f0f1a; padding: 2px 6px; border-radius: 4px; color: #fff;">/</code> Filter
        </div>
      </div>

      <div style="border-top: 1px solid #2a2a4a; padding-top: 16px; font-size: 12px; color: #6868a0; text-align: center; line-height: 1.5;">
        Need assistance or want to report an issue? Reach out to <a href="mailto:${senderEmail}" style="color: #8b5cf6; text-decoration: none;">${senderEmail}</a>.<br />
        © 2026 WoxMail Privacy Systems • Zero Footprint Left.
      </div>
    </div>
  `;

  try {
    const result = await sendEmail(transporter, {
      from: `"${senderName}" <${senderEmail}>`,
      to: recipientEmail,
      subject,
      text: `Welcome to WoxMail! Your secure address ${recipientEmail} is active with Zero-Trace Ephemeral Shield and Enclave Vault protection. Need help? Contact ${senderEmail}`,
      html,
    });
    logger.info({ messageId: result.messageId, to: recipientEmail }, 'Dispatched WoxMail branded welcome email');
    return result;
  } catch (err) {
    logger.error({ err: err.message, to: recipientEmail }, 'Failed to dispatch welcome email');
  }
}
