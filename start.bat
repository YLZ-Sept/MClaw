@echo off
chcp 65001 >nul
title 蛙蔻面板 MClaw

echo ================================
echo   蛙蔻面板 MClaw v1.0
echo   启动中...
echo ================================

:: 杀掉旧进程
echo [1/3] 清理旧进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 "') do (
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174 "') do (
    taskkill /F /PID %%a 2>nul
)

:: 启动后端
echo [2/3] 启动后端 (端口 3001)...
cd /d "%~dp0backend"
start "MClaw-Backend" /min cmd /c "node server.js"
cd ..

:: 等待后端就绪
timeout /t 4 /nobreak >nul

:: 启动前端
echo [3/3] 启动前端 (端口 5174)...
cd /d "%~dp0frontend"
start "MClaw-Frontend" /min cmd /c "npx vite --host 0.0.0.0"
cd ..

echo.
echo ================================
echo   启动完成！
echo   前端: http://localhost:5174
echo   后端: http://localhost:3001
echo ================================
echo.
timeout /t 3 >nul
