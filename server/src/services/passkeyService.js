import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import { query } from '../config/database.js';
import { setex, get, del } from '../config/redis.js';
import { pino } from 'pino';

const logger = pino({ name: 'woxmail:passkeys' });

export function getRPConfig() {
  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const rpID = process.env.RP_ID || (process.env.NODE_ENV === 'production' ? domain : 'localhost');
  const rpName = 'WoxMail Sovereign Privacy Suite';
  const expectedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    `https://${domain}`,
    `https://mail.${domain}`,
  ];

  return { rpID, rpName, expectedOrigins };
}

/**
 * Generate WebAuthn registration options for an existing user.
 *
 * @param {Object} user - Authenticated user record
 * @returns {Promise<Object>} Registration options JSON
 */
export async function getRegistrationOptions(user) {
  const { rpID, rpName } = getRPConfig();

  // Fetch existing registered passkeys for this user to exclude re-registering the same key
  const existingRes = await query(
    'SELECT credential_id, transports FROM user_passkeys WHERE user_id = $1',
    [user.id]
  );

  const excludeCredentials = existingRes.rows.map((row) => ({
    id: row.credential_id,
    type: 'public-key',
    transports: row.transports || undefined,
  }));

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: isoUint8Array.fromUTF8String(String(user.id)),
    userName: user.email || user.username,
    userDisplayName: user.display_name || user.username,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge in memory/redis with 2-minute TTL
  await setex(`passkey_reg_challenge:${user.id}`, 120, options.challenge);

  return options;
}

/**
 * Verify WebAuthn registration response from client authenticator.
 *
 * @param {Object} user - User record
 * @param {Object} response - Client registration response
 * @param {string} [deviceName] - User-friendly label for device
 * @returns {Promise<{ verified: boolean, passkeyId?: number, error?: string }>}
 */
export async function verifyRegistration(user, response, deviceName = 'Passkey Authenticator') {
  const { rpID, expectedOrigins } = getRPConfig();
  const expectedChallenge = await get(`passkey_reg_challenge:${user.id}`);

  if (!expectedChallenge) {
    throw new Error('Registration challenge expired or not found. Please try again.');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: expectedOrigins,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } finally {
    await del(`passkey_reg_challenge:${user.id}`);
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('WebAuthn registration verification failed');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  // Insert into user_passkeys
  const insertRes = await query(
    `INSERT INTO user_passkeys (
       user_id, credential_id, public_key, counter, device_type, backed_up, transports, device_name
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, credential_id, device_name, created_at`,
    [
      user.id,
      credential.id,
      Buffer.from(credential.publicKey),
      credential.counter,
      credentialDeviceType,
      credentialBackedUp,
      response.response.transports || [],
      deviceName,
    ]
  );

  logger.info({ userId: user.id, passkeyId: insertRes.rows[0].id }, 'New WebAuthn passkey registered');
  return {
    verified: true,
    passkey: insertRes.rows[0],
  };
}

/**
 * Generate authentication challenge options for login.
 *
 * @param {string} [emailOrUsername] - Optional email/username to scope credentials
 * @returns {Promise<{ options: Object, challengeSessionId: string }>}
 */
export async function getAuthenticationOptions(emailOrUsername = null) {
  const { rpID } = getRPConfig();
  let allowCredentials = undefined;
  let userRecord = null;

  if (emailOrUsername) {
    const userRes = await query(
      'SELECT id, email, username FROM users WHERE email = $1 OR username = $1',
      [emailOrUsername.toLowerCase()]
    );
    if (userRes.rows.length > 0) {
      userRecord = userRes.rows[0];
      const keysRes = await query(
        'SELECT credential_id, transports FROM user_passkeys WHERE user_id = $1',
        [userRecord.id]
      );
      if (keysRes.rows.length > 0) {
        allowCredentials = keysRes.rows.map((k) => ({
          id: k.credential_id,
          type: 'public-key',
          transports: k.transports || undefined,
        }));
      }
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'preferred',
  });

  const challengeSessionId = `passkey_auth_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await setex(
    `passkey_auth_challenge:${challengeSessionId}`,
    120,
    JSON.stringify({
      challenge: options.challenge,
      userId: userRecord ? userRecord.id : null,
    })
  );

  return { options, challengeSessionId };
}

/**
 * Verify WebAuthn authentication response and log in user.
 *
 * @param {string} challengeSessionId - Unique challenge session ID
 * @param {Object} response - Client authentication response (credential)
 * @returns {Promise<{ verified: boolean, user: Object, passkeyId: number }>}
 */
export async function verifyAuthentication(challengeSessionId, response) {
  const { rpID, expectedOrigins } = getRPConfig();
  const rawChallengeData = await get(`passkey_auth_challenge:${challengeSessionId}`);

  if (!rawChallengeData) {
    throw new Error('Authentication challenge expired or invalid. Please try again.');
  }

  const { challenge: expectedChallenge } = JSON.parse(rawChallengeData);
  await del(`passkey_auth_challenge:${challengeSessionId}`);

  const credentialId = response.id;
  const passkeyRes = await query(
    `SELECT p.*, u.id as u_id, u.email as u_email, u.username as u_username, u.is_suspended, u.is_admin
     FROM user_passkeys p
     JOIN users u ON u.id = p.user_id
     WHERE p.credential_id = $1`,
    [credentialId]
  );

  if (passkeyRes.rows.length === 0) {
    throw new Error('Passkey credential not recognized');
  }

  const passkey = passkeyRes.rows[0];
  if (passkey.is_suspended) {
    throw new Error('Account suspended');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: expectedOrigins,
    expectedRPID: rpID,
    credential: {
      id: passkey.credential_id,
      publicKey: new Uint8Array(passkey.public_key),
      counter: Number(passkey.counter),
      transports: passkey.transports || undefined,
    },
    requireUserVerification: false,
  });

  if (!verification.verified) {
    throw new Error('Passkey signature verification failed');
  }

  // Update counter & last_used_at
  const { newCounter } = verification.authenticationInfo;
  await query(
    'UPDATE user_passkeys SET counter = $1, last_used_at = NOW() WHERE id = $2',
    [newCounter, passkey.id]
  );

  logger.info({ userId: passkey.u_id, passkeyId: passkey.id }, 'User logged in via WebAuthn passkey');

  return {
    verified: true,
    user: {
      id: passkey.u_id,
      email: passkey.u_email,
      username: passkey.u_username,
      is_admin: passkey.is_admin,
    },
    passkeyId: passkey.id,
  };
}

/**
 * List all registered passkeys for a user.
 */
export async function listUserPasskeys(userId) {
  const result = await query(
    `SELECT id, credential_id, device_type, backed_up, device_name, created_at, last_used_at
     FROM user_passkeys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Delete a registered passkey.
 */
export async function deletePasskey(userId, passkeyId) {
  const result = await query(
    'DELETE FROM user_passkeys WHERE id = $1 AND user_id = $2 RETURNING id',
    [passkeyId, userId]
  );
  return result.rowCount > 0;
}

export default {
  getRPConfig,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listUserPasskeys,
  deletePasskey,
};
