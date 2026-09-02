import { query } from '../config/database.js';

export async function getUserSnippets(userId) {
  const res = await query(`
    SELECT id, shortcut, title, content_html, created_at
    FROM user_snippets
    WHERE user_id = $1
    ORDER BY shortcut ASC
  `, [userId]);
  return res.rows;
}

export async function createSnippet(userId, { shortcut, title, contentHtml }) {
  const normalizedShortcut = shortcut.replace(/^\/+/, '').toLowerCase().trim();
  const res = await query(`
    INSERT INTO user_snippets (user_id, shortcut, title, content_html)
    VALUES ($1, $2, $3, $4)
    RETURNING id, shortcut, title, content_html, created_at
  `, [userId, normalizedShortcut, title.trim(), contentHtml]);
  return res.rows[0];
}

export async function updateSnippet(id, userId, { shortcut, title, contentHtml }) {
  const normalizedShortcut = shortcut.replace(/^\/+/, '').toLowerCase().trim();
  const res = await query(`
    UPDATE user_snippets
    SET shortcut = $1, title = $2, content_html = $3
    WHERE id = $4 AND user_id = $5
    RETURNING id, shortcut, title, content_html, created_at
  `, [normalizedShortcut, title.trim(), contentHtml, id, userId]);
  return res.rows[0] || null;
}

export async function deleteSnippet(id, userId) {
  const res = await query(`
    DELETE FROM user_snippets
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `, [id, userId]);
  return res.rows.length > 0;
}

export default {
  getUserSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
};
