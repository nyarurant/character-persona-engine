@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Ellen-Local.ps1" %*
exit /b %ERRORLEVEL%
