import { query } from '../config/database.js';

/**
 * Get or create default kanban board for user
 */
export async function getOrCreateBoard(userId) {
  let res = await query('SELECT * FROM kanban_boards WHERE user_id = $1 LIMIT 1', [userId]);
  if (!res.rows.length) {
    res = await query(`
      INSERT INTO kanban_boards (user_id, name)
      VALUES ($1, 'Main Mail Board')
      RETURNING *
    `, [userId]);
  }
  const board = res.rows[0];

  // Fetch cards
  const cardsRes = await query(`
    SELECT * FROM kanban_cards
    WHERE board_id = $1 AND user_id = $2
    ORDER BY column_id, position ASC, created_at DESC
  `, [board.id, userId]);

  return {
    board,
    cards: cardsRes.rows
  };
}

/**
 * Add a card to the board (e.g. from an email)
 */
export async function createCard(userId, { column_id = 'todo', title, description = '', message_uid = null, folder = 'INBOX', sender_email = null, due_date = null, priority = 'medium', color = '#7c3aed', labels = [] }) {
  // Always use the user's own board — never trust client-supplied board_id (IDOR prevention)
  const boardRes = await query('SELECT id FROM kanban_boards WHERE user_id = $1 LIMIT 1', [userId]);
  if (!boardRes.rows.length) {
    throw new Error('No kanban board found. Open the board first to auto-create one.');
  }
  const board_id = boardRes.rows[0].id;

  const posRes = await query(`
    SELECT COALESCE(MAX(position), 0) + 1 as next_pos
    FROM kanban_cards
    WHERE board_id = $1 AND column_id = $2
  `, [board_id, column_id]);
  const nextPos = posRes.rows[0].next_pos;

  const res = await query(`
    INSERT INTO kanban_cards (
      board_id, user_id, column_id, position, title, description,
      message_uid, folder, sender_email, due_date, priority, color, labels
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    board_id, userId, column_id, nextPos, title, description,
    message_uid, folder, sender_email, due_date, priority, color, labels
  ]);

  return res.rows[0];
}

/**
 * Move / update a card's column and position
 */
export async function updateCard(userId, cardId, { column_id, position, title, description, due_date, priority, color, labels }) {
  const res = await query(`
    UPDATE kanban_cards
    SET column_id = COALESCE($1, column_id),
        position = COALESCE($2, position),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        due_date = COALESCE($5, due_date),
        priority = COALESCE($6, priority),
        color = COALESCE($7, color),
        labels = COALESCE($8, labels),
        updated_at = NOW()
    WHERE id = $9 AND user_id = $10
    RETURNING *
  `, [column_id, position, title, description, due_date, priority, color, labels, cardId, userId]);

  return res.rows[0] || null;
}

/**
 * Delete a card
 */
export async function deleteCard(userId, cardId) {
  const res = await query(`
    DELETE FROM kanban_cards
    WHERE id = $1 AND user_id = $2
    RETURNING id, title
  `, [cardId, userId]);
  return res.rows[0] || null;
}

export default {
  getOrCreateBoard,
  createCard,
  updateCard,
  deleteCard
};
