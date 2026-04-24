@echo off
title Technology Showback Dashboard

set "NODE_DIR=C:\Users\MarSingh\node\node-v24.15.0-win-x64"
set "PYTHON=C:\Users\MarSingh\AppData\Local\Programs\Python\Python312\python.exe"

REM Resolve dashboard root (one level up from scripts\)
set "DASHBOARD_DIR=%~dp0..\"

echo.
echo  ============================================================
echo   BCI Technology Showback Dashboard
echo  ============================================================
echo.

REM ── Kill any process already on port 8000 ────────────────────────────────
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do taskkill /F /PID %%a >nul 2>&1

REM ── Start FastAPI backend ─────────────────────────────────────────────────
echo [1/2] Starting FastAPI backend (port 8000)...
cd /d "%DASHBOARD_DIR%backend"
start "FastAPI Backend" cmd /k "%PYTHON% -m uvicorn main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

REM ── Start Vite frontend ───────────────────────────────────────────────────
echo [2/2] Starting Vite frontend (port 5173)...
cd /d "%DASHBOARD_DIR%"
set "PATH=%NODE_DIR%;%PATH%"
start "Vite Frontend" cmd /k "npm run dev"

timeout /t 4 /nobreak >nul

REM ── Open browser ─────────────────────────────────────────────────────────
echo.
echo  Dashboard is starting at: http://localhost:5173
echo.
start http://localhost:5173

echo  Both servers are running in separate windows.
echo  Close those windows to stop the servers.
echo.
pause
