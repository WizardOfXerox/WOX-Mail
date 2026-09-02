import { query } from '../config/database.js';

/**
 * Extract variable tokens from text like {{name}}, {{company}}
 */
export function extractVariables(text) {
  if (!text) return [];
  const matches = text.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const vars = new Set();
  for (const m of matches) {
    vars.add(m[1]);
  }
  return Array.from(vars);
}

/**
 * Replace variables in template body/subject with provided values
 */
export function interpolate(templateText, values = {}) {
  if (!templateText) return '';
  return templateText.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match;
  });
}

/**
 * List all templates for user
 */
export async function listTemplates(userId, category = null) {
  let q = 'SELECT * FROM email_templates WHERE user_id = $1';
  const params = [userId];
  if (category) {
    q += ' AND category = $2';
    params.push(category);
  }
  q += ' ORDER BY usage_count DESC, updated_at DESC';
  const res = await query(q, params);
  return res.rows;
}

/**
 * Create a new template
 */
export async function createTemplate(userId, { name, subject = '', body_html = '', body_text = '', category = 'General' }) {
  const vars = extractVariables(`${subject} ${body_html} ${body_text}`);
  const res = await query(`
    INSERT INTO email_templates (user_id, name, subject, body_html, body_text, category, variables)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [userId, name, subject, body_html, body_text, category, JSON.stringify(vars)]);
  return res.rows[0];
}

/**
 * Update an existing template
 */
export async function updateTemplate(userId, templateId, { name, subject, body_html, body_text, category }) {
  const vars = extractVariables(`${subject || ''} ${body_html || ''} ${body_text || ''}`);
  const res = await query(`
    UPDATE email_templates
    SET name = COALESCE($1, name),
        subject = COALESCE($2, subject),
        body_html = COALESCE($3, body_html),
        body_text = COALESCE($4, body_text),
        category = COALESCE($5, category),
        variables = $6,
        updated_at = NOW()
    WHERE id = $7 AND user_id = $8
    RETURNING *
  `, [name, subject, body_html, body_text, category, JSON.stringify(vars), templateId, userId]);
  return res.rows[0] || null;
}

/**
 * Delete a template
 */
export async function deleteTemplate(userId, templateId) {
  const res = await query(`
    DELETE FROM email_templates
    WHERE id = $1 AND user_id = $2
    RETURNING id, name
  `, [templateId, userId]);
  return res.rows[0] || null;
}

/**
 * Increment template usage count
 */
export async function recordTemplateUsage(userId, templateId) {
  await query(`
    UPDATE email_templates
    SET usage_count = usage_count + 1, updated_at = NOW()
    WHERE id = $1 AND user_id = $2
  `, [templateId, userId]);
}

export default {
  extractVariables,
  interpolate,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  recordTemplateUsage
};
