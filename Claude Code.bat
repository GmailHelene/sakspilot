@echo off
REM Claude Code wrapper — bruker Sakspilot-prosjektet som default cwd
REM Du kan endre stien under til hvilket prosjekt du jobber mest med
cd /d "C:\Users\helen\Desktop\sakspilot"
title Claude Code — %CD%
"C:\Users\helen\.local\bin\claude.exe"
echo.
echo (Claude avsluttet. Trykk en tast for a lukke)
pause >nul
