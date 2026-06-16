Set shell = CreateObject("WScript.Shell")

shell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True
shell.Run "cmd /c taskkill /F /IM python.exe >nul 2>&1", 0, True
shell.Run "cmd /c taskkill /F /IM openclaw.exe >nul 2>&1", 0, True

MsgBox "所有服务已停止 (MClaw + OpenClaw + Publisher)", 64, "MClaw"
