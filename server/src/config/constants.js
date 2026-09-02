/**
 * @fileoverview Application-wide constants and configuration values for WoxMail.
 * Defines subscription tiers, resource statuses, rate limit windows, and cookie names.
 */

/**
 * Mailbox and account tier definitions.
 * @readonly
 * @enum {string}
 */
export const TIERS = Object.freeze({
  PUBLIC: 'public',
  PERSONAL: 'personal',
  PERMANENT: 'permanent',
});

/**
 * Address and resource pool lifecycle statuses.
 * @readonly
 * @enum {string}
 */
export const POOL_STATUS = Object.freeze({
  AVAILABLE: 'available',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  PURGING: 'purging',
  QUARANTINE: 'quarantine',
});

/**
 * Temporary mailbox session statuses.
 * @readonly
 * @enum {string}
 */
export const TEMP_STATUS = Object.freeze({
  ACTIVE: 'active',
  EXPIRED: 'expired',
  SUSPENDED: 'suspended',
});

/**
 * Default expiration timeframes for different tier mailboxes.
 * @readonly
 */
export const DEFAULT_EXPIRY = Object.freeze({
  PUBLIC_HOURS: 24,
  PURGE_HOURS: 72,
  PERSONAL_DAYS: 60,
});

/**
 * Rate limiting configurations (window in seconds, max requests allowed).
 * @readonly
 */
export const RATE_LIMITS = Object.freeze({
  LOGIN: Object.freeze({
    window: 900, // 15 minutes
    max: 10,
  }),
  API: Object.freeze({
    window: 60, // 1 minute
    max: 100,
  }),
  TEMP_GENERATE: Object.freeze({
    window: 3600, // 1 hour
    max: 10,
  }),
});

/**
 * Maximum email attachment upload sizes by tier in bytes.
 * @readonly
 */
export const MAX_ATTACHMENT_SIZE = Object.freeze({
  PUBLIC: 5 * 1024 * 1024, // 5 MB
  PERSONAL: 10 * 1024 * 1024, // 10 MB
  PERMANENT: 25 * 1024 * 1024, // 25 MB
});

/**
 * Default pagination parameters for list endpoints.
 * @readonly
 */
export const PAGINATION = Object.freeze({
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
});

/**
 * Cookie name used for JWT authentication tokens.
 * @type {string}
 */
export const JWT_COOKIE_NAME = 'woxmail_token';

/**
 * Cookie name used for temporary mailbox identification tokens.
 * @type {string}
 */
export const TEMP_COOKIE_NAME = 'woxmail_temp';
