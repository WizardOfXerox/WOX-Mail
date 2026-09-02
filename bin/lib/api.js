import { getConfig } from './config.js';

export async function apiRequest(endpoint, options = {}) {
  const config = getConfig();
  const baseUrl = config.serverUrl.replace(/\/$/, '');
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'woxmail-cli/1.0.0',
    ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
    }
    return data;
  } else {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}: ${res.statusText}`);
    }
    return text;
  }
}
