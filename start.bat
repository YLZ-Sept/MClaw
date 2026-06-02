@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0
echo ================================

:: 端口清理
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3627 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 "') do taskkill /F /PID %%a 2>nul

echo   访问地址  http://localhost:3627
echo   抖音发布    http://localhost:8000
echo ================================
echo.

:: 启动后端（含前端静态文件）
echo [启动] 后端服务 :3627
start "MClaw-API" cmd /c "cd /d %~dp0backend && node server.js"

:: 启动抖音发布服务
echo [启动] 抖音发布 :8000
start "MClaw-Douyin" cmd /c "cd /d %~dp0backend\auto_douyin && python -m uvicorn src.video_uploader.api.app:create_app --host 0.0.0.0 --port 8000 --factory"

echo.
echo 服务已启动，浏览器访问 http://localhost:3627
echo 关闭此窗口不影响服务运行。
echo.

timeout /t 3 >nul
start http://localhost:3627
