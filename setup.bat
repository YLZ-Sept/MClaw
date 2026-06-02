@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0 环境安装
echo ================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] 未找到 Node.js，请先安装 https://nodejs.org/
  pause
  exit /b 1
)
echo [OK] Node.js %node_version%
for /f "tokens=*" %%i in ('node -v') do set node_version=%%i
echo   version: %node_version%

:: 检查 Python
where python >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] 未找到 Python，请先安装 https://www.python.org/
  pause
  exit /b 1
)
echo [OK] Python
python --version

echo.
echo [1/3] 安装后端依赖...
cd /d "%~dp0backend"
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] npm install 失败
  pause
  exit /b 1
)

echo.
echo [2/3] 安装 Python 依赖...
cd /d "%~dp0backend\auto_douyin"
if exist "requirements.txt" (
  pip install -r requirements.txt
) else (
  echo [WARN] 未找到 requirements.txt，跳过
)

echo.
echo [3/3] 安装 Playwright 浏览器...
cd /d "%~dp0backend"
npx playwright install chromium 2>nul
if %errorlevel% neq 0 echo [WARN] Playwright 浏览器安装失败，可稍后手动执行

echo.
echo ================================
echo   安装完成！
echo   双击 start.bat 启动服务
echo ================================
pause
