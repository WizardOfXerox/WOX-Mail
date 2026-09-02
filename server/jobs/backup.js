/**
 * @fileoverview Database backup job — pg_dump + rotation.
 * Configurable schedule, compresses to .gz, rotates old backups.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '7', 10);
const DB_URL = process.env.DATABASE_URL || 'postgresql://woxmail:woxmail@localhost:5432/woxmail';

function getPgDumpCommand() {
  const commonPaths = [
    'pg_dump',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
  ];

  for (const cmd of commonPaths) {
    if (cmd === 'pg_dump') {
      try {
        execSync('pg_dump --version', { stdio: 'pipe' });
        return cmd;
      } catch {
        continue;
      }
    } else if (fs.existsSync(cmd)) {
      return `"${cmd}"`;
    }
  }
  return null;
}

/**
 * Run a pg_dump backup.
 * @returns {string} Path to the created backup file
 */
export function runBackup() {
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const pgDumpCmd = getPgDumpCommand();
  if (!pgDumpCmd) {
    console.warn('[Backup] pg_dump executable not found in PATH or standard installation directories. Skipping backup.');
    return null;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `woxmail_backup_${timestamp}.sql`;
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    // Run pg_dump
    execSync(`${pgDumpCmd} "${DB_URL}" > "${filepath}"`, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000, // 1 minute max
    });

    // Compress with gzip if available
    try {
      execSync(`gzip "${filepath}"`, { stdio: 'pipe', timeout: 30000 });
      console.log(`[Backup] Backup created: ${filepath}.gz`);
      return `${filepath}.gz`;
    } catch {
      // gzip not available on Windows, keep uncompressed
      console.log(`[Backup] Backup created: ${filepath}`);
      return filepath;
    }
  } catch (err) {
    console.error('[Backup] Backup failed:', err.message);
    throw err;
  }
}

/**
 * Rotate old backups — keep only MAX_BACKUPS most recent.
 */
export function rotateBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('woxmail_backup_'))
    .sort()
    .reverse();

  // Delete files beyond the retention limit
  const toDelete = files.slice(MAX_BACKUPS);
  for (const file of toDelete) {
    fs.unlinkSync(path.join(BACKUP_DIR, file));
    console.log(`[Backup] Rotated old backup: ${file}`);
  }

  if (toDelete.length > 0) {
    console.log(`[Backup] Rotated ${toDelete.length} old backup(s), keeping ${MAX_BACKUPS}`);
  }
}

/**
 * Run full backup cycle: dump + rotate.
 */
export function runBackupCycle() {
  try {
    runBackup();
    rotateBackups();
  } catch (err) {
    console.error('[Backup] Backup cycle failed:', err.message);
  }
}

export default { runBackup, rotateBackups, runBackupCycle };
