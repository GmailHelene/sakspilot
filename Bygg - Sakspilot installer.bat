@echo off
REM ─────────────────────────────────────────────────────────────
REM  Bygg Sakspilot.exe (NSIS-installer for Windows)
REM  Output: apps\desktop\release\Sakspilot Setup 0.0.1.exe
REM
REM  Stopper alle kjoerende Sakspilot/Electron-prosesser foerst
REM  (ellers feiler bygget med EBUSY-laasing).
REM ─────────────────────────────────────────────────────────────
title Sakspilot — Bygg installer
cd /d "%~dp0apps\desktop"

echo.
echo  ══════════════════════════════════════════════════════════
echo    Bygger Sakspilot-installer...
echo  ══════════════════════════════════════════════════════════
echo.
echo  [1/2] Stopper eventuelt kjoerende Sakspilot/Electron...
taskkill /F /IM Sakspilot.exe /T 2>nul
taskkill /F /IM electron.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo  [2/2] Kjoerer electron-builder (kan ta 1-2 min)...
echo.
call npm run build:exe
if errorlevel 1 (
    echo.
    echo  ❌ Build feilet. Sjekk feilmeldingen over.
    echo  Vanligste aarsak: Sakspilot.exe kjoerer fortsatt.
    echo  Loesning: restart maskinen og proev igjen.
    pause
    exit /b 1
)

echo.
echo  ══════════════════════════════════════════════════════════
echo    ✓ Ferdig! Installeren ligger her:
echo    apps\desktop\release\Sakspilot Setup 0.0.1.exe
echo  ══════════════════════════════════════════════════════════
echo.
explorer "%~dp0apps\desktop\release"
pause
