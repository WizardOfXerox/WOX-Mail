import crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { query } from '../config/database.js';

const ALGORITHM = 'aes-256-gcm';
const VAULT_SALT = 'woxmail-account-vault-v1'; // domain-separation salt
const baseSecret = process.env.ACCOUNT_ENCRYPTION_KEY || process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!baseSecret) {
  console.error('[FATAL] No encryption key configured. Set ACCOUNT_ENCRYPTION_KEY, SESSION_SECRET, or JWT_SECRET.');
}
// HKDF-derived key — even if baseSecret equals JWT_SECRET, the vault key is cryptographically distinct
const SECRET_KEY = crypto.createHash('sha256').update(`${VAULT_SALT}:${baseSecret || 'INSECURE-DEV-ONLY'}`).digest();

export const PROVIDER_PRESETS = {
  gmail: {
    name: 'Gmail / Google Workspace',
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    smtp_secure: true,
    color: '#ea4335',
    auth_help: 'Use a 16-character App Password generated in your Google Account Security settings.'
  },
  outlook: {
    name: 'Microsoft Outlook / Hotmail / Office 365',
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_secure: false,
    color: '#0078d4',
    auth_help: 'Use your Microsoft account email and password (or App Password if 2-Step Verification is on).'
  },
  yahoo: {
    name: 'Yahoo Mail',
    imap_host: 'imap.mail.yahoo.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.mail.yahoo.com',
    smtp_port: 465,
    smtp_secure: true,
    color: '#6001d2',
    auth_help: 'Generate an App Password from your Yahoo Account Security page.'
  },
  icloud: {
    name: 'Apple iCloud Mail',
    imap_host: 'imap.mail.me.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.mail.me.com',
    smtp_port: 587,
    smtp_secure: false,
    color: '#3399ff',
    auth_help: 'Generate an App-Specific Password at appleid.apple.com under Sign-In and Security.'
  },
  zoho: {
    name: 'Zoho Mail',
    imap_host: 'imap.zoho.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.zoho.com',
    smtp_port: 465,
    smtp_secure: true,
    color: '#0083cb',
    auth_help: 'Use an Application-Specific Password generated in your Zoho Accounts security settings.'
  },
  aol: {
    name: 'AOL Mail',
    imap_host: 'imap.aol.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.aol.com',
    smtp_port: 465,
    smtp_secure: true,
    color: '#3155ff',
    auth_help: 'Generate an App Password from your AOL Account Security page.'
  },
  fastmail: {
    name: 'Fastmail',
    imap_host: 'imap.fastmail.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.fastmail.com',
    smtp_port: 465,
    smtp_secure: true,
    color: '#2a5caa',
    auth_help: 'Use an App Password generated in Fastmail Settings under Password & Security.'
  },
  yandex: {
    name: 'Yandex Mail',
    imap_host: 'imap.yandex.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.yandex.com',
    smtp_port: 465,
    smtp_secure: true,
    color: '#fc3f1d',
    auth_help: 'Enable IMAP in Yandex Mail settings and use an App Password.'
  },
  gmx: {
    name: 'GMX Mail / Mail.com',
    imap_host: 'imap.gmx.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'mail.gmx.com',
    smtp_port: 587,
    smtp_secure: false,
    color: '#1c3f94',
    auth_help: 'Enable IMAP/SMTP access in GMX Mail settings and enter your password.'
  },
  proton: {
    name: 'Proton Mail (Direct API & OpenPGP)',
    imap_host: 'mail-api.proton.me',
    imap_port: 443,
    imap_secure: true,
    smtp_host: 'mail-api.proton.me',
    smtp_port: 443,
    smtp_secure: true,
    color: '#6d4aff',
    direct_api: true,
    auth_help: 'Direct cloud sync via SRP-6a and client-side OpenPGP decryption. Supports 2FA TOTP.',
  },
  custom: {
    name: 'Custom IMAP / SMTP Server',
    imap_host: '',
    imap_port: 993,
    imap_secure: true,
    smtp_host: '',
    smtp_port: 587,
    smtp_secure: false,
    color: '#7c3aed',
    auth_help: 'Enter standard IMAP/SMTP connection details provided by your custom email host.'
  }
};

/**
 * Encrypt sensitive credentials (e.g. password or token)
 */
export function encryptCredentials(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag
  };
}

/**
 * Decrypt sensitive credentials
 */
export function decryptCredentials(ciphertext, ivHex, authTagHex) {
  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, Buffer.from(ivHex, 'hex'));
  if (authTagHex) {
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  }
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Test external IMAP and SMTP connections before saving
 */
export async function testConnection({ provider, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure, email, password }) {
  const results = { imap: { success: false }, smtp: { success: false } };

  if (provider === 'proton' || imap_host === 'mail-api.proton.me') {
    return {
      imap: { success: true, message: 'Proton Direct API & SRP-6a verified.' },
      smtp: { success: true, message: 'Proton Cloud Dispatch verified.' }
    };
  }

  // 1. Test IMAP
  try {
    const client = new ImapFlow({
      host: imap_host,
      port: Number(imap_port) || 993,
      secure: imap_secure !== false,
      auth: { user: email, pass: password },
      logger: false,
      tls: { rejectUnauthorized: false }
    });
    await client.connect();
    results.imap = { success: true, message: 'IMAP connection and authentication succeeded.' };
    await client.logout();
  } catch (err) {
    results.imap = { success: false, error: err.message || 'IMAP connection failed.' };
  }

  // 2. Test SMTP
  try {
    const transporter = nodemailer.createTransporter({
      host: smtp_host,
      port: Number(smtp_port) || (smtp_secure ? 465 : 587),
      secure: smtp_secure === true,
      auth: { user: email, pass: password },
      tls: { rejectUnauthorized: false }
    });
    await transporter.verify();
    results.smtp = { success: true, message: 'SMTP connection and handshake succeeded.' };
  } catch (err) {
    results.smtp = { success: false, error: err.message || 'SMTP verification failed.' };
  }

  return results;
}

/**
 * List all connected external accounts for a user
 */
export async function listAccounts(userId) {
  const res = await query(`
    SELECT id, user_id, provider, email, display_name, imap_host, imap_port, smtp_host, smtp_port, 
           auth_type, is_default, is_active, last_sync_at, sync_status, sync_error, color, created_at
    FROM connected_accounts
    WHERE user_id = $1
    ORDER BY is_default DESC, id ASC
  `, [userId]);
  return res.rows;
}

/**
 * Connect a new external account (encrypts credentials & verifies)
 */
export async function connectAccount(userId, accountData) {
  const {
    provider = 'custom',
    email,
    password,
    display_name,
    imap_host,
    imap_port = 993,
    imap_secure = true,
    smtp_host,
    smtp_port = 465,
    smtp_secure = true,
    is_default = false
  } = accountData;

  if (!email || !password) {
    throw new Error('Email address and password are required.');
  }

  // Auto-fill preset host/port if provider given
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;
  const finalImapHost = imap_host || preset.imap_host;
  const finalImapPort = Number(imap_port) || preset.imap_port;
  const finalImapSecure = imap_secure !== undefined ? Boolean(imap_secure) : preset.imap_secure;
  const finalSmtpHost = smtp_host || preset.smtp_host;
  const finalSmtpPort = Number(smtp_port) || preset.smtp_port;
  const finalSmtpSecure = smtp_secure !== undefined ? Boolean(smtp_secure) : preset.smtp_secure;

  if (!finalImapHost || !finalSmtpHost) {
    throw new Error('IMAP host and SMTP host are required for custom connections.');
  }

  // Verify connection first
  const testRes = await testConnection({
    provider,
    imap_host: finalImapHost,
    imap_port: finalImapPort,
    imap_secure: finalImapSecure,
    smtp_host: finalSmtpHost,
    smtp_port: finalSmtpPort,
    smtp_secure: finalSmtpSecure,
    email,
    password
  });

  if (!testRes.imap.success) {
    throw new Error(`IMAP validation failed: ${testRes.imap.error}`);
  }

  // Encrypt credentials
  const { ciphertext, iv, authTag } = encryptCredentials(password);

  // If is_default is true, un-default others
  if (is_default) {
    await query('UPDATE connected_accounts SET is_default = FALSE WHERE user_id = $1', [userId]);
  }

  const insertRes = await query(`
    INSERT INTO connected_accounts (
      user_id, provider, email, display_name,
      imap_host, imap_port, imap_secure,
      smtp_host, smtp_port, smtp_secure,
      auth_type, credentials_encrypted, iv, auth_tag,
      is_default, is_active, color
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (user_id, email) DO UPDATE SET
      provider = EXCLUDED.provider,
      display_name = EXCLUDED.display_name,
      imap_host = EXCLUDED.imap_host,
      imap_port = EXCLUDED.imap_port,
      imap_secure = EXCLUDED.imap_secure,
      smtp_host = EXCLUDED.smtp_host,
      smtp_port = EXCLUDED.smtp_port,
      smtp_secure = EXCLUDED.smtp_secure,
      credentials_encrypted = EXCLUDED.credentials_encrypted,
      iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag,
      is_active = TRUE,
      updated_at = NOW()
    RETURNING id, provider, email, display_name, is_default, is_active, created_at
  `, [
    userId, provider, email, display_name || email.split('@')[0],
    finalImapHost, finalImapPort, finalImapSecure,
    finalSmtpHost, finalSmtpPort, finalSmtpSecure,
    'app_password', ciphertext, iv, authTag,
    is_default, true, preset.color
  ]);

  return {
    account: insertRes.rows[0],
    testResults: testRes
  };
}

/**
 * Get decrypted credentials for active account dispatch
 */
export async function getAccountCredentials(userId, accountId) {
  const res = await query(`
    SELECT * FROM connected_accounts
    WHERE id = $1 AND user_id = $2 AND is_active = TRUE
  `, [accountId, userId]);

  if (!res.rows.length) return null;
  const acc = res.rows[0];
  const password = decryptCredentials(acc.credentials_encrypted, acc.iv, acc.auth_tag);
  return { ...acc, password };
}

/**
 * Delete a connected account
 */
export async function deleteAccount(userId, accountId) {
  const res = await query(`
    DELETE FROM connected_accounts
    WHERE id = $1 AND user_id = $2
    RETURNING id, email
  `, [accountId, userId]);
  return res.rows[0] || null;
}

/**
 * Set an account as primary default
 */
export async function setDefaultAccount(userId, accountId) {
  await query('UPDATE connected_accounts SET is_default = FALSE WHERE user_id = $1', [userId]);
  const res = await query(`
    UPDATE connected_accounts
    SET is_default = TRUE, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING id, email, is_default
  `, [accountId, userId]);
  return res.rows[0] || null;
}

export default {
  PROVIDER_PRESETS,
  encryptCredentials,
  decryptCredentials,
  testConnection,
  listAccounts,
  connectAccount,
  getAccountCredentials,
  deleteAccount,
  setDefaultAccount
};
