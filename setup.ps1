# MClaw v1.0 环境安装脚本
# 自动检测 + 安装 Node.js / Python / 依赖 / 构建前端

$ErrorActionPreference = "Continue"
$ProjectRoot = $PSScriptRoot
$LogFile = Join-Path $ProjectRoot "setup.log"
$Step = 0

# ============================================================
# 工具函数
# ============================================================

function Write-Banner {
    Clear-Host
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  MClaw v1.0 环境安装工具"             -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "项目路径: $ProjectRoot" -ForegroundColor DarkGray
    Write-Host "日志文件: $LogFile"     -ForegroundColor DarkGray
    Write-Host ""
}

function Write-Step($msg) {
    $global:Step++
    $timestamp = Get-Date -Format "HH:mm:ss"
    $line = "[$timestamp] 步骤 $Step : $msg"
    Write-Host $line -ForegroundColor Yellow
    Add-Content -Path $LogFile -Value $line
}

function Write-OK($msg) {
    Write-Host "    ✔ $msg" -ForegroundColor Green
    Add-Content -Path $LogFile -Value "    OK: $msg"
}

function Write-Warn($msg) {
    Write-Host "    ⚠ $msg" -ForegroundColor Yellow
    Add-Content -Path $LogFile -Value "    WARN: $msg"
}

function Write-Fail($msg) {
    Write-Host "    ✘ $msg" -ForegroundColor Red
    Add-Content -Path $LogFile -Value "    FAIL: $msg"
}

function Test-Command($cmd) {
    return (Get-Command $cmd -ErrorAction SilentlyContinue) -ne $null
}

function Refresh-Path {
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

function Invoke-Exe($exe, $args, $desc) {
    $proc = Start-Process -FilePath $exe -ArgumentList $args -NoNewWindow -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        Write-Fail "$desc (退出码: $($proc.ExitCode))"
        return $false
    }
    return $true
}

# ============================================================
# 初始化
# ============================================================

Clear-Host
"" > $LogFile  # 清空日志
Write-Banner

# 记录系统信息
$os = Get-CimInstance Win32_OperatingSystem
Write-Host "系统: $($os.Caption) ($($os.OSArchitecture))" -ForegroundColor Gray
Write-Host "内存: $([math]::Round($os.TotalVisibleMemorySize/1MB, 1)) GB" -ForegroundColor Gray
Write-Host ""

# ============================================================
# 步骤 1: 检查 winget
# ============================================================
Write-Step "检查 winget (Windows 包管理器)"

$hasWinget = Test-Command winget
if ($hasWinget) {
    Write-OK "winget 可用"
} else {
    Write-Warn "winget 未安装（Windows 10 1809 之前版本）"
    Write-Warn "将尝试通过直接下载链接安装 Node.js 和 Python"
    Write-Warn "建议升级 Windows 或手动安装 winget:"
    Write-Warn "  https://apps.microsoft.com/detail/9nblggh4nns1"
}

# ============================================================
# 步骤 2: 检查/安装 Node.js
# ============================================================
Write-Step "检查 Node.js"

$needRefreshPath = $false
$nodeInstalled = $false

if (Test-Command node) {
    $nodeVersion = (node --version 2>$null) -replace 'v', ''
    $nodeMajor = [int]($nodeVersion -split '\.')[0]
    if ($nodeMajor -ge 18) {
        Write-OK "Node.js v$nodeVersion (已满足要求 >=18)"
        $nodeInstalled = $true
    } elseif ($nodeMajor -ge 16) {
        Write-Warn "Node.js v$nodeVersion (最低可接受，建议升级到 18+)"
        $nodeInstalled = $true
    } else {
        Write-Warn "Node.js v$nodeVersion 版本过旧 (需要 >=16)"
        $nodeInstalled = $false
    }
}

if (-not $nodeInstalled) {
    Write-Host "    正在安装 Node.js LTS..." -ForegroundColor Gray
    if ($hasWinget) {
        $ok = Invoke-Exe winget "install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements" "winget 安装 Node.js"
        if ($ok) {
            $needRefreshPath = $true
            Write-OK "Node.js 安装完成（winget）"
        } else {
            Write-Fail "winget 安装 Node.js 失败，请手动安装 https://nodejs.org/"
        }
    } else {
        Write-Warn "请手动安装 Node.js: https://nodejs.org/ (下载 LTS 版本)"
        Write-Warn "安装完成后重新运行本脚本"
        pause
        exit 1
    }
}

# ============================================================
# 步骤 3: 检查/安装 Python
# ============================================================
Write-Step "检查 Python 3.10+"

$pythonCmd = $null
$pythonInstalled = $false

# 优先找 python3，再找 python
if (Test-Command python3) {
    $pythonCmd = "python3"
} elseif (Test-Command python) {
    $pythonCmd = "python"
}

if ($pythonCmd) {
    $pyVersion = & $pythonCmd --version 2>&1
    if ($pyVersion -match 'Python (\d+)\.(\d+)') {
        $pyMajor = [int]$Matches[1]
        $pyMinor = [int]$Matches[2]
        if ($pyMajor -ge 4 -or ($pyMajor -eq 3 -and $pyMinor -ge 10)) {
            Write-OK "Python $pyVersion (已满足要求 >=3.10)"
            $pythonInstalled = $true
        } else {
            Write-Warn "Python $pyVersion 版本过旧 (需要 >=3.10)"
        }
    }
}

if (-not $pythonInstalled) {
    Write-Host "    正在安装 Python 3.12..." -ForegroundColor Gray
    if ($hasWinget) {
        $ok = Invoke-Exe winget "install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements" "winget 安装 Python"
        if ($ok) {
            $needRefreshPath = $true
            Write-OK "Python 安装完成（winget）"
            $pythonCmd = "python"
        } else {
            Write-Fail "winget 安装 Python 失败，请手动安装 https://www.python.org/downloads/"
        }
    } else {
        Write-Warn "请手动安装 Python 3.10+: https://www.python.org/downloads/"
        Write-Warn "安装时请勾选 'Add Python to PATH'"
        Write-Warn "安装完成后重新运行本脚本"
        pause
        exit 1
    }
}

# ============================================================
# 刷新 PATH（安装新软件后需要）
# ============================================================
if ($needRefreshPath) {
    Write-Step "刷新环境变量 PATH"
    Refresh-Path
    Write-OK "PATH 已刷新"

    # 重新探测命令
    if (-not (Test-Command node)) {
        Write-Warn "node 命令仍不可用，请关闭此窗口重新运行 setup.bat"
        pause
        exit 1
    }
    if (-not $pythonCmd -or -not (Test-Command $pythonCmd)) {
        # 重新探测 python
        if (Test-Command python3) {
            $pythonCmd = "python3"
        } elseif (Test-Command python) {
            $pythonCmd = "python"
        }
    }
}

# ============================================================
# 步骤 4: 安装后端 npm 依赖
# ============================================================
Write-Step "安装后端 npm 依赖 (backend/)"

$backendDir = Join-Path $ProjectRoot "backend"
if (Test-Path (Join-Path $backendDir "package.json")) {
    Push-Location $backendDir
    Write-Host "    目录: $backendDir" -ForegroundColor Gray
    Write-Host "    执行 npm install... (可能需要几分钟)" -ForegroundColor Gray

    $npmOutput = npm install 2>&1
    $npmExit = $LASTEXITCODE

    if ($npmExit -eq 0) {
        Write-OK "后端 npm 依赖安装完成"
    } else {
        Write-Fail "后端 npm 依赖安装失败"
        Write-Host $npmOutput -ForegroundColor Red

        # 检查是否是 better-sqlite3 编译失败
        if ($npmOutput -match "better-sqlite3" -and $npmOutput -match "node-gyp") {
            Write-Warn "better-sqlite3 需要 C++ 编译工具"
            Write-Warn "请安装 Visual Studio Build Tools:"
            Write-Warn "  https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022"
            Write-Warn "安装时勾选 'Desktop development with C++'"
        }
        pause
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Fail "未找到 backend/package.json，请确认项目文件完整"
    exit 1
}

# ============================================================
# 步骤 5: 安装前端 npm 依赖
# ============================================================
Write-Step "安装前端 npm 依赖 (frontend/)"

$frontendDir = Join-Path $ProjectRoot "frontend"
if (Test-Path (Join-Path $frontendDir "package.json")) {
    Push-Location $frontendDir
    Write-Host "    目录: $frontendDir" -ForegroundColor Gray
    Write-Host "    执行 npm install..." -ForegroundColor Gray

    $npmOutput = npm install 2>&1
    $npmExit = $LASTEXITCODE

    if ($npmExit -eq 0) {
        Write-OK "前端 npm 依赖安装完成"
    } else {
        Write-Fail "前端 npm 依赖安装失败"
        Write-Host $npmOutput -ForegroundColor Red
        pause
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Fail "未找到 frontend/package.json，请确认项目文件完整"
    exit 1
}

# ============================================================
# 步骤 6: 安装 Python 发布服务依赖
# ============================================================
Write-Step "安装 Python 发布服务依赖 (backend/auto_douyin/)"

$pythonDir = Join-Path $ProjectRoot "backend\auto_douyin"
if (Test-Path (Join-Path $pythonDir "main.py")) {
    Write-Host "    安装 Python 包..." -ForegroundColor Gray
    Write-Host "    (fastapi, uvicorn, playwright, pydantic, loguru, aiofiles, biliup, mcp)" -ForegroundColor Gray

    $pipArgs = @(
        "install",
        "fastapi",
        "uvicorn[standard]",
        "playwright",
        "pydantic",
        "loguru",
        "python-dotenv",
        "aiofiles",
        "biliup",
        "mcp"
    )
    $pipOutput = & $pythonCmd -m pip @pipArgs 2>&1
    $pipExit = $LASTEXITCODE

    if ($pipExit -eq 0) {
        Write-OK "Python 依赖安装完成"
    } else {
        Write-Fail "Python 依赖安装失败"
        Write-Host $pipOutput -ForegroundColor Red
        Write-Warn "请手动执行: $pythonCmd -m pip install fastapi uvicorn playwright pydantic loguru aiofiles biliup mcp"
    }
} else {
    Write-Warn "未找到 backend/auto_douyin/main.py，跳过 Python 依赖"
    Write-Warn "如需多平台发布功能，请确保项目文件完整"
}

# ============================================================
# 步骤 7: 安装 Playwright 浏览器（Node.js 侧）
# ============================================================
Write-Step "安装 Playwright 浏览器 (Node.js)"

Push-Location $backendDir
Write-Host "    执行 npx playwright install chromium... (可能需要几分钟，需联网)" -ForegroundColor Gray

$pwOutput = npx playwright install chromium 2>&1
$pwExit = $LASTEXITCODE

if ($pwExit -eq 0) {
    Write-OK "Node.js Playwright Chromium 安装完成"
} else {
    Write-Fail "Playwright Chromium (Node.js) 安装失败"
    Write-Host $pwOutput -ForegroundColor Red
    Write-Warn "可能原因：网络问题 / 磁盘空间不足"
    Write-Warn "手动安装: cd backend && npx playwright install chromium"
}
Pop-Location

# ============================================================
# 步骤 8: 安装 Playwright 浏览器（Python 侧）
# ============================================================
if ($pythonCmd) {
    Write-Step "安装 Playwright 浏览器 (Python)"

    Write-Host "    执行 python -m playwright install chromium..." -ForegroundColor Gray

    $pwPyOutput = & $pythonCmd -m playwright install chromium 2>&1
    $pwPyExit = $LASTEXITCODE

    if ($pwPyExit -eq 0) {
        Write-OK "Python Playwright Chromium 安装完成"
    } else {
        Write-Fail "Playwright Chromium (Python) 安装失败"
        Write-Host $pwPyOutput -ForegroundColor Red
        Write-Warn "手动安装: $pythonCmd -m playwright install chromium"
    }
}

# ============================================================
# 步骤 9: 构建前端
# ============================================================
Write-Step "构建前端 (npm run build)"

Push-Location $frontendDir
Write-Host "    执行 npm run build..." -ForegroundColor Gray

$buildOutput = npm run build 2>&1
$buildExit = $LASTEXITCODE

if ($buildExit -eq 0) {
    Write-OK "前端构建完成 (frontend/dist/)"
} else {
    Write-Fail "前端构建失败"
    Write-Host $buildOutput -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# ============================================================
# 步骤 10: 检查 .env 配置
# ============================================================
Write-Step "检查环境配置 (.env)"

$envFile = Join-Path $ProjectRoot "backend\.env"
if (Test-Path $envFile) {
    Write-OK ".env 文件已存在"
} else {
    Write-Warn ".env 文件不存在，正在创建模板..."
    @"
# MClaw 环境变量配置
# 蝉镜 API（用于视频生成）
CHANJING_APP_ID=your_app_id_here
CHANJING_SECRET_KEY=your_secret_key_here

# AI 模型 API Key 请在前端「模型配置」页面填写，无需在此配置
"@ | Out-File -FilePath $envFile -Encoding UTF8
    Write-OK ".env 模板已创建: $envFile"
    Write-Warn "请根据需要编辑 backend\.env 中的蝉镜密钥"
}

# ============================================================
# 步骤 11: 端口检测
# ============================================================
Write-Step "端口可用性检测"

$ports = @(18621, 8000)
$portsAllFree = $true

foreach ($port in $ports) {
    $listener = netstat -ano 2>$null | Select-String ":$port "
    if ($listener) {
        $pid = ($listener -split '\s+')[-1]
        Write-Warn "端口 $port 已被占用 (PID: $pid)"
        $label = @{18621="后端 API"; 8000="多平台发布"}[$port]
        Write-Warn "请先关闭占用 $label 端口 ($port) 的程序，或修改配置"
        $portsAllFree = $false
    } else {
        Write-OK "端口 $port 空闲"
    }
}

# ============================================================
# 步骤 12: 启动验证
# ============================================================
Write-Step "启动验证"

Write-Host "    正在启动后端服务进行冒烟测试..." -ForegroundColor Gray

# 启动后端
$backendProc = Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $backendDir -PassThru -NoNewWindow

# 等待服务启动
$maxWait = 15
for ($i = 1; $i -le $maxWait; $i++) {
    Start-Sleep -Seconds 1
    try {
        $res = Invoke-WebRequest -Uri "http://localhost:18621/api/info" -UseBasicParsing -TimeoutSec 2
        if ($res.StatusCode -eq 200) {
            Write-OK "后端 API 响应正常（$i 秒内启动）"
            $body = $res.Content | ConvertFrom-Json
            Write-Host "    版本: $($body.data.version)" -ForegroundColor Gray
            break
        }
    } catch {
        if ($i -eq $maxWait) {
            Write-Fail "后端 API 未能在 $maxWait 秒内响应"
            Write-Warn "请检查 backend/server.log 排查原因"
        }
    }
}

# 停止测试进程
if ($backendProc -and -not $backendProc.HasExited) {
    Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "    测试进程已停止" -ForegroundColor Gray
}

# ============================================================
# 完成
# ============================================================

# 清理测试产生的 server.log
$serverLog = Join-Path $backendDir "server.log"
if (Test-Path $serverLog) {
    Remove-Item $serverLog -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装摘要" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 检查各部分状态
$nodeOK = Test-Command node
$pythonOK = $pythonCmd -and (Test-Command $pythonCmd)
$backendNM = Test-Path (Join-Path $backendDir "node_modules")
$frontendNM = Test-Path (Join-Path $frontendDir "node_modules")
$frontendDist = Test-Path (Join-Path $frontendDir "dist")
$envOK = Test-Path $envFile

Write-Host ("  Node.js          : " + $(if ($nodeOK) { "✔" } else { "✘" })) -ForegroundColor $(if ($nodeOK) { "Green" } else { "Red" })
Write-Host ("  Python           : " + $(if ($pythonOK) { "✔" } else { "✘" })) -ForegroundColor $(if ($pythonOK) { "Green" } else { "Red" })
Write-Host ("  后端 node_modules : " + $(if ($backendNM) { "✔" } else { "✘" })) -ForegroundColor $(if ($backendNM) { "Green" } else { "Red" })
Write-Host ("  前端 node_modules : " + $(if ($frontendNM) { "✔" } else { "✘" })) -ForegroundColor $(if ($frontendNM) { "Green" } else { "Red" })
Write-Host ("  前端 dist         : " + $(if ($frontendDist) { "✔" } else { "✘" })) -ForegroundColor $(if ($frontendDist) { "Green" } else { "Red" })
Write-Host ("  .env 配置         : " + $(if ($envOK) { "✔" } else { "✘" })) -ForegroundColor $(if ($envOK) { "Green" } else { "Red" })

Write-Host ""
if ($backendNM -and $frontendNM -and $frontendDist -and $nodeOK) {
    Write-Host "  环境就绪，运行 start.bat 启动全部服务" -ForegroundColor Green
    Write-Host "  访问地址: http://localhost:18621" -ForegroundColor Green
} else {
    Write-Host "  存在未完成项，请检查上方日志修复后重新运行" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  详细日志: $LogFile" -ForegroundColor DarkGray
Write-Host ""

# 询问是否立即启动
if ($backendNM -and $frontendNM -and $frontendDist -and $nodeOK) {
    $choice = Read-Host "是否立即启动全部服务？(Y/n)"
    if ($choice -ne "n" -and $choice -ne "N") {
        $startBat = Join-Path $ProjectRoot "start.bat"
        if (Test-Path $startBat) {
            Write-Host "正在启动服务..." -ForegroundColor Cyan
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$startBat`""
        }
    }
}
