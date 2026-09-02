' ==============================================================================
' WoxMail Silent Background Launcher (Watchdog Supervisor + Tor Hidden Service)
' Runs the WoxMail Watchdog supervisor silently in the background with auto-respawn
' ==============================================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get directories
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverDir = fso.GetParentFolderName(scriptDir)
watchdogScript = scriptDir & "\watchdog.cjs"

' Start Watchdog Supervisor silently (0 = hidden window, False = don't wait)
cmdWatchdog = "cmd.exe /c cd /d """ & serverDir & """ && node """ & watchdogScript & """"
WshShell.Run cmdWatchdog, 0, False
