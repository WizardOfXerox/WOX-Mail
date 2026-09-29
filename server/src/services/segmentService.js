import { query } from '../config/database.js';

/**
 * Build dynamic SQL condition for a segment rule.
 */
export function buildSegmentWhereClause(listId, rules, startParamIndex = 2) {
  const matchType = rules.match_type === 'any' ? ' OR ' : ' AND ';
  const conditions = Array.isArray(rules.conditions) ? rules.conditions : [];

  if (conditions.length === 0) {
    return {
      clause: 'WHERE list_id = $1',
      params: [listId]
    };
  }

  const clauses = [];
  const params = [listId];
  let paramIdx = startParamIndex;

  for (const cond of conditions) {
    const { field, operator, value } = cond;

    if (field === 'tags') {
      if (operator === 'contains') {
        const tagArr = Array.isArray(value) ? value : [String(value).trim()];
        clauses.push(`subscribers.tags @> $${paramIdx}::text[]`);
        params.push(tagArr);
        paramIdx++;
      } else if (operator === 'any_of') {
        const tagArr = Array.isArray(value) ? value : [String(value).trim()];
        clauses.push(`subscribers.tags && $${paramIdx}::text[]`);
        params.push(tagArr);
        paramIdx++;
      }
    } else if (field === 'status') {
      if (operator === 'equals') {
        clauses.push(`subscribers.status = $${paramIdx}`);
        params.push(String(value).trim());
        paramIdx++;
      }
    } else if (field === 'joined_at') {
      const days = parseInt(value, 10) || 30;
      if (operator === 'within_days') {
        clauses.push(`subscribers.subscribed_at >= NOW() - ($${paramIdx} * INTERVAL '1 day')`);
        params.push(days);
        paramIdx++;
      } else if (operator === 'older_than_days') {
        clauses.push(`subscribers.subscribed_at < NOW() - ($${paramIdx} * INTERVAL '1 day')`);
        params.push(days);
        paramIdx++;
      }
    }
  }

  if (clauses.length === 0) {
    return {
      clause: 'WHERE list_id = $1',
      params: [listId]
    };
  }

  return {
    clause: `WHERE list_id = $1 AND (${clauses.join(matchType)})`,
    params
  };
}

/**
 * Create a new audience segment.
 */
export async function createSegment(userId, listId, { name, description = '', rules = {} }) {
  const result = await query(
    `INSERT INTO subscriber_segments (user_id, list_id, name, description, rules)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, listId, name.trim(), description.trim(), JSON.stringify(rules)]
  );
  return result.rows[0];
}

/**
 * List segments for a list or user.
 */
export async function listSegments(userId, listId) {
  let q = `
    SELECT ss.*, ml.name AS list_name
    FROM subscriber_segments ss
    JOIN mailing_lists ml ON ml.id = ss.list_id
    WHERE ss.user_id = $1
  `;
  const params = [userId];

  if (listId) {
    params.push(listId);
    q += ` AND ss.list_id = $2`;
  }

  q += ` ORDER BY ss.created_at DESC`;

  const result = await query(q, params);
  return result.rows;
}

/**
 * Get a segment by ID.
 */
export async function getSegment(userId, segmentId) {
  const result = await query(
    `SELECT ss.*, ml.name AS list_name
     FROM subscriber_segments ss
     JOIN mailing_lists ml ON ml.id = ss.list_id
     WHERE ss.id = $1 AND ss.user_id = $2`,
    [segmentId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Update an existing segment.
 */
export async function updateSegment(userId, segmentId, { name, description, rules }) {
  const cur = await getSegment(userId, segmentId);
  if (!cur) return null;

  const newName = name !== undefined ? name.trim() : cur.name;
  const newDesc = description !== undefined ? description.trim() : cur.description;
  const newRules = rules !== undefined ? JSON.stringify(rules) : JSON.stringify(cur.rules);

  const result = await query(
    `UPDATE subscriber_segments
     SET name = $1, description = $2, rules = $3, updated_at = NOW()
     WHERE id = $4 AND user_id = $5
     RETURNING *`,
    [newName, newDesc, newRules, segmentId, userId]
  );
  return result.rows[0];
}

/**
 * Delete a segment.
 */
export async function deleteSegment(userId, segmentId) {
  const result = await query(
    `DELETE FROM subscriber_segments WHERE id = $1 AND user_id = $2 RETURNING id`,
    [segmentId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Preview subscriber count matching a set of segment rules.
 */
export async function getSegmentCountPreview(userId, listId, rules) {
  // Ensure user owns list
  const listCheck = await query(
    `SELECT id FROM mailing_lists WHERE id = $1 AND user_id = $2`,
    [listId, userId]
  );
  if (listCheck.rows.length === 0) {
    throw new Error('Mailing list not found or access denied');
  }

  const { clause, params } = buildSegmentWhereClause(listId, rules);
  const countRes = await query(
    `SELECT COUNT(*)::int AS count FROM subscribers ${clause}`,
    params
  );
  return countRes.rows[0]?.count || 0;
}

/**
 * Evaluate a segment and return all matching subscribers.
 */
export async function evaluateSegment(userId, segmentId) {
  const seg = await getSegment(userId, segmentId);
  if (!seg) throw new Error('Segment not found');

  const { clause, params } = buildSegmentWhereClause(seg.list_id, seg.rules);
  const result = await query(
    `SELECT id, email, first_name, last_name, status, tags, subscribed_at, unsubscribe_token
     FROM subscribers ${clause}
     ORDER BY subscribed_at DESC`,
    params
  );
  return result.rows;
}
