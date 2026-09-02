import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.woxmail');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return { serverUrl: 'http://localhost:3000', token: null, email: null };
    }
    const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { serverUrl: 'http://localhost:3000', token: null, email: null };
  }
}

export function saveConfig(updates) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
    }
    const current = getConfig();
    const merged = { ...current, ...updates };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
    return merged;
  } catch (err) {
    console.error('Failed to write configuration:', err.message);
  }
}

export function clearToken() {
  saveConfig({ token: null, email: null, username: null });
}
