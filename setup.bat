@echo off
chcp 65001 >nul 2>&1
title MClaw Setup
cd /d "%~dp0"

echo ================================
echo   MClaw v1.0 环境安装
echo ================================
echo.

:: 检查 Node.js
echo [检查] Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] 未找到 Node.js，请先安装 https://nodejs.org/
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo [OK] Node.js %%i

:: 检查 Python
echo [检查] Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] 未找到 Python，请先安装 https://www.python.org/
  pause
  exit /b 1
)
python --version

echo.
echo [1/2] 安装后端依赖...
cd /d "%~dp0backend"
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] npm install 失败
  pause
  exit /b 1
)

echo.
echo [2/2] 安装 Python 依赖...
cd /d "%~dp0backend\auto_douyin"
if exist "pyproject.toml" (
  pip install -e .
) else if exist "requirements.txt" (
  pip install -r requirements.txt
) else (
  echo [WARN] 未找到 pyproject.toml 或 requirements.txt，跳过
)

echo.
echo ================================
echo   安装完成！
echo   双击 start.bat 启动服务
echo ================================
pause
