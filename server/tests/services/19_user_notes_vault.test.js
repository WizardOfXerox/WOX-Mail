import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../src/config/database.js';
import crypto from 'crypto';

describe('User Notes & Checklist Vault Security Test Suite', () => {
  let testUserId;

  before(async () => {
    const username = `note_vault_user_${Math.floor(Math.random() * 90000 + 10000)}`;
    const email = `${username}@wox.world`;
    const res = await query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [username, email, '$argon2id$v=19$m=65536,t=3,p=4$dummyhashfornotesvaulttest']
    );
    testUserId = res.rows[0].id;
  });

  after(async () => {
    if (testUserId) {
      await query('DELETE FROM user_notes WHERE user_id = $1', [testUserId]);
      await query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  it('should encrypt note content and store in user_notes with iv', async () => {
    const rawContent = 'Confidential Wi-Fi: AlphaBetaGamma2026!';
    const iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync('dummy-secret', 'woxmail-salt', 1000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let enc = cipher.update(rawContent, 'utf8', 'hex') + cipher.final('hex');

    const res = await query(
      `INSERT INTO user_notes (user_id, title, content_encrypted, iv, color, is_pinned, is_checklist)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, color, is_pinned, is_checklist`,
      [testUserId, 'Private Wi-Fi Info', enc, iv.toString('hex'), 'emerald', true, false]
    );

    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].title, 'Private Wi-Fi Info');
    assert.equal(res.rows[0].color, 'emerald');
    assert.equal(res.rows[0].is_pinned, true);
    assert.equal(res.rows[0].is_checklist, false);
  });

  it('should support interactive checklist state in JSON content', async () => {
    const checklist = [
      { id: '1', text: 'Audit DMARC alignment', done: true },
      { id: '2', text: 'Verify Tor V3 hidden service', done: true },
      { id: '3', text: 'Test offline calendar sync', done: false }
    ];
    const rawContent = JSON.stringify(checklist);
    const iv = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync('dummy-secret', 'woxmail-salt', 1000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let enc = cipher.update(rawContent, 'utf8', 'hex') + cipher.final('hex');

    const res = await query(
      `INSERT INTO user_notes (user_id, title, content_encrypted, iv, color, is_pinned, is_checklist)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, is_checklist`,
      [testUserId, 'Sprint Launch Checklist', enc, iv.toString('hex'), 'purple', false, true]
    );

    assert.equal(res.rows.length, 1);
    assert.equal(res.rows[0].title, 'Sprint Launch Checklist');
    assert.equal(res.rows[0].is_checklist, true);
  });

  it('should query notes sorted by is_pinned DESC and updated_at DESC', async () => {
    const res = await query(
      `SELECT id, title, is_pinned FROM user_notes
       WHERE user_id = $1
       ORDER BY is_pinned DESC, updated_at DESC`,
      [testUserId]
    );

    assert.equal(res.rows.length, 2);
    assert.equal(res.rows[0].is_pinned, true);
    assert.equal(res.rows[0].title, 'Private Wi-Fi Info');
  });
});
