@echo off
title File Merger Agent
color 0A

echo.
echo  ========================================
echo    FILE MERGER AGENT - Starting...
echo  ========================================
echo.

:: ── Set PostgreSQL password so no prompt appears ──
set PGPASSWORD=M@H@M00000
set PGUSER=postgres

:: ── Check Node.js ──
echo  [1/5] Checking Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js is NOT installed!
    echo  Please install from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo  Node.js found!

:: ── Install Backend Dependencies ──
echo.
echo  [2/5] Checking backend packages...
cd /d %~dp0backend
if not exist node_modules (
    echo  Installing backend packages - please wait...
    npm install
    if %errorlevel% neq 0 (
        echo  ERROR: Backend install failed! Check internet connection.
        cd /d %~dp0
        pause
        exit /b 1
    )
    echo  Backend packages installed!
) else (
    echo  Backend packages already installed!
)
cd /d %~dp0

:: ── Install Frontend Dependencies ──
echo.
echo  [3/5] Checking frontend packages...
cd /d %~dp0frontend
if not exist node_modules (
    echo  Installing frontend packages - takes 2-3 minutes first time...
    npm install
    if %errorlevel% neq 0 (
        echo  ERROR: Frontend install failed! Check internet connection.
        cd /d %~dp0
        pause
        exit /b 1
    )
    echo  Frontend packages installed!
) else (
    echo  Frontend packages already installed!
)
cd /d %~dp0

:: ── Setup PostgreSQL Database ──
echo.
echo  [4/5] Setting up database...

:: Find psql.exe
set PSQL=
if exist "C:\Program Files\PostgreSQL\17\bin\psql.exe" set PSQL="C:\Program Files\PostgreSQL\17\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\16\bin\psql.exe" set PSQL="C:\Program Files\PostgreSQL\16\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\15\bin\psql.exe" set PSQL="C:\Program Files\PostgreSQL\15\bin\psql.exe"
if exist "C:\Program Files\PostgreSQL\14\bin\psql.exe" set PSQL="C:\Program Files\PostgreSQL\14\bin\psql.exe"

if "%PSQL%"=="" (
    where psql >nul 2>&1
    if %errorlevel% equ 0 set PSQL=psql
)

if "%PSQL%"=="" (
    echo.
    echo  ERROR: PostgreSQL not found!
    echo  Install from: https://www.postgresql.org/download/windows/
    echo.
    pause
    exit /b 1
)

echo  PostgreSQL found! Creating database...
%PSQL% -U postgres -c "CREATE DATABASE file_merger_db;" 2>nul
%PSQL% -U postgres -d file_merger_db -c "CREATE TABLE IF NOT EXISTS merge_history (id SERIAL PRIMARY KEY, session_name VARCHAR(255) NOT NULL, input_files JSONB NOT NULL, output_format VARCHAR(20) NOT NULL, output_filename VARCHAR(255) NOT NULL, output_path TEXT NOT NULL, file_count INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMP DEFAULT NOW());" 2>nul
echo  Database ready!

:: ── Start Backend ──
echo.
echo  [5/5] Launching app...
echo.

start "BACKEND - Do Not Close" cmd /k "set PGPASSWORD=M@H@M00000 && color 0B && echo. && echo  BACKEND running on port 5000 && echo  Do NOT close this window! && echo. && cd /d %~dp0backend && node server.js"

echo  Waiting for backend...
timeout /t 5 /nobreak >nul

:: ── Start Frontend ──
start "FRONTEND - Do Not Close" cmd /k "color 05 && echo. && echo  FRONTEND starting on port 3000 && echo  Do NOT close this window! && echo. && cd /d %~dp0frontend && npm start"

echo.
echo  ============================================
echo   Starting up... browser opens in ~20 secs
echo   Keep the BLUE + PURPLE windows OPEN!
echo  ============================================
echo.
timeout /t 20 /nobreak >nul
start http://localhost:3000

echo  App is live at: http://localhost:3000
echo.
echo  You can close THIS window.
echo  Keep the other 2 windows open to keep app running.
echo.
pause
