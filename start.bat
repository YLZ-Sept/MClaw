@echo off
chcp 65001 >nul
title MClaw
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0
echo ================================

:: Port cleanup
taskkill /F /IM node.exe   >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1

echo   URL: http://localhost:18621
echo ================================
echo.

:: ── Start MClaw Backend（含 AI引擎 auto-start）──
echo [start] backend :18621
start /B cmd /c "cd /d %~dp0backend && node server.js >> server.log 2>&1"
call :wait_for "http://localhost:18621/api/status" "backend" 15

:: Start auto publisher
echo [start] publisher :18623
start /B cmd /c "cd /d %~dp0backend\auto_douyin && python main.py >> server.log 2>&1"

echo.
start http://localhost:18621

if /i "%~1"=="--daemon" goto :daemon

echo.
echo ================================
echo   Services running.
echo   Press any key to stop all.
echo ================================
pause >nul
goto :cleanup

:daemon
echo.
echo   Services running in background.
timeout /t 3 /nobreak >nul
exit

:cleanup
echo Stopping...
taskkill /F /IM node.exe      >nul 2>&1
taskkill /F /IM python.exe    >nul 2>&1
taskkill /F /IM openclaw.exe  >nul 2>&1
echo Done.
exit /b

:: ── Helper: wait_for URL label retries ──
:wait_for
set /a N=0
:wait_loop
timeout /t 1 /nobreak >nul
set /a N+=1
curl -s -o nul %1 2>nul && (
    echo [ok] %2 ready
    exit /b 0
)
if %N% LSS %3 goto :wait_loop
echo [warn] %2 startup timeout, continuing anyway...
exit /b 1
