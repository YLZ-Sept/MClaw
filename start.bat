@echo off
chcp 65001 >nul 2>&1
title MClaw
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0
echo ================================

:: 端口清理
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":18621 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 "')  do taskkill /F /PID %%a 2>nul

echo   访问地址  http://localhost:18621
echo ================================
echo.

:: 后台启动后端
echo [启动] 后端服务 :18621
start /B cmd /c "cd /d %~dp0backend && node server.js > server.log 2>&1"

:: 后台启动多平台发布
echo [启动] 多平台发布服务 :8000
start /B cmd /c "cd /d %~dp0backend\auto_douyin && python main.py > server.log 2>&1"

echo.
echo 浏览器将自动打开 http://localhost:18621
start http://localhost:18621

echo.
echo ================================
echo   所有服务运行中
echo   按任意键停止全部服务并退出
echo ================================
pause >nul

:: 停止所有服务
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":18621 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 "')  do taskkill /F /PID %%a 2>nul