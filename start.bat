@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0
echo ================================

:: 端口清理
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4011 "') do taskkill /F /PID %%a 2>nul

echo   访问地址  http://localhost:4011
echo ================================
echo.

:: 启动后端（含前端静态文件）
echo [启动] 后端服务 :4011
start "MClaw-API" cmd /c "cd /d %~dp0backend && node server.js || (echo [ERROR] 后端启动失败 && pause)"

echo.
echo 服务已启动，浏览器访问 http://localhost:4011
echo 关闭此窗口不影响服务运行。
echo.

timeout /t 3 >nul
start http://localhost:4011
