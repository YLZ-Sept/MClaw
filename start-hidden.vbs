On Error Resume Next

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
q = Chr(34)

shell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True
shell.Run "cmd /c taskkill /F /IM python.exe >nul 2>&1", 0, True
shell.Run "cmd /c taskkill /F /IM openclaw.exe >nul 2>&1", 0, True

' AI引擎由后端 auto-start，不再手动启动

shell.Run "cmd /c cd /d " & q & dir & "\backend" & q & " && node server.js >> " & q & dir & "\backend\server.log" & q & " 2>&1", 0, False

For i = 1 To 20
    WScript.Sleep 1000
    shell.Run "cmd /c curl -s -o nul http://localhost:18621/api/status 2>nul", 0, True
    If Err.Number = 0 Then Exit For
Next

If fso.FolderExists(dir & "\backend\auto_douyin") Then
    shell.Run "cmd /c cd /d " & q & dir & "\backend\auto_douyin" & q & " && python main.py >> " & q & dir & "\backend\auto_douyin\server.log" & q & " 2>&1", 0, False
End If

WScript.Sleep 500
shell.Run "http://localhost:18621"
