@echo off
REM ─────────────────────────────────────────────────────────────
REM  Bygg Sakspilot.exe (NSIS-installer for Windows)
REM  Output: apps\desktop\release\Sakspilot Setup 0.0.1.exe
REM
REM  Stopper alle kjoerende Sakspilot/Electron-prosesser foerst
REM  (ellers feiler bygget med EBUSY-laasing).
REM  Verifiserer at electron + app-builder-bin er installert.
REM ─────────────────────────────────────────────────────────────
title Sakspilot — Bygg installer

echo.
echo  ══════════════════════════════════════════════════════════
echo    Bygger Sakspilot-installer...
echo  ══════════════════════════════════════════════════════════
echo.
echo  [1/3] Stopper eventuelt kjoerende Sakspilot/Electron...
taskkill /F /IM Sakspilot.exe /T 2>nul
taskkill /F /IM electron.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo  [2/3] Verifiserer at avhengigheter er installert...
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" goto :needsinstall
if not exist "node_modules\app-builder-bin\win\x64\app-builder.exe" goto :needsinstall
goto :build

:needsinstall
echo        Mangler avhengigheter — kjoerer npm install --force
echo        (kan ta 1-2 min foerste gang)
call npm install --force
if errorlevel 1 (
    echo  ❌ npm install feilet. Sjekk feilmeldingen over.
    pause
    exit /b 1
)

:build
echo  [3/3] Kjoerer electron-builder (kan ta 1-2 min)...
echo.
cd /d "%~dp0apps\desktop"
call npm run build:exe
if errorlevel 1 (
    echo.
    echo  ❌ Build feilet. Sjekk feilmeldingen over.
    echo  Vanligste aarsaker:
    echo    - Sakspilot.exe kjoerer fortsatt (sjekk Task Manager)
    echo    - Manglende avhengigheter (kjoer "npm install --force" i root)
    echo    - Antivirus blokkerer skriving til release-mappa
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
