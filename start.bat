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

:: Start backend
echo [start] backend :18621
start /B cmd /c "cd /d %~dp0backend && node server.js >> server.log 2>&1"

:: Wait for backend to be ready
echo [wait] waiting for backend...
set /a RETRY=0
:healthcheck
timeout /t 1 /nobreak >nul
set /a RETRY+=1
curl -s -o nul http://localhost:18621/api/status 2>nul && goto ready
if %RETRY% LSS 15 goto healthcheck
echo [warn] backend startup timeout, checking log...
type "%~dp0backend\server.log" | findstr /i "error fail"
goto :ready

:ready

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
taskkill /F /IM node.exe   >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
echo Done.
