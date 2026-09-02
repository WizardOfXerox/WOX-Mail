import { query } from '../src/config/database.js';
import { hashPassword, generateToken } from '../src/utils/crypto.js';

/**
 * Migration 002: Seed default data.
 * Creates admin user, default service controls, and essential settings.
 */
export async function up() {
  // 1. Create default admin user
  const adminEmail = process.env.ADMIN_EMAIL || (process.env.ADMIN_EMAIL || '');
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const adminHash = await hashPassword(adminPassword);

  await query(
    `INSERT INTO users (email, username, password_hash, display_name, is_admin, otp_enabled)
     VALUES ($1, $2, $3, $4, TRUE, FALSE)
     ON CONFLICT (email) DO NOTHING`,
    [adminEmail, 'admin', adminHash, 'WoxMail Admin']
  );

  // 2. Seed service controls (per-tier sender restrictions)
  const services = [
    {
      name: 'google',
      domains: ['google.com', 'gmail.com', 'accounts.google.com', 'myaccount.google.com', 'gstatic.com'],
      public: false, personal: false, permanent: true,
    },
    {
      name: 'apple',
      domains: ['apple.com', 'icloud.com', 'appleid.apple.com'],
      public: false, personal: false, permanent: true,
    },
    {
      name: 'microsoft',
      domains: ['microsoft.com', 'outlook.com', 'live.com', 'login.microsoftonline.com'],
      public: false, personal: false, permanent: true,
    },
    {
      name: 'github',
      domains: ['github.com', 'github.io'],
      public: false, personal: false, permanent: true,
    },
    {
      name: 'discord',
      domains: ['discord.com', 'discordapp.com', 'discord.gg'],
      public: false, personal: false, permanent: true,
    },
  ];

  for (const svc of services) {
    await query(
      `INSERT INTO service_controls (service_name, service_domains, public_enabled, personal_enabled, permanent_enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (service_name) DO NOTHING`,
      [svc.name, svc.domains, svc.public, svc.personal, svc.permanent]
    );
  }

  // 3. Seed essential settings
  const settings = [
    ['pool_target_size', '20', 'Target number of available public addresses in the pool'],
    ['pool_min_size', '5', 'Minimum available addresses before replenishment triggers'],
    ['temp_public_max_expiry_hours', '72', 'Max expiry for public temp addresses (hours)'],
    ['temp_personal_max_expiry_days', '60', 'Max expiry for personal temp addresses (days)'],
    ['temp_public_default_expiry_hours', '24', 'Default expiry for public temp addresses (hours)'],
    ['temp_personal_default_expiry_days', '30', 'Default expiry for personal temp addresses (days)'],
    ['max_public_per_ip', '3', 'Maximum active public addresses per IP'],
    ['max_personal_per_ip', '5', 'Maximum active personal addresses per IP'],
    ['registration_enabled', 'true', 'Whether new permanent account registration is enabled'],
    ['temp_public_enabled', 'true', 'Whether public temp mail is available'],
    ['temp_personal_enabled', 'true', 'Whether personal temp mail is available'],
    ['maintenance_mode', 'false', 'Enable maintenance mode (blocks all non-admin access)'],
    ['max_attachment_size_mb', '25', 'Maximum attachment size in MB'],
    ['smtp_daily_limit', '500', 'Maximum emails a permanent user can send per day'],
    ['welcome_email_enabled', 'true', 'Send welcome email on registration'],
    ['site_name', 'WoxMail', 'Site display name'],
    ['site_tagline', 'Your Private Email Suite', 'Site tagline'],
    ['quarantine_days', '90', 'Days to quarantine expired temp addresses before reuse'],
  ];

  for (const [key, value, description] of settings) {
    await query(
      `INSERT INTO settings (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO NOTHING`,
      [key, value, description]
    );
  }

  // 4. Generate first invite code for admin to give out
  const inviteCode = generateToken(8).toUpperCase().slice(0, 16);
  const adminResult = await query('SELECT id FROM users WHERE is_admin = TRUE LIMIT 1');
  if (adminResult.rows.length > 0) {
    await query(
      `INSERT INTO invite_codes (code, created_by)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [inviteCode, adminResult.rows[0].id]
    );
  }
}

export async function down() {
  await query("DELETE FROM settings");
  await query("DELETE FROM service_controls");
  await query("DELETE FROM invite_codes");
  await query("DELETE FROM users WHERE username = 'admin'");
}
