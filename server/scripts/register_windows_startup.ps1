# ==============================================================================
# WoxMail Windows Auto-Start Registration Script
# Registers WoxMail to automatically launch on PC boot/login silently in the background
# ==============================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Split-Path -Parent $ScriptDir
$VbsPath = Join-Path $ScriptDir "start_woxmail_silent.vbs"

Write-Host "Registering WoxMail Auto-Start for Windows..." -ForegroundColor Cyan
Write-Host "Server Directory: $ServerDir"
Write-Host "Launcher Script:  $VbsPath"

# Method 1: Register in User Startup Folder (Instant & requires no Admin elevation)
$StartupFolder = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupFolder "WoxMail Server.lnk"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "`"$VbsPath`""
$Shortcut.WorkingDirectory = $ServerDir
$Shortcut.Description = "WoxMail Sovereign Privacy Suite Background Daemon"
$Shortcut.Save()

Write-Host "[SUCCESS] Registered shortcut in Windows Startup Folder: $ShortcutPath" -ForegroundColor Green

# Method 2: Register in Windows Task Scheduler (Runs on user logon)
try {
    $Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$VbsPath`"" -WorkingDirectory $ServerDir
    $Trigger = New-ScheduledTaskTrigger -AtLogOn
    $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName "WoxMailServerDaemon" -Action $Action -Trigger $Trigger -Settings $Settings -Description "WoxMail Server Background Daemon" -Force -ErrorAction SilentlyContinue | Out-Null
    Write-Host "[SUCCESS] Registered Scheduled Task: WoxMailServerDaemon" -ForegroundColor Green
} catch {
    Write-Host "[INFO] Task Scheduler registration skipped (Startup shortcut is active)." -ForegroundColor Yellow
}

Write-Host "`n[DONE] WoxMail will now automatically start in the background when your PC turns on!" -ForegroundColor Green
