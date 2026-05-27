@echo off
REM Stopper alle kjoerende Sakspilot-prosesser (desktop + dev-server)
title Sakspilot — Stopp alt
echo Stopper Sakspilot...
taskkill /F /IM Sakspilot.exe /T 2>nul
taskkill /F /IM electron.exe /T 2>nul

REM Stopp tsx/node-prosesser knyttet til Sakspilot dev-server (port 8001 + 3001)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
)

echo  ✓ Alle Sakspilot-prosesser stoppet.
timeout /t 2 /nobreak >nul
