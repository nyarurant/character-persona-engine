@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Ellen-Discord.ps1" %*
exit /b %ERRORLEVEL%
