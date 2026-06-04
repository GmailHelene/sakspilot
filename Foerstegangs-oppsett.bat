@echo off
REM ─────────────────────────────────────────────────────────────
REM  Foerstegangs-oppsett av Sakspilot
REM
REM  Kjoer denne EN gang naar du har:
REM    1. Klonet repoet fra GitHub
REM    2. Opprettet Neon-database
REM    3. Limt inn DATABASE_URL i apps\api\.env
REM
REM  Installerer alle avhengigheter og pusher schema til Neon.
REM ─────────────────────────────────────────────────────────────
title Sakspilot - foerstegangs-oppsett
cd /d "%~dp0"

echo.
echo  ══════════════════════════════════════════════════════════
echo    Sakspilot - foerstegangs-oppsett
echo  ══════════════════════════════════════════════════════════
echo.
echo  Sjekker forutsetninger...
echo.

REM Sjekk Node
node --version >nul 2>&1
if errorlevel 1 (
    echo  ❌ Node.js er ikke installert. Last ned fra https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo  ✓ Node.js %%i
echo.

REM Sjekk .env
if not exist "apps\api\.env" (
    echo  ⚠  apps\api\.env mangler! Opprett den foerst:
    echo     1. Kopier apps\api\.env.example til apps\api\.env
    echo     2. Lim inn DATABASE_URL og DIRECT_URL fra Neon
    echo     3. Generer JWT_SECRET med:
    echo        node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
    pause
    exit /b 1
)
echo  ✓ apps\api\.env finnes
echo.

REM Sjekk apps\web\.env.local
if not exist "apps\web\.env.local" (
    echo  Kopierer apps\web\.env.example til apps\web\.env.local...
    copy "apps\web\.env.example" "apps\web\.env.local" >nul
    echo  ✓ Opprettet
)
echo.

echo  [1/3] Installerer avhengigheter (kan ta noen minutter)...
call npm install
if errorlevel 1 ( echo  ❌ npm install feilet & pause & exit /b 1 )
echo.

echo  [2/3] Genererer Prisma-klient...
call npm run db:generate
if errorlevel 1 ( echo  ❌ db:generate feilet & pause & exit /b 1 )
echo.

echo  [3/3] Pusher schema til Neon...
call npm run db:push
if errorlevel 1 (
    echo  ❌ db:push feilet. Sjekk at DATABASE_URL i apps\api\.env stemmer.
    pause
    exit /b 1
)

echo.
echo  ══════════════════════════════════════════════════════════
echo    ✓ Oppsett fullfoert!
echo
echo    Neste steg:
echo      1. Dobbeltklikk "Start - Sakspilot dev.bat"
echo      2. Aapne http://localhost:3001 i nettleser
echo      3. Registrer din foerste konto
echo      4. Dobbeltklikk "Start - Sakspilot desktop.bat"
echo  ══════════════════════════════════════════════════════════
echo.
pause
