@echo off
cd /d "%~dp0"

:: Check PowerShell exists
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] PowerShell not found. Windows 10 or later required.
    pause
    exit /b 1
)

:: Request admin rights if not already elevated
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Administrator rights required, requesting elevation...
    powershell -Command "Start-Process '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
    exit /b
)

:: Run main setup script
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

echo.
echo ========================================
if %errorlevel% equ 0 (
    echo   Setup complete! Run start.bat to launch all services.
) else (
    echo   Setup encountered errors. Check the log above or setup.log for details.
)
echo ========================================
pause
