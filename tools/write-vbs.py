"""Write VBS files with correct GBK encoding"""
import os

root = r'E:\CC\MClaw'

# stop-hidden.vbs
stop_content = '\r\n'.join([
    'Set shell = CreateObject("WScript.Shell")',
    '',
    'shell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True',
    'shell.Run "cmd /c taskkill /F /IM python.exe >nul 2>&1", 0, True',
    'shell.Run "cmd /c taskkill /F /IM openclaw.exe >nul 2>&1", 0, True',
    '',
    'MsgBox "所有服务已停止 (MClaw + OpenClaw + Publisher)", 64, "MClaw"',
    ''
])

# start-hidden.vbs
start_content = '\r\n'.join([
    'On Error Resume Next',
    '',
    'Set shell = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'dir = fso.GetParentFolderName(WScript.ScriptFullName)',
    'q = Chr(34)',
    '',
    'shell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True',
    'shell.Run "cmd /c taskkill /F /IM python.exe >nul 2>&1", 0, True',
    'shell.Run "cmd /c taskkill /F /IM openclaw.exe >nul 2>&1", 0, True',
    '',
    'shell.Run "cmd /c where openclaw >nul 2>&1", 0, True',
    'If Err.Number = 0 Then',
    '    shell.Run "cmd /c openclaw gateway run >> " & q & dir & "\\backend\\openclaw.log" & q & " 2>&1", 0, False',
    '    For i = 1 To 12',
    '        WScript.Sleep 1000',
    '        shell.Run "cmd /c curl -s -o nul http://localhost:18622/health 2>nul", 0, True',
    '        If Err.Number = 0 Then Exit For',
    '    Next',
    'End If',
    'Err.Clear',
    '',
    'shell.Run "cmd /c cd /d " & q & dir & "\\backend" & q & " && node server.js >> " & q & dir & "\\backend\\server.log" & q & " 2>&1", 0, False',
    '',
    'For i = 1 To 20',
    '    WScript.Sleep 1000',
    '    shell.Run "cmd /c curl -s -o nul http://localhost:18621/api/status 2>nul", 0, True',
    '    If Err.Number = 0 Then Exit For',
    'Next',
    '',
    'If fso.FolderExists(dir & "\\backend\\auto_douyin") Then',
    '    shell.Run "cmd /c cd /d " & q & dir & "\\backend\\auto_douyin" & q & " && python main.py >> " & q & dir & "\\backend\\auto_douyin\\server.log" & q & " 2>&1", 0, False',
    'End If',
    '',
    'WScript.Sleep 500',
    'shell.Run "http://localhost:18621"',
    ''
])

for name, content in [('stop-hidden.vbs', stop_content), ('start-hidden.vbs', start_content)]:
    path = os.path.join(root, name)
    with open(path, 'w', encoding='gbk') as f:
        f.write(content)
    print(f'Written: {path}')

    # Verify
    with open(path, 'r', encoding='gbk') as f:
        verify = f.read()
    ok = True
    if 'nul' not in verify or '/dev/null' in verify:
        print('  FAIL: >nul was corrupted to >/dev/null')
        ok = False
    if name == 'stop-hidden.vbs' and '所有服务已停止' not in verify:
        print('  FAIL: Chinese characters garbled')
        ok = False
    if ok:
        print(f'  OK')
