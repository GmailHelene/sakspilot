@echo off
REM ─────────────────────────────────────────────────────────────
REM  Start Sakspilot dev-server (API + web)
REM  Dobbeltklikk denne fila for å starte alt.
REM  Lar vinduet stå åpent - lukk det med Ctrl+C eller X for å stoppe.
REM ─────────────────────────────────────────────────────────────
title Sakspilot - dev-server (Ikke lukk!)
cd /d "%~dp0"
echo.
echo  ══════════════════════════════════════════════════════════
echo    Sakspilot dev-server starter...
echo    API:  http://localhost:8001
echo    Web:  http://localhost:3001
echo  ══════════════════════════════════════════════════════════
echo.
echo  Aapne nettleser paa http://localhost:3001 naar du ser
echo  "Ready in Xs" lengre nede.
echo.
echo  Stopp serveren med Ctrl+C eller bare lukk vinduet.
echo.
call npm run dev
echo.
echo  Serveren ble stoppet. Trykk en tast for aa lukke...
pause >nul
