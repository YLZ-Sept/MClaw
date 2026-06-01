@echo off
set "PATH=C:\Program Files\nodejs;C:\Users\10260\AppData\Local\Programs\Python\Python312;%PATH%"
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0
echo ================================

:: cleanup
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4173 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000 "') do taskkill /F /PID %%a 2>nul

echo   Frontend  http://localhost:4173
echo   Backend   http://localhost:3001
echo   Douyin    http://localhost:8000
echo ================================
echo.

npx concurrently^
 --names "API,DOUYIN,WEB"^
 --prefix-colors "green,yellow,cyan"^
 "cd backend && node server.js"^
 "cd backend\auto_douyin && python -m uvicorn src.video_uploader.api.app:create_app --host 0.0.0.0 --port 8000 --factory"^
 "cd frontend && npx vite --host 0.0.0.0"

pause
