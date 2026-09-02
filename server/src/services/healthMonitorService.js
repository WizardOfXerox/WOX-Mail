/**
 * WoxMail Health Monitor Service
 * Collects system health metrics: CPU, memory, uptime, DB latency, disk usage.
 * All data comes from native Node.js APIs and PostgreSQL — $0, zero dependencies.
 */

import os from 'os';
import fs from 'fs';
import { query } from '../config/database.js';

/**
 * Measure PostgreSQL round-trip latency in milliseconds
 */
async function getDbLatency() {
  const start = performance.now();
  try {
    await query('SELECT 1');
    return { status: 'connected', latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return { status: 'error', latencyMs: null, error: err.message };
  }
}

/**
 * Get CPU usage averaged over a 500ms sample window
 */
async function getCpuUsage() {
  const cpus = os.cpus();
  const start = cpus.map((c) => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: c.times.idle, total };
  });

  await new Promise((r) => setTimeout(r, 500));
  const end = os.cpus().map((c) => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: c.times.idle, total };
  });

  let totalIdle = 0, totalDelta = 0;
  for (let i = 0; i < start.length; i++) {
    totalIdle += end[i].idle - start[i].idle;
    totalDelta += end[i].total - start[i].total;
  }
  const usagePercent = totalDelta > 0 ? Math.round(((totalDelta - totalIdle) / totalDelta) * 100) : 0;

  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
    usagePercent,
  };
}

/**
 * Get memory usage for both system and Node.js process
 */
function getMemoryUsage() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const processMemory = process.memoryUsage();

  return {
    system: {
      totalMB: Math.round(totalMem / 1048576),
      usedMB: Math.round(usedMem / 1048576),
      freeMB: Math.round(freeMem / 1048576),
      usagePercent: Math.round((usedMem / totalMem) * 100),
    },
    process: {
      rssKB: Math.round(processMemory.rss / 1024),
      heapUsedKB: Math.round(processMemory.heapUsed / 1024),
      heapTotalKB: Math.round(processMemory.heapTotal / 1024),
      externalKB: Math.round(processMemory.external / 1024),
    },
  };
}

/**
 * Get disk usage for the partition where the app is installed.
 * Uses Node.js fs.statfs (available since Node 18.15+) or graceful fallback.
 */
async function getDiskUsage() {
  try {
    if (typeof fs.statfs === 'function') {
      return new Promise((resolve) => {
        fs.statfs(process.cwd(), (err, stats) => {
          if (err) {
            resolve({ status: 'unavailable', error: err.message });
            return;
          }
          const totalBytes = stats.blocks * stats.bsize;
          const freeBytes = stats.bfree * stats.bsize;
          const usedBytes = totalBytes - freeBytes;
          resolve({
            status: 'ok',
            totalGB: (totalBytes / 1073741824).toFixed(1),
            usedGB: (usedBytes / 1073741824).toFixed(1),
            freeGB: (freeBytes / 1073741824).toFixed(1),
            usagePercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
          });
        });
      });
    }
    return { status: 'unavailable', error: 'fs.statfs not supported in this Node version' };
  } catch (err) {
    return { status: 'unavailable', error: err.message };
  }
}

/**
 * Get database table stats: row count estimates for key tables
 */
async function getDbStats() {
  try {
    const res = await query(`
      SELECT relname AS table_name, n_live_tup AS estimated_rows
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
      LIMIT 20
    `);
    return res.rows;
  } catch (err) {
    return [];
  }
}

/**
 * Get full system health snapshot
 */
export async function getHealthSnapshot() {
  const [cpu, db, disk, dbStats] = await Promise.all([
    getCpuUsage(),
    getDbLatency(),
    getDiskUsage(),
    getDbStats(),
  ]);

  const memory = getMemoryUsage();
  const uptimeSeconds = process.uptime();
  const uptimeFormatted = formatUptime(uptimeSeconds);

  return {
    timestamp: new Date().toISOString(),
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
    },
    uptime: {
      seconds: Math.round(uptimeSeconds),
      formatted: uptimeFormatted,
    },
    cpu,
    memory,
    disk,
    database: db,
    databaseTables: dbStats,
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export default { getHealthSnapshot };
