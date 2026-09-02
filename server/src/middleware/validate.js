/**
 * Request validation middleware factory.
 * Validates request body, query, or params against a schema object.
 *
 * Schema format:
 * {
 *   fieldName: {
 *     type: 'string' | 'number' | 'boolean' | 'email' | 'array',
 *     required: boolean,
 *     min: number,        // min length for strings, min value for numbers
 *     max: number,        // max length for strings, max value for numbers
 *     pattern: RegExp,    // regex pattern for strings
 *     enum: string[],     // allowed values
 *     default: any,       // default value if not provided
 *   }
 * }
 *
 * @param {object} schema - Validation schema
 * @param {'body'|'query'|'params'} [source='body'] - Request property to validate
 * @returns {Function} Express middleware
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const data = req[source] || {};
    const errors = [];
    const sanitized = {};

    for (const [field, rules] of Object.entries(schema)) {
      let value = data[field];

      // Apply default
      if (value === undefined && rules.default !== undefined) {
        value = rules.default;
      }

      // Required check
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Skip further checks if optional and not provided
      if (value === undefined || value === null) continue;

      // Type checks
      switch (rules.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${field} must be a string`);
            continue;
          }
          value = value.trim();
          if (rules.min && value.length < rules.min) {
            errors.push(`${field} must be at least ${rules.min} characters`);
          }
          if (rules.max && value.length > rules.max) {
            errors.push(`${field} must be at most ${rules.max} characters`);
          }
          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`${field} has an invalid format`);
          }
          break;

        case 'email':
          if (typeof value !== 'string') {
            errors.push(`${field} must be a string`);
            continue;
          }
          value = value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors.push(`${field} must be a valid email address`);
          }
          break;

        case 'number':
          value = Number(value);
          if (isNaN(value)) {
            errors.push(`${field} must be a number`);
            continue;
          }
          if (rules.min !== undefined && value < rules.min) {
            errors.push(`${field} must be at least ${rules.min}`);
          }
          if (rules.max !== undefined && value > rules.max) {
            errors.push(`${field} must be at most ${rules.max}`);
          }
          break;

        case 'boolean':
          if (typeof value === 'string') {
            value = value === 'true' || value === '1';
          }
          if (typeof value !== 'boolean') {
            errors.push(`${field} must be a boolean`);
            continue;
          }
          break;

        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`${field} must be an array`);
            continue;
          }
          if (rules.min && value.length < rules.min) {
            errors.push(`${field} must have at least ${rules.min} items`);
          }
          if (rules.max && value.length > rules.max) {
            errors.push(`${field} must have at most ${rules.max} items`);
          }
          break;
      }

      // Enum check
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }

      sanitized[field] = value;
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    // Replace source data with sanitized values
    req[source] = { ...data, ...sanitized };
    next();
  };
}
