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

function Invoke-Exe($exe, $exeArgs, $desc) {
    $proc = Start-Process -FilePath $exe -ArgumentList $exeArgs -NoNewWindow -Wait -PassThru
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
Write-Host "脚本路径: $ProjectRoot" -ForegroundColor Gray
Write-Host "工作目录: $(Get-Location)" -ForegroundColor Gray
# 快速校验项目完整性
$hasBackend = Test-Path (Join-Path $ProjectRoot "backend\package.json")
$hasFrontend = Test-Path (Join-Path $ProjectRoot "frontend\package.json")
Write-Host "backend/package.json : $(if($hasBackend){'OK'}else{'MISSING'})" -ForegroundColor $(if($hasBackend){'Gray'}else{'Red'})
Write-Host "frontend/package.json: $(if($hasFrontend){'OK'}else{'MISSING'})" -ForegroundColor $(if($hasFrontend){'Gray'}else{'Red'})
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
            Write-Warn "安装完成后重新运行本脚本"
            pause
            exit 1
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

function Find-PythonInDir($dir) {
    foreach ($name in @("python.exe", "python3.exe")) {
        $p = Join-Path $dir $name
        if (Test-Path $p) { return $p }
    }
    return $null
}

function Find-PythonInstall {
    # 1) 查注册表（最可靠）
    foreach ($hive in @("HKLM", "HKCU")) {
        foreach ($ver in @("3.13", "3.12", "3.11", "3.10", "3.9")) {
            try {
                $key = "$hive\SOFTWARE\Python\PythonCore\$ver\InstallPath"
                $installPath = (Get-ItemProperty -Path "Registry::$key" -Name "(Default)" -ErrorAction SilentlyContinue).'(Default)'
                if ($installPath) {
                    $found = Find-PythonInDir $installPath
                    if ($found) { Write-Host "    注册表找到: $found" -ForegroundColor Gray; return $found }
                }
            } catch {}
        }
    }
    # 2) 搜索磁盘常见位置
    $paths = @(
        "$env:LOCALAPPDATA\Programs\Python\Python313",
        "$env:LOCALAPPDATA\Programs\Python\Python312",
        "$env:LOCALAPPDATA\Programs\Python\Python311",
        "$env:LOCALAPPDATA\Programs\Python\Python310",
        "C:\Python313", "C:\Python312", "C:\Python311", "C:\Python310",
        "C:\Program Files\Python313", "C:\Program Files\Python312",
        "C:\Program Files\Python311", "C:\Program Files\Python310",
        "$env:APPDATA\Python\Python312", "$env:APPDATA\Python\Python311"
    )
    foreach ($p in $paths) {
        $found = Find-PythonInDir $p
        if ($found) { Write-Host "    磁盘找到: $found" -ForegroundColor Gray; return $found }
    }
    return $null
}

# 测试 Python 命令是否真正可用（排除 MS Store 存根）
function Test-PythonReal($cmd) {
    try {
        $out = & $cmd -c "import sys; print(sys.executable)" 2>&1 | Out-String
        if ($LASTEXITCODE -eq 0 -and $out -match 'python') { return $true }
    } catch {}
    return $false
}

# 先尝试 PATH 中的命令（python 优先，python3 通常是 Store 存根）
if (Test-Command python -and (Test-PythonReal "python")) {
    $pythonCmd = "python"
} elseif (Test-Command python3 -and (Test-PythonReal "python3")) {
    $pythonCmd = "python3"
} else {
    # PATH 中有存根但不可用，跳过
    if (Test-Command python -or Test-Command python3) {
        Write-Host "    PATH 中有 python/python3 但无法执行（可能是 MS Store 存根），已跳过" -ForegroundColor Gray
    }
}

# PATH 中没找到可用的，搜索注册表/磁盘
if (-not $pythonCmd) {
    $foundExe = Find-PythonInstall
    if ($foundExe) {
        $foundDir = Split-Path -Parent $foundExe
        $foundDirScripts = Join-Path $foundDir "Scripts"
        $env:Path = "$foundDir;$foundDirScripts;$env:Path"
        Write-Host "    找到 Python: $foundExe (已临时加入 PATH)" -ForegroundColor Gray
        $pythonCmd = "python"
        # 验证找到的也是真 Python
        if (-not (Test-PythonReal $foundExe)) {
            Write-Warn "找到的 Python 无法执行: $foundExe"
            $pythonCmd = $null
        }
    }
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
    Write-Host "    下载并安装 Python 3.12.9..." -ForegroundColor Gray
    $pyInstaller = Join-Path $env:TEMP "python-3.12.9-amd64.exe"
    $pyUrl = "https://www.python.org/ftp/python/3.12.9/python-3.12.9-amd64.exe"

    try {
        Write-Host "    下载 $pyUrl ..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $pyUrl -OutFile $pyInstaller -UseBasicParsing
        Write-Host "    安装中（/quiet PrependPath=1）..." -ForegroundColor Gray
        $installProc = Start-Process -FilePath $pyInstaller -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait -PassThru -NoNewWindow
        Remove-Item $pyInstaller -Force -ErrorAction SilentlyContinue

        if ($installProc.ExitCode -eq 0) {
            $needRefreshPath = $true
            Write-OK "Python 3.12.9 安装完成"
            $pythonCmd = "python"
            $pythonInstalled = $true
        } elseif ($installProc.ExitCode -eq 1638) {
            # 1638 = 此产品已安装。PATH 刷新后通过注册表/磁盘搜索定位
            Write-Host "    Python 已安装但未在 PATH 中, PATH 刷新后自动定位" -ForegroundColor Gray
            $needRefreshPath = $true
        } else {
            Write-Fail "Python 安装器返回错误码 $($installProc.ExitCode)"
            Write-Warn "Python 仅用于多平台发布服务，后端+前端仍可正常运行"
            Write-Warn "请手动安装: https://www.python.org/downloads/ (勾选 Add Python to PATH)"
            $pythonCmd = $null
        }
    } catch {
        Write-Fail "Python 下载失败: $_"
        Write-Warn "请手动安装: https://www.python.org/downloads/ (勾选 Add Python to PATH)"
        Write-Warn "Python 仅用于多平台发布服务，后端+前端仍可正常运行"
        $pythonCmd = $null
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
    if (-not (Test-Command npm)) {
        Write-Warn "npm 命令仍不可用，请关闭此窗口重新运行 setup.bat"
        pause
        exit 1
    }
    if (-not $pythonCmd -or -not (Test-Command $pythonCmd)) {
        # PATH 刷新后重新探测（跳过 MS Store 存根）
        if (Test-Command python -and (Test-PythonReal "python")) {
            $pythonCmd = "python"
        } elseif (Test-Command python3 -and (Test-PythonReal "python3")) {
            $pythonCmd = "python3"
        } else {
            $foundExe = Find-PythonInstall
            if ($foundExe) {
                $foundDir = Split-Path -Parent $foundExe
                $foundDirScripts = Join-Path $foundDir "Scripts"
                $env:Path = "$foundDir;$foundDirScripts;$env:Path"
                Write-Host "    找到 Python: $foundExe (已临时加入 PATH)" -ForegroundColor Gray
                $pythonCmd = "python"
            }
        }
    }
    if ($pythonCmd) {
        $pyVersion = & $pythonCmd --version 2>&1 | Out-String
        Write-Host "    Python: $($pyVersion.Trim())" -ForegroundColor Gray
    }
}

# 最终校验：node 和 npm 都必须可用（无论是否刷新过 PATH）
if (-not (Test-Command node) -or -not (Test-Command npm)) {
    Write-Fail "Node.js / npm 不可用，无法继续"
    if (-not (Test-Command node)) { Write-Warn "node 命令未找到" }
    if (-not (Test-Command npm))  { Write-Warn "npm 命令未找到" }
    Write-Warn "请手动安装 Node.js: https://nodejs.org/"
    pause
    exit 1
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
    Write-Fail "未找到 $backendDir\package.json"
    Write-Warn "请确认: 1) 项目文件已完整复制  2) setup.bat 放在项目根目录运行"
    Write-Warn "当前脚本路径: $ProjectRoot"
    Write-Warn "预期结构: $ProjectRoot\backend\package.json"
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
    Write-Fail "未找到 $frontendDir\package.json"
    exit 1
}

# ============================================================
# 步骤 6: 安装 OpenClaw Gateway
# ============================================================
Write-Step "安装 OpenClaw Gateway (技能市场/Agent 运行时)"

$ocVersion = "2026.6.6"
$ocInstalled = $false

if (Test-Command openclaw) {
    $currentOc = openclaw --version 2>&1
    if ($currentOc -match $ocVersion) {
        Write-OK "OpenClaw $ocVersion 已安装"
        $ocInstalled = $true
    } else {
        Write-Host "    当前: $currentOc，将安装 $ocVersion" -ForegroundColor Gray
    }
}

if (-not $ocInstalled) {
    Write-Host "    安装 openclaw@$ocVersion ..." -ForegroundColor Gray
    $ocInstallOutput = npm install -g openclaw@$ocVersion 2>&1
    if ($LASTEXITCODE -eq 0) {
        Refresh-Path
        if (Test-Command openclaw) {
            Write-OK "OpenClaw $ocVersion 安装完成"
        } else {
            Write-Warn "OpenClaw 安装完成但命令不可用，可能需要重新打开终端"
            Write-Warn "技能市场/OpenClaw Agent 功能将不可用"
        }
    } else {
        Write-Fail "OpenClaw 安装失败"
        Write-Host $ocInstallOutput -ForegroundColor Red
        Write-Warn "技能市场/OpenClaw Agent 功能将不可用，后端+前端仍可正常运行"
    }
}

# 初始化 OpenClaw 配置（设备身份 + 网关配置）
if (Test-Command openclaw) {
    $ocDir = Join-Path $env:USERPROFILE ".openclaw"
    $ocConfigFile = Join-Path $ocDir "openclaw.json"
    $ocIdentityFile = Join-Path (Join-Path $ocDir "identity") "device.json"

    if (-not (Test-Path $ocConfigFile) -or -not (Test-Path $ocIdentityFile)) {
        Write-Host "    初始化 OpenClaw (setup --mode local)..." -ForegroundColor Gray
        $setupOutput = openclaw setup --accept-risk --non-interactive --mode local 2>&1
        if ($LASTEXITCODE -eq 0 -and (Test-Path $ocIdentityFile)) {
            Write-OK "OpenClaw 设备身份已生成"
        } else {
            Write-Fail "OpenClaw 初始化失败"
            Write-Host $setupOutput -ForegroundColor Red
        }
    }

    # 确保网关配置正确（端口 18622 + token 鉴权）
    if (Test-Path $ocConfigFile) {
        try {
            $ocJson = Get-Content $ocConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
            $needsWrite = $false

            if (-not ($ocJson.PSObject.Properties.Name -contains 'gateway')) {
                Add-Member -InputObject $ocJson -NotePropertyName 'gateway' -NotePropertyValue ([PSCustomObject]@{}) -Force
                $needsWrite = $true
            }
            $gw = $ocJson.gateway

            if (-not ($gw.PSObject.Properties.Name -contains 'mode') -or $gw.mode -ne 'local') {
                Add-Member -InputObject $gw -NotePropertyName 'mode' -NotePropertyValue 'local' -Force
                $needsWrite = $true
            }
            if (-not ($gw.PSObject.Properties.Name -contains 'port') -or $gw.port -ne 18622) {
                Add-Member -InputObject $gw -NotePropertyName 'port' -NotePropertyValue 18622 -Force
                $needsWrite = $true
            }
            if (-not ($gw.PSObject.Properties.Name -contains 'bind') -or $gw.bind -ne 'loopback') {
                Add-Member -InputObject $gw -NotePropertyName 'bind' -NotePropertyValue 'loopback' -Force
                $needsWrite = $true
            }
            if (-not ($gw.PSObject.Properties.Name -contains 'auth') -or
                -not ($gw.auth.PSObject.Properties.Name -contains 'mode')) {
                $authObj = [PSCustomObject]@{ mode = 'token'; token = (-join ((1..40) | ForEach { '{0:x}' -f (Get-Random -Max 16) })) }
                Add-Member -InputObject $gw -NotePropertyName 'auth' -NotePropertyValue $authObj -Force
                $needsWrite = $true
            }

            if ($needsWrite) {
                $ocJson | ConvertTo-Json -Depth 8 | Out-File -FilePath $ocConfigFile -Encoding UTF8 -Force
                Write-OK "OpenClaw 网关配置已更新 (端口: 18622)"
            } else {
                Write-OK "OpenClaw 网关配置已就绪"
            }
        } catch {
            Write-Warn "OpenClaw 配置更新失败: $_"
            Write-Warn "技能市场可能不可用，请运行 openclaw doctor --fix 修复"
        }
    }
}

$ocReady = (Test-Path $ocConfigFile) -and (Test-Path $ocIdentityFile)

# ============================================================
# 步骤 7: 安装 Python 发布服务依赖
# ============================================================
Write-Step "安装 Python 发布服务依赖 (backend/auto_douyin/)"

$pythonDir = Join-Path $ProjectRoot "backend\auto_douyin"
if (-not $pythonCmd) {
    Write-Warn "Python 未安装，跳过此步骤（后端+前端仍可正常运行）"
} elseif (Test-Path (Join-Path $pythonDir "main.py")) {
    # 先验证 Python 可用
    $pyTest = & $pythonCmd -c "import sys; print(sys.version)" 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Python 命令不可用: $pyTest"
        Write-Warn "可能是 Microsoft Store 版 Python 存根, 请安装官方版: https://www.python.org/downloads/"
    } else {
        $pyVersionLine = ($pyTest -split "`n")[0].Trim()
        Write-Host "    Python: $pyVersionLine" -ForegroundColor Gray

        # 升级 pip
        Write-Host "    升级 pip..." -ForegroundColor Gray
        $pipUpgrade = & $pythonCmd -m pip install --upgrade pip 2>&1 | Out-String
        $pipUpExit = $LASTEXITCODE

        # 安装依赖
        Write-Host "    安装 Python 包 (fastapi uvicorn playwright pydantic loguru aiofiles biliup mcp)..." -ForegroundColor Gray
        $pipArgs = @("-m", "pip", "install", "fastapi", "uvicorn[standard]", "playwright", "pydantic", "loguru", "python-dotenv", "aiofiles", "biliup", "mcp")
        $pipOutput = & $pythonCmd @pipArgs 2>&1 | Out-String
        $pipExit = $LASTEXITCODE

        if ($pipExit -eq 0) {
            Write-OK "Python 依赖安装完成"
        } else {
            # 重试：加 --user 和 --trusted-host（兼容 SSL/权限问题）
            Write-Host "    首次失败，重试 --user --trusted-host ..." -ForegroundColor Gray
            $pipArgs2 = @("-m", "pip", "install", "--user", "--trusted-host", "pypi.org", "--trusted-host", "files.pythonhosted.org", "fastapi", "uvicorn[standard]", "playwright", "pydantic", "loguru", "python-dotenv", "aiofiles", "biliup", "mcp")
            $pipOutput2 = & $pythonCmd @pipArgs2 2>&1 | Out-String
            $pipExit2 = $LASTEXITCODE

            if ($pipExit2 -eq 0) {
                Write-OK "Python 依赖安装完成（--user）"
            } else {
                Write-Fail "Python 依赖安装失败"
                Write-Host ("    " + ($pipOutput2 -split "`n" | Select-Object -Last 8 -ErrorAction SilentlyContinue)) -ForegroundColor Red
                Write-Warn "请手动执行: $pythonCmd -m pip install fastapi uvicorn playwright pydantic loguru aiofiles biliup mcp"
            }
        }
    }
} else {
    Write-Warn "未找到 backend/auto_douyin/main.py，跳过 Python 依赖"
    Write-Warn "如需多平台发布功能，请确保项目文件完整"
}

# ============================================================
# 步骤 8: 安装 Playwright 浏览器（Node.js 侧）
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
# 步骤 9: 安装 Playwright 浏览器（Python 侧）
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
# 步骤 10: 构建前端
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
# 步骤 11: 检查 .env 配置
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
# 步骤 12: 端口检测
# ============================================================
Write-Step "端口可用性检测"

$ports = @(18621, 18622, 8000)
$portsAllFree = $true

foreach ($port in $ports) {
    $listener = netstat -ano 2>$null | Select-String ":$port "
    if ($listener) {
        $pid = ($listener -split '\s+')[-1]
        Write-Warn "端口 $port 已被占用 (PID: $pid)"
        $label = @{18621="后端 API"; 18622="OpenClaw 网关"; 8000="多平台发布"}[$port]
        Write-Warn "请先关闭占用 $label 端口 ($port) 的程序，或修改配置"
        $portsAllFree = $false
    } else {
        Write-OK "端口 $port 空闲"
    }
}

# ============================================================
# 步骤 13: 启动验证
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
$pythonOK = $pythonCmd -and (Test-PythonReal $pythonCmd)
$ocOK = Test-Command openclaw
$backendNM = Test-Path (Join-Path $backendDir "node_modules")
$frontendNM = Test-Path (Join-Path $frontendDir "node_modules")
$frontendDist = Test-Path (Join-Path $frontendDir "dist")
$envOK = Test-Path $envFile

Write-Host ("  Node.js          : " + $(if ($nodeOK) { "✔" } else { "✘" })) -ForegroundColor $(if ($nodeOK) { "Green" } else { "Red" })
Write-Host ("  Python           : " + $(if ($pythonOK) { "✔" } else { "✘" })) -ForegroundColor $(if ($pythonOK) { "Green" } else { "Red" })
Write-Host ("  OpenClaw         : " + $(if ($ocOK) { "✔" } else { "✘" })) -ForegroundColor $(if ($ocOK) { "Green" } else { "Red" })
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

if (-not $ocOK) {
    Write-Host ""
    Write-Warn "OpenClaw 未安装，技能市场和 OpenClaw Agent 功能将不可用"
    Write-Warn "如需此功能，请确保 npm 可用后运行: npm install -g openclaw@2026.6.6 && openclaw setup --accept-risk --non-interactive --mode local"
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
