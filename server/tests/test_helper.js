/**
 * @fileoverview Shared Test Helper & Harness for WoxMail Master Test Matrix.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

import { query } from '../src/config/database.js';
import { hashPassword } from '../src/utils/crypto.js';

export const BASE_URL = process.env.BASE_TEST_URL || 'http://127.0.0.1:3001';

/**
 * Perform a fetch request to the running WoxMail API.
 * @param {string} endpoint - e.g. '/api/health' or '/api/auth/login'
 * @param {object} [options]
 * @returns {Promise<{ status: number, body: any, headers: Headers, cookies: string[] }>}
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const fetchOptions = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body && typeof options.body === 'object') {
    fetchOptions.body = JSON.stringify(options.body);
  } else if (options.body) {
    fetchOptions.body = options.body;
  }

  const res = await fetch(url, fetchOptions);
  let body;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await res.json().catch(() => null);
  } else {
    body = await res.text().catch(() => '');
  }

  const rawCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];

  return {
    status: res.status,
    body,
    headers: res.headers,
    cookies: rawCookies,
  };
}

/**
 * Seed or retrieve a deterministic test user in the database.
 */
export async function getOrCreateTestUser(username = 'tester_alpha', password = 'TestPassword123!#', isAdmin = false) {
  const existing = await query('SELECT * FROM users WHERE username = $1', [username]);
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const passHash = await hashPassword(password);
  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const email = `${username}@${domain}`;

  const res = await query(`
    INSERT INTO users (username, email, password_hash, is_admin, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING *
  `, [username, email, passHash, isAdmin]);

  return res.rows[0];
}

/**
 * Clean up test artifacts created during testing.
 */
export async function cleanupTestData(pattern = 'test%') {
  try {
    await query("DELETE FROM users WHERE username LIKE $1 AND username NOT IN ('admin')", [pattern]);
    await query("DELETE FROM temp_addresses WHERE address LIKE $1", [pattern]);
    await query("DELETE FROM support_tickets WHERE user_email LIKE $1", [pattern]);
    await query("DELETE FROM future_letters WHERE recipient_email LIKE $1", [pattern]);
  } catch (err) {
    // Ignore cleanup errors
  }
}
