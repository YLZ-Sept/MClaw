@echo off
chcp 65001 >nul 2>&1
title MClaw 环境安装
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0 环境安装工具
echo ================================
echo.

:: 检查是否有 PowerShell
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 PowerShell，请确认系统为 Windows 10 或更高版本
    pause
    exit /b 1
)

:: 以管理员权限重新启动（如需要）
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 需要管理员权限来安装软件，正在请求提权...
    powershell -Command "Start-Process '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
    exit /b
)

:: 执行 PowerShell 安装脚本
powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

echo.
echo ================================
if %errorlevel% equ 0 (
    echo   安装完成！请运行 start.bat 启动服务
) else (
    echo   安装过程中出现错误，请检查上方日志
)
echo ================================
pause
