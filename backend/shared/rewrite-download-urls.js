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

// workspace 文件/目录路径 → MClaw 下载 URL
// 策略：反斜杠统一转正斜杠，用正则匹配 .openclaw/workspace(可选的/FILENAME)
//       然后往前找路径开头，整体替换为下载链接
function rewriteWorkspacePaths(text) {
  var norm = text.replace(/\\/g, '/');

  // 匹配 .openclaw/workspace 或 /.openclaw/workspace/FILENAME（可带前缀 /）
  var WS_RE = /\/?\.openclaw\/workspace(\/([^\s"'<>)]+))?/gi;

  // 先收集匹配位置（避免后续替换干扰索引）
  var matches = [];
  var m;
  while ((m = WS_RE.exec(norm)) !== null) {
    var filename = m[2] || null;
    var wsStart = m.index;
    var wsEnd = wsStart + m[0].length;

    // 往前找路径开始：遇到空格/引号/换行或中英文标点即停止
    var pathStart = wsStart;
    while (pathStart > 0) {
      var ch = norm[pathStart - 1];
      // 停止条件：ASCII 控制字符、空格、引号、括号、中英文标点
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t' ||
          ch === '"' || ch === "'" || ch === '<' || ch === '>' ||
          ch === '(' || ch === ')' || ch === '[' || ch === ']' ||
          ch === '：' || ch === '：' || ch === '，' || ch === '。' ||
          ch === '！' || ch === '？' || ch === '、' || ch === '；' ||
          ch === '《' || ch === '》' || ch === '“' || ch === '”') {
        break;
      }
      pathStart--;
    }

    matches.push({ start: pathStart, end: wsEnd, filename: filename });
  }

  // 从后往前替换
  matches.sort(function(a, b) { return b.start - a.start; });
  var result = text;
  for (var i = 0; i < matches.length; i++) {
    var r = matches[i];
    var replacement;
    if (r.filename) {
      replacement = '/api/download/openclaw/' + r.filename;
    } else {
      replacement = '(OpenClaw workspace 目录)';
    }
    result = result.slice(0, r.start) + replacement + result.slice(r.end);
  }

  return result;
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
