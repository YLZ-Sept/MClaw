@echo off
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

:: Start backend (auto-restart on exit)
echo [start] backend :18621 (auto-restart)
start "MClaw" /min cmd /c "cd /d %~dp0backend && :loop && node server.js >> server.log 2>&1 & timeout /t 2 /nobreak >nul & goto loop"

:: Start auto publisher
echo [start] publisher :8001
start /B cmd /c "cd /d %~dp0backend\auto_douyin && python main.py > %~dp0backend\auto_douyin\server.log 2>&1"

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
taskkill /F /IM node.exe   >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
echo Done.
