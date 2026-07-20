const { rewriteDownloadUrls } = require('./shared/rewrite-download-urls');

var p = 0, f = 0;
function t(n, i, e) {
  var r = rewriteDownloadUrls(i);
  if (r === e) { p++; console.log('OK', n); }
  else { f++; console.log('FAIL', n, '\n  exp:', JSON.stringify(e), '\n  got:', JSON.stringify(r)); }
}

// 文件路径
var wp = String.raw`C:\Users\Mr-Yang\.openclaw\workspace\供应商名录.xlsx`;
t('Win文件', wp, '/api/download/openclaw/供应商名录.xlsx');

// 目录路径（无文件名）
var wd = String.raw`C:\Users\Mr-Yang\.openclaw\workspace`;
t('Win目录', wd, '(OpenClaw workspace 目录)');

var wd2 = String.raw`%USERPROFILE%\.openclaw\workspace`;
t('USERPROFILE目录', wd2, '(OpenClaw workspace 目录)');

// Linux
t('Linux文件', '/root/.openclaw/workspace/data.xlsx', '/api/download/openclaw/data.xlsx');
t('Linux目录', '/root/.openclaw/workspace', '(OpenClaw workspace 目录)');

// URL
t('canvas', 'http://localhost:18622/__openclaw__/canvas/test.html', '/api/openclaw-proxy/__openclaw__/canvas/test.html');
t('7071', 'http://localhost:7071/api/download/openclaw/r.xlsx', '/api/download/openclaw/r.xlsx');

// 混合场景
var mix = String.raw`打开文件资源管理器
在地址栏粘贴：C:\Users\Mr-Yang\.openclaw\workspace
找到 供应商名录.xlsx 文件`;
var emix = '打开文件资源管理器\n在地址栏粘贴：(OpenClaw workspace 目录)\n找到 供应商名录.xlsx 文件';
t('混合场景', mix, emix);

// 真实LLM回复
var real = String.raw`按键盘 Win + R 打开运行窗口
输入：%USERPROFILE%\.openclaw\workspace
回车打开文件夹，就能看到 供应商名录.xlsx`;
var ereal = '按键盘 Win + R 打开运行窗口\n输入：(OpenClaw workspace 目录)\n回车打开文件夹，就能看到 供应商名录.xlsx';
t('Win+R场景', real, ereal);

console.log('\nPassed:', p, 'Failed:', f);
