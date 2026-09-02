Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""H:\Ideas\Mail\scripts\WoxMail-Supervisor.ps1""", 0, False
Set WshShell = Nothing
