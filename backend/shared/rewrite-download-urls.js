/**
 * 通用下载 URL 重写 + 文件路径转换
 *
 * 问题：OpenClaw 技能 / LLM 生成的文件引用包含 localhost 绝对地址或服务器本地路径，
 * 远程用户（通过 http://115.159.191.117 或 http://192.168.101.148 访问）
 * 点击/复制后无法访问。
 *
 * 解决：
 *   1. localhost 绝对 URL → MClaw 相对路径（通过代理路由访问）
 *   2. 服务器本地 workspace 文件路径 → MClaw 下载 URL
 */

// localhost 绝对 URL 重写
var LOCALHOST_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?(\/[^\s"'<>]*)/gi;

function rewriteLocalhostUrl(match, port, urlPath) {
  if (/^\/api\/download\//.test(urlPath)) {
    return urlPath;
  }
  if (port === '18622') {
    return '/api/openclaw-proxy' + urlPath;
  }
  if (port === '7071' && /^\/api\/download\//.test(urlPath)) {
    return '/api/download/openclaw/' + urlPath.replace(/^\/api\/download\//, '');
  }
  if (port === '18621') {
    return urlPath;
  }
  return urlPath;
}

// workspace 文件路径 → 下载 URL
// 策略：反斜杠统一转正斜杠，用正则匹配 .openclaw/workspace/FILENAME，
//       然后往前找路径开头，整体替换
function rewriteWorkspacePaths(text) {
  var norm = text.replace(/\\/g, '/');

  // 匹配 .openclaw/workspace/FILENAME（仅捕获文件名）
  var WS_RE = /\.openclaw\/workspace\/([^\s"'<>)]+)/gi;
  var m;

  // 收集所有需要替换的位置（从后往前替换避免索引偏移）
  var replacements = [];
  while ((m = WS_RE.exec(norm)) !== null) {
    var filename = m[1];
    var wsStart = m.index;           // .openclaw/workspace/... 的起始位置
    var wsEnd = wsStart + m[0].length; // ...的结束位置

    // 往前找到路径的开始（空格、引号、换行、行首等）
    var pathStart = wsStart;
    while (pathStart > 0) {
      var ch = norm[pathStart - 1];
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '"' || ch === "'" || ch === '<' || ch === '>' || ch === '(') {
        break;
      }
      pathStart--;
    }

    replacements.push({
      start: pathStart,
      end: wsEnd,
      replacement: '/api/download/openclaw/' + filename
    });
  }

  // 从后往前替换（避免索引偏移）
  replacements.sort(function(a, b) { return b.start - a.start; });
  for (var i = 0; i < replacements.length; i++) {
    var r = replacements[i];
    text = text.slice(0, r.start) + r.replacement + text.slice(r.end);
  }

  return text;
}

function rewriteDownloadUrls(text) {
  if (!text || typeof text !== 'string') return text;

  // Step 1: 重写 localhost 绝对 URL
  text = text.replace(LOCALHOST_RE, rewriteLocalhostUrl);

  // Step 2: 替换 workspace 文件路径 → 下载 URL
  text = rewriteWorkspacePaths(text);

  return text;
}

module.exports = { rewriteDownloadUrls };
