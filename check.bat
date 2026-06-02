@echo off
chcp 65001 >nul
echo ================================
echo   环境诊断
echo ================================
echo.
echo 当前目录: %cd%
echo 脚本目录: %~dp0
echo.

where node 2>nul
if %errorlevel% equ 0 (
  echo [OK] node 可用
  node -v
) else (
  echo [FAIL] node 不在 PATH 中
)
echo.

where npx 2>nul
if %errorlevel% equ 0 (
  echo [OK] npx 可用
) else (
  echo [FAIL] npx 不在 PATH 中
)
echo.

where python 2>nul
if %errorlevel% equ 0 (
  echo [OK] python 可用
  python --version
) else (
  echo [FAIL] python 不在 PATH 中
)
echo.

echo 检查目录:
if exist "%~dp0backend\server.js" (echo [OK] backend\server.js) else (echo [FAIL] backend\server.js)
if exist "%~dp0frontend\node_modules" (echo [OK] frontend\node_modules) else (echo [FAIL] frontend\node_modules 未安装)
if exist "%~dp0backend\auto_douyin" (echo [OK] backend\auto_douyin) else (echo [FAIL] backend\auto_douyin)
echo.

echo 测试后端启动(5秒后杀掉)...
cd /d "%~dp0backend"
start "TestBackend" cmd /c "node server.js"
timeout /t 5 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4011 "') do taskkill /F /PID %%a 2>nul
echo 后端测试完成
echo.

echo 测试前端启动(5秒后杀掉)...
cd /d "%~dp0frontend"
start "TestFrontend" cmd /c "npx vite --host 0.0.0.0 --port 4173"
timeout /t 6 /nobreak >nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":4173 "') do taskkill /F /PID %%a 2>nul
echo 前端测试完成
echo.

pause
