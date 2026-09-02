<#
.SYNOPSIS
    Indestructible 24/7 background supervisor for WoxMail Server & Cloudflare Tunnel (mail.wox.world).
.DESCRIPTION
    Continuously monitors Node.js on port 3001, Tor hidden service on port 9050, and Cloudflare Tunnel for mail.wox.world.
    Automatically self-heals and restarts on boot or crash.
#>
$ErrorActionPreference = 'SilentlyContinue'
$logFile = "H:\Ideas\Mail\service.log"

function Log-Msg ($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$timestamp] $msg" | Out-File -FilePath $logFile -Append -Encoding utf8
}

Log-Msg "=== WoxMail Continuous Supervisor Started ==="

# Wait up to 30 seconds for Drive H: to become accessible on boot
for ($i = 0; $i -lt 30; $i++) {
    if (Test-Path "H:\Ideas\Mail\server\server.js") { break }
    Start-Sleep -Seconds 1
}

Set-Location "H:\Ideas\Mail\server"

while ($true) {
    # Check if Watchdog Supervisor is running
    $watchdogProc = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $_.CommandLine -like "*watchdog.cjs*"
    } | Select-Object -First 1

    if (-not $watchdogProc) {
        Log-Msg "WoxMail Watchdog Supervisor not running. Launching node watchdog.cjs..."
        $proc = Start-Process node -ArgumentList 'scripts/watchdog.cjs' -WorkingDirectory "H:\Ideas\Mail\server" -WindowStyle Hidden -PassThru
        Log-Msg "Started WoxMail Watchdog Supervisor (PID: $($proc.Id))."
    }

    Start-Sleep -Seconds 20
}
