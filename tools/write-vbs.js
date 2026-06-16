// 写入 GBK 编码的 VBS 文件
const fs = require('fs');
const iconv = require('iconv-lite');

function writeVbs(filePath, content) {
  const gbk = iconv.encode(content, 'gbk');
  fs.writeFileSync(filePath, gbk);
}

const stopContent = [
  'Set shell = CreateObject("WScript.Shell")',
  '',
  'shell.Run "cmd /c taskkill /F /IM node.exe >nul 2>&1", 0, True',
  'shell.Run "cmd /c taskkill /F /IM python.exe >nul 2>&1", 0, True',
  'shell.Run "cmd /c taskkill /F /IM openclaw.exe >nul 2>&1", 0, True',
  '',
  'MsgBox "所有服务已停止 (MClaw + OpenClaw + Publisher)", 64, "MClaw"',
  ''
].join('\r\n');

writeVbs('E:/CC/MClaw/stop-hidden.vbs', stopContent);
console.log('stop-hidden.vbs written');
