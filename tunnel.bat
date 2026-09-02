@echo off
setlocal enabledelayedexpansion
title Cloudflare Tunnel - WoxMail (mail.wox.world)
color 0B

echo.
echo  ======================================================
echo     Cloudflare Tunnel - WoxMail (mail.wox.world)
echo  ======================================================
echo.

set "PROJECT_DIR=%~dp0"
set "CLOUDFLARED="

:: Locate cloudflared binary
if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
) else if exist "%PROJECT_DIR%tools\cloudflared.exe" (
    set "CLOUDFLARED=%PROJECT_DIR%tools\cloudflared.exe"
) else (
    set "CLOUDFLARED=cloudflared"
)

echo [OK] Starting Cloudflare Tunnel for mail.wox.world...
echo      Routing traffic to http://localhost:3001
echo.
echo  ======================================================
echo    Tunnel is active! Access your site at:
echo    https://mail.wox.world
echo  ======================================================
echo.

call "%CLOUDFLARED%" tunnel run 2b3bde6c-8fb8-431c-bd2b-fceef5c93fe3

echo.
echo Tunnel stopped.
pause
