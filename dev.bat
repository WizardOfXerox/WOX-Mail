@echo off
setlocal enabledelayedexpansion
title WoxMail DEV (mail.wox.world)
color 0A

echo.
echo  ============================================
echo          WoxMail - Development Mode
echo  ============================================
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: ─── Check Node.js ───────────────────────────
set "NODE=node"

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "C:\Program Files\nodejs\node.exe" (
        set "NODE=C:\Program Files\nodejs\node.exe"
    ) else (
        echo [ERROR] Node.js is not installed or not in PATH.
        echo         Please install Node.js from https://nodejs.org
        pause
        exit /b 1
    )
)

echo [OK] Node.js:
call "%NODE%" --version

:: ─── Sync .env ───────────────────────────────
if not exist "%PROJECT_DIR%\.env" (
    if exist "%PROJECT_DIR%\.env.example" (
        echo [WARN] .env not found. Creating from .env.example...
        copy "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env" >nul
    )
)
copy /y "%PROJECT_DIR%\.env" "%PROJECT_DIR%\server\.env" >nul 2>&1

:: ─── Check Docker ────────────────────────────
where docker >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Docker found. Checking containers...
    docker compose up -d 2>nul || docker-compose up -d 2>nul
)

:: ─── Start Cloudflare Tunnel ─────────────────
set "CLOUDFLARED="
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
) else if exist "%PROJECT_DIR%tools\cloudflared.exe" (
    set "CLOUDFLARED=%PROJECT_DIR%tools\cloudflared.exe"
)

set "TUNNEL_TOKEN=eyJhIjoiZmNkOTc1YjAzODllYjVmOGQ4ZWFmZjQ1NTMyYjRmM2EiLCJ0IjoiZTliMDA5MTMtYWI5MC00MzliLWFmNmEtNWE3N2QxNTM2MDM1IiwicyI6Ik5tSmxOR0ZpWXpjdE56QmhNQzAwTkRneExXSTROall0Tm1JMFlUWmpOek5tTkRGaiJ9"

if defined CLOUDFLARED (
    start "WoxMail Cloudflare Tunnel" /min "%CLOUDFLARED%" tunnel run --token %TUNNEL_TOKEN%
    echo [OK] Cloudflare Tunnel started (mail.wox.world)
)

:: ─── Start Server with Nodemon ───────────────
echo.
echo Starting dev server with hot reload...
echo Local:   http://localhost:3001
echo Public:  https://mail.wox.world
echo.

if exist "%PROJECT_DIR%\node_modules\.bin\nodemon.cmd" (
    call "%PROJECT_DIR%\node_modules\.bin\nodemon.cmd" --watch server server/server.js
) else (
    call npx nodemon server/server.js
)

:: Kill background tunnel when server exits
taskkill /F /IM cloudflared.exe >nul 2>&1

echo.
echo Dev server stopped.
pause
