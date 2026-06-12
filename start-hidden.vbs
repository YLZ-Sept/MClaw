On Error Resume Next

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
q = Chr(34)

' 启动后端 :18621
shell.Run "cmd /c cd /d " & q & dir & "\backend" & q & " && node server.js >> " & q & dir & "\backend\server.log" & q & " 2>&1", 0, False

' 启动多平台发布 :8001
shell.Run "cmd /c cd /d " & q & dir & "\backend\auto_douyin" & q & " && python main.py >> " & q & dir & "\backend\auto_douyin\server.log" & q & " 2>&1", 0, False

WScript.Sleep 1500
shell.Run "http://localhost:18621"

If Err.Number <> 0 Then
    MsgBox "Start failed: " & Err.Description, 48, "MClaw"
End If
