Set shell = CreateObject("WScript.Shell")
shell.Run "taskkill /F /IM node.exe", 0, True
shell.Run "taskkill /F /IM python.exe", 0, True
