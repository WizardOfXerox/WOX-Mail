@echo off
setlocal enabledelayedexpansion

:: 1. Wait up to 30 seconds for Drive H: to become accessible on PC boot
set "RETRIES=0"
:CHECK_DRIVE
if not exist "H:\Ideas\Mail\server\server.js" (
    set /a RETRIES+=1
    if !RETRIES! geq 30 goto DRIVE_FAIL
    ping -n 2 127.0.0.1 >nul
    goto CHECK_DRIVE
)

cd /d "H:\Ideas\Mail"

:: 2. Clean up any previous processes running on port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: 3. Clean up any stale WoxMail cloudflared tunnel processes
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name = 'cloudflared.exe'\" | Where-Object { $_.CommandLine -like '*2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3*' } | Stop-Process -Force -ErrorAction SilentlyContinue" >nul 2>&1

:: 4. Sync .env
copy /y ".env" "server\.env" >nul 2>&1

:: 5. Start WoxMail Node.js server in the background
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process node -ArgumentList 'server/server.js' -WorkingDirectory 'H:\Ideas\Mail' -WindowStyle Hidden"

:: 6. Wait for Node.js server to be fully ready and responding to health check
powershell -NoProfile -Command "$ready = $false; for ($i=0; $i -lt 30; $i++) { try { $r = Invoke-WebRequest -Uri 'http://localhost:3001/api/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Seconds 1 }; if (-not $ready) { exit 1 }" >nul 2>&1

:: 7. Start Cloudflare Tunnel for mail.wox.world in the background
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process 'H:\Ideas\Mail\cloudflared.exe' -ArgumentList 'tunnel run 2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3' -WorkingDirectory 'H:\Ideas\Mail' -WindowStyle Hidden"

exit /b 0

:DRIVE_FAIL
exit /b 1
