@echo off
REM Claude Code launcher — pakkene snakker med deg via terminal
REM Hvis Windows Terminal (wt.exe) er installert, brukes det for bedre UX
setlocal

set "PROJECT=C:\Users\helen\Desktop\sakspilot"
set "CLAUDE=C:\Users\helen\.local\bin\claude.exe"

if not exist "%CLAUDE%" (
  echo Fant ikke Claude Code paa: %CLAUDE%
  echo Installer paa nytt fra: https://claude.com/code
  pause
  exit /b 1
)

REM Bytt PROJECT-stien over hvis du jobber paa annet prosjekt
cd /d "%PROJECT%"

REM Prov Windows Terminal forst (penere font, tabs, copy-paste)
where wt.exe >nul 2>nul
if %ERRORLEVEL% == 0 (
  start "" wt.exe -d "%PROJECT%" cmd /k "title Claude Code - %PROJECT% && \"%CLAUDE%\""
  exit /b 0
)

REM Fallback: vanlig cmd-vindu
title Claude Code - %PROJECT%
"%CLAUDE%"
echo.
echo (Claude avsluttet. Trykk en tast for aa lukke vinduet)
pause >nul
