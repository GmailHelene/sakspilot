@echo off
REM ─────────────────────────────────────────────────────────────
REM  Start Sakspilot desktop-agent (Electron tray-app)
REM  Dobbeltklikk for aa starte. Tray-ikonet dukker opp ved klokken.
REM  Lukk vinduet eller Ctrl+C for aa stoppe agenten.
REM ─────────────────────────────────────────────────────────────
title Sakspilot — Desktop agent (Ikke lukk!)
cd /d "%~dp0apps\desktop"
echo.
echo  ══════════════════════════════════════════════════════════
echo    Sakspilot desktop-agent starter...
echo  ══════════════════════════════════════════════════════════
echo.
echo  Se etter ikonet i system-trayen (nederst til hoyre).
echo  Hoyreklikk for meny. Innstillinger-vindu apnes automatisk
echo  ved foerste start.
echo.
echo  La vinduet staa aapent — agenten kjoerer i bakgrunnen.
echo.
call npm start
echo.
echo  Agenten ble stoppet. Trykk en tast for aa lukke...
pause >nul
