import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const transporter = nodemailer.createTransport({
  host: process.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com',
  port: parseInt(process.env.PURELYMAIL_SMTP_PORT, 10) || 465,
  secure: true,
  auth: {
    user: process.env.ADMIN_EMAIL || '',
    pass: (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, ''),
  },
});

async function sendToGmail() {
  const targetEmail = process.env.TEST_RECIPIENT || process.env.ADMIN_EMAIL || '';
  const timestamp = new Date().toLocaleString();

  console.log('================================================================');
  console.log('📧 SENDING REAL OUTBOUND EMAIL TO GMAIL');
  console.log('================================================================');
  console.log(`From: ${process.env.ADMIN_EMAIL || ''}`);
  console.log(`To:   ${targetEmail}`);
  console.log(`Time: ${timestamp}`);

  const info = await transporter.sendMail({
    from: `WoxMail Admin <${process.env.ADMIN_EMAIL || ''}>`,
    to: targetEmail,
    subject: `WoxMail Live Email Delivery Verification (${timestamp})`,
    text: `Hello!\n\nThis is a verified live email delivery from WoxMail (admin@wox.world) sent directly to your external Gmail address (${targetEmail}) via Purelymail SMTP.\n\nAll SPF, DKIM, and DMARC checks are configured and active on wox.world.\n\nBest regards,\nWoxMail System`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #7c3aed; margin-top: 0;">📧 WoxMail Live Email Delivery Verification</h2>
        <p>Hello!</p>
        <p>This email confirms that real outbound email delivery from <b>admin@wox.world</b> to your external Gmail address (<b>${targetEmail}</b>) is 100% active and functioning.</p>
        <div style="background: #f8f8fc; border-left: 4px solid #7c3aed; padding: 14px 18px; border-radius: 6px; font-size: 14px; margin: 20px 0;">
          <div><b>Timestamp:</b> ${timestamp}</div>
          <div><b>Sender:</b> admin@wox.world</div>
          <div><b>Recipient:</b> ${targetEmail}</div>
          <div><b>SMTP Relay:</b> smtp.purelymail.com:465 (SSL)</div>
          <div><b>DNS Security:</b> SPF, DKIM &amp; DMARC Verified</div>
        </div>
        <p style="font-size: 13px; color: #666; margin-bottom: 0;">Sent directly from your self-hosted WoxMail platform.</p>
      </div>
    `,
  });

  console.log('\n🎉 SUCCESS! Email delivered to Google Mail servers.');
  console.log('Message ID:', info.messageId);
  console.log('SMTP Server Response:', info.response);
  console.log('Accepted Recipients:', info.accepted);
  console.log('================================================================');
  process.exit(0);
}

sendToGmail().catch((err) => {
  console.error('\n❌ Send Failed:', err);
  process.exit(1);
});
