<#
.SYNOPSIS
    Indestructible background supervisor for WoxMail Server & Cloudflare Tunnel (mail.wox.world).
.DESCRIPTION
    1. Waits for Drive H: and network to become accessible on PC boot.
    2. Cleans port 3001 and stale WoxMail tunnel processes.
    3. Launches WoxMail Node.js server with standard module resolution.
    4. Polls local health check until HTTP 200 OK is confirmed.
    5. Launches Cloudflare Tunnel for 2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3.
    6. Verifies remote HTTPS connectivity.
#>
[CmdletBinding()]
param ()

$ErrorActionPreference = 'SilentlyContinue'
$logFile = "H:\Ideas\Mail\service.log"

function Log-Msg ($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Log-Msg "=== WoxMail AutoStart Sequence Initiated ==="

# 1. Wait up to 30 seconds for Drive H: to become accessible
$driveReady = $false
for ($i = 0; $i -lt 30; $i++) {
    if (Test-Path "H:\Ideas\Mail\server\server.js") {
        $driveReady = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $driveReady) {
    Log-Msg "ERROR: Drive H:\Ideas\Mail not accessible after 30s. Exiting."
    exit 1
}

Set-Location "H:\Ideas\Mail"

# 2. Clean up any previous processes running on port 3001
$oldPids = (netstat -aon | Select-String ":3001\s+.*LISTENING" | ForEach-Object {
    ($_ -split '\s+')[-1]
}) | Select-Object -Unique

foreach ($pidToKill in $oldPids) {
    if ($pidToKill -and $pidToKill -ne '0') {
        Log-Msg "Cleaning old process on port 3001 (PID: $pidToKill)..."
        Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
    }
}

# 3. Clean up only stale WoxMail cloudflared tunnel processes
Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" | Where-Object {
    $_.CommandLine -like "*2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3*"
} | ForEach-Object {
    Log-Msg "Stopping stale WoxMail cloudflared tunnel (PID: $($_.ProcessId))..."
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# 4. Sync .env
Copy-Item "H:\Ideas\Mail\.env" -Destination "H:\Ideas\Mail\server\.env" -Force

# 5. Start WoxMail Node.js server in the background
Log-Msg "Starting WoxMail Node.js server..."
$nodeProc = Start-Process node -ArgumentList 'server/server.js' -WorkingDirectory "H:\Ideas\Mail" -WindowStyle Hidden -PassThru
Log-Msg "WoxMail Node.js server started (PID: $($nodeProc.Id))."

# 6. Wait for Node.js server to respond to health check (up to 30s)
$serverHealthy = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -TimeoutSec 2 -UseBasicParsing
        if ($res.StatusCode -eq 200) {
            $serverHealthy = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if (-not $serverHealthy) {
    Log-Msg "ERROR: Node.js server failed health check on port 3001 after 30s."
    exit 1
}
Log-Msg "Node.js server verified healthy on http://localhost:3001."

# 7. Start Cloudflare Tunnel for mail.wox.world in the background
Log-Msg "Starting Cloudflare Tunnel for mail.wox.world..."
$tunnelProc = Start-Process "H:\Ideas\Mail\cloudflared.exe" -ArgumentList "tunnel run 2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3" -WorkingDirectory "H:\Ideas\Mail" -WindowStyle Hidden -PassThru
Log-Msg "Cloudflare Tunnel started (PID: $($tunnelProc.Id))."

# 8. Verify remote HTTPS connectivity
Start-Sleep -Seconds 5
try {
    $remoteRes = Invoke-WebRequest -Uri "https://mail.wox.world" -TimeoutSec 10 -UseBasicParsing
    Log-Msg "https://mail.wox.world is LIVE with status $($remoteRes.StatusCode)!"
} catch {
    Log-Msg "WARNING: Remote check noticed: $($_.Exception.Message)"
}

Log-Msg "=== WoxMail AutoStart Complete & Operational ==="
