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

      // Required check
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      // Treat empty string '' as omitted for non-required fields
      if (value === '' && !rules.required) {
        if (rules.default !== undefined) {
          value = rules.default;
        } else {
          continue;
        }
      }

      // Apply default when omitted
      if (value === undefined && rules.default !== undefined) {
        value = rules.default;
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
          if (
            typeof value === 'boolean' ||
            Array.isArray(value) ||
            (typeof value === 'object' && value !== null) ||
            (typeof value === 'string' && value.trim() === '')
          ) {
            errors.push(`${field} must be a number`);
            continue;
          }
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
            const normalized = value.trim().toLowerCase();
            if (normalized === 'true' || normalized === '1') {
              value = true;
            } else if (normalized === 'false' || normalized === '0') {
              value = false;
            } else {
              errors.push(`${field} must be a boolean`);
              continue;
            }
          } else if (typeof value !== 'boolean') {
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

        case 'object':
          if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            errors.push(`${field} must be an object`);
            continue;
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
