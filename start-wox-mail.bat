@echo off
title WoxMail Server + Cloudflare Tunnel (mail.wox.world)
cd /d "%~dp0"
echo ========================================================
echo               WOXMAIL LOCAL SERVER
echo               URL: https://mail.wox.world
echo ========================================================
echo.

echo [1/4] Cleaning up any old process on port 3001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo Stopping process PID %%a...
    taskkill /f /pid %%a >nul 2>&1
)

:: Sync .env to server/.env
copy /y ".env" "server\.env" >nul 2>&1

echo.
echo [2/4] Running database migrations ^& building client...
call node server/migrations/run.js >nul 2>&1
call .\node_modules\.bin\vite.cmd build --config client/vite.config.js >nul 2>&1

echo.
echo [3/4] Starting WoxMail Node.js Server (server/server.js)...
powershell -Command "Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%~dp0server' -WindowStyle Hidden"
timeout /t 2 /nobreak >nul

echo.
echo [4/4] Launching Cloudflare Tunnel for mail.wox.world...
echo ========================================================
echo   Live at: https://mail.wox.world
echo   Local:   http://localhost:3001
echo ========================================================
echo.

.\cloudflared.exe tunnel run 2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3

pause
