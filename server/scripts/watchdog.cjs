/**
 * WoxMail Always-On Process Supervisor & Watchdog
 *
 * Responsibilities:
 * 1. Resolves port 3001 conflicts and zombie processes
 * 2. Monitors and auto-restarts Node.js webmail server on any crash or freeze
 * 3. Monitors and auto-restarts Tor Hidden Service daemon (tor.exe)
 * 4. Conducts periodic HTTP /api/health heartbeats
 * 5. Runs indefinitely in the background for 24/7 uptime
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

const SERVER_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const TOR_EXE = path.join(ROOT_DIR, 'tor', 'tor', 'tor.exe');
const TORRC = path.join(ROOT_DIR, 'tor', 'torrc');
const CLOUDFLARED_EXE = fs.existsSync("C:\\Program Files (x86)\\cloudflared\\cloudflared.exe")
  ? "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe"
  : path.join(ROOT_DIR, 'cloudflared.exe');
const TUNNEL_ID = '2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3';
const PORT = 3001;

let nodeProcess = null;
let torProcess = null;
let cloudflareProcess = null;
let isShuttingDown = false;
let consecutiveHealthFailures = 0;

function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Supervisor] ${msg}`);
}

function freePort(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    const pids = new Set();

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && !isNaN(pid) && pid !== '0' && parseInt(pid, 10) !== process.pid) {
        pids.add(pid);
      }
    }

    for (const pid of pids) {
      log(`Freeing port ${port}: terminating lingering PID ${pid}`);
      try {
        execSync(`taskkill /F /PID ${pid}`);
      } catch (e) {}
    }
  } catch (e) {
    // Port is free
  }
}

function isTorPortListening() {
  try {
    const output = execSync('netstat -ano | findstr :9050', { encoding: 'utf8' });
    return output.includes('LISTENING');
  } catch (e) {
    return false;
  }
}

function startTorDaemon() {
  if (isShuttingDown) return;
  if (!fs.existsSync(TOR_EXE)) {
    log(`Tor executable not found at ${TOR_EXE} — skipping Tor supervisor`);
    return;
  }

  if (isTorPortListening()) {
    log('Tor hidden service is already active on port 9050');
    return;
  }

  log('Starting Tor Hidden Service daemon...');
  torProcess = spawn(TOR_EXE, ['-f', TORRC], {
    cwd: path.dirname(TOR_EXE),
    stdio: 'ignore',
    windowsHide: true,
    detached: false
  });

  torProcess.on('exit', (code, signal) => {
    torProcess = null;
    if (!isShuttingDown) {
      log(`Tor daemon exited (code: ${code}, signal: ${signal}) — restarting in 3s...`);
      setTimeout(startTorDaemon, 3000);
    }
  });

  torProcess.on('error', (err) => {
    log(`Tor daemon spawn error: ${err.message}`);
  });
}

function isMailTunnelRunning() {
  try {
    const output = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'cloudflared.exe'\\" | Where-Object { $_.CommandLine -like '*${TUNNEL_ID}*' } | Select-Object -ExpandProperty ProcessId"`, { encoding: 'utf8' });
    return Boolean(output.trim());
  } catch (e) {
    return false;
  }
}

function startCloudflareTunnel() {
  if (isShuttingDown) return;
  if (!fs.existsSync(CLOUDFLARED_EXE)) {
    log(`Cloudflared executable not found at ${CLOUDFLARED_EXE} — skipping tunnel supervisor`);
    return;
  }

  if (isMailTunnelRunning()) {
    log('Cloudflare Tunnel for mail.wox.world is already active');
    return;
  }

  log('Starting Cloudflare Tunnel for mail.wox.world...');
  cloudflareProcess = spawn(CLOUDFLARED_EXE, ['tunnel', 'run', TUNNEL_ID], {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    windowsHide: true,
    detached: false
  });

  cloudflareProcess.on('exit', (code, signal) => {
    cloudflareProcess = null;
    if (!isShuttingDown) {
      log(`Cloudflare Tunnel exited (code: ${code}, signal: ${signal}) — restarting in 3s...`);
      setTimeout(startCloudflareTunnel, 3000);
    }
  });

  cloudflareProcess.on('error', (err) => {
    log(`Cloudflare Tunnel spawn error: ${err.message}`);
  });
}

function startNodeServer() {
  if (isShuttingDown) return;

  log('Starting WoxMail backend server (node server.js)...');
  freePort(PORT);

  nodeProcess = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
    windowsHide: true
  });

  consecutiveHealthFailures = 0;

  nodeProcess.on('exit', (code, signal) => {
    nodeProcess = null;
    if (!isShuttingDown) {
      log(`WoxMail server exited unexpectedly (code: ${code}, signal: ${signal}) — auto-restarting in 1s...`);
      setTimeout(startNodeServer, 1000);
    }
  });

  nodeProcess.on('error', (err) => {
    log(`WoxMail server process error: ${err.message} — auto-restarting in 1s...`);
    if (!isShuttingDown) {
      setTimeout(startNodeServer, 1000);
    }
  });
}

function checkHealth() {
  if (isShuttingDown) return;

  const req = http.get(`http://127.0.0.1:${PORT}/api/health`, { timeout: 4000 }, (res) => {
    if (res.statusCode === 200) {
      consecutiveHealthFailures = 0;
    } else {
      handleHealthFailure(`HTTP ${res.statusCode}`);
    }
  });

  req.on('error', (err) => {
    handleHealthFailure(err.message);
  });

  req.on('timeout', () => {
    req.destroy();
    handleHealthFailure('Timeout (4000ms)');
  });
}

function handleHealthFailure(reason) {
  consecutiveHealthFailures++;
  log(`Health check failed (${consecutiveHealthFailures}/3): ${reason}`);

  if (consecutiveHealthFailures >= 3) {
    log('Server unresponsive across 3 consecutive health checks — forcing process restart...');
    consecutiveHealthFailures = 0;
    if (nodeProcess) {
      try {
        nodeProcess.kill('SIGKILL');
      } catch (e) {}
    }
  }
}

// ── Graceful Supervisor Shutdown ──
function shutdown(signal) {
  log(`Received ${signal} — gracefully shutting down supervised processes...`);
  isShuttingDown = true;

  if (nodeProcess) {
    try { nodeProcess.kill('SIGTERM'); } catch (e) {}
  }
  if (torProcess) {
    try { torProcess.kill('SIGTERM'); } catch (e) {}
  }
  if (cloudflareProcess) {
    try { cloudflareProcess.kill('SIGTERM'); } catch (e) {}
  }

  setTimeout(() => {
    process.exit(0);
  }, 1500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Prevent watchdog from dying on uncaught errors
process.on('uncaughtException', (err) => {
  log(`Supervisor Uncaught Exception: ${err.message || err}`);
});

process.on('unhandledRejection', (reason) => {
  log(`Supervisor Unhandled Rejection: ${reason?.message || reason}`);
});

// Boot systems
log('====================================================');
log('  WOXMAIL RESILIENT SUPERVISOR INITIALIZED');
log('====================================================');

startTorDaemon();
startCloudflareTunnel();
startNodeServer();

// Start periodic heartbeat every 20 seconds
setInterval(checkHealth, 20000);
