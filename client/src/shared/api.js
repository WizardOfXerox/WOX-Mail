/**
 * Shared API client for all React apps.
 * Handles fetch with credentials, error parsing, and auth redirects.
 */

const BASE = '/api';

export function getCsrfToken() {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/woxmail_csrf=([^;]+)/);
  return match ? match[1] : '';
}

/**
 * Make an authenticated API request.
 * @param {string} path - API path (e.g. '/mail/inbox')
 * @param {object} [options] - Fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function api(path, options = {}) {
  if (!path) return null;
  const { method = 'GET', body, headers: extraHeaders, ...rest } = options;

  const headers = { ...extraHeaders };
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const csrf = getCsrfToken();
  if (csrf && !headers['x-csrf-token']) {
    headers['x-csrf-token'] = csrf;
  }

  const cleanPath = path.startsWith('/api/')
    ? path
    : `${BASE}${path.startsWith('/') ? path : '/' + path}`;

  const res = await fetch(cleanPath, {
    method,
    headers,
    credentials: 'include',
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    ...rest,
  });

  // Auth redirect
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Not authenticated');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `API error ${res.status}`);
    err.status = res.status;
    err.details = data.details;
    throw err;
  }

  return data;
}

/**
 * GET shorthand.
 */
export function get(path) {
  return api(path);
}

/**
 * POST shorthand.
 */
export function post(path, body) {
  return api(path, { method: 'POST', body });
}

/**
 * PUT shorthand.
 */
export function put(path, body) {
  return api(path, { method: 'PUT', body });
}

/**
 * PATCH shorthand.
 */
export function patch(path, body) {
  return api(path, { method: 'PATCH', body });
}

/**
 * DELETE shorthand.
 */
export function del(path, body) {
  return api(path, { method: 'DELETE', body });
}

export default { api, get, post, put, patch, del };
