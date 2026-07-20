/**
 * 通用下载 URL 重写
 *
 * 问题：OpenClaw 技能 / LLM 生成的下载链接可能包含绝对 localhost 地址，
 * 远程用户（通过 http://115.159.191.117 或 http://192.168.101.148 访问）
 * 点击这些链接时，浏览器会访问自己电脑的 localhost，文件不存在。
 *
 * 解决：所有 localhost 变体的绝对下载 URL 统一替换为相对路径。
 */

// 匹配 localhost/127.0.0.1/[::1] 上的绝对下载 URL
// filename 段：[^/\s"'<>)]+ 覆盖中英文、URL编码等任意合法文件名字符
const ABS_DOWNLOAD_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?\/api\/download\/(openclaw\/[^/\s"'<>)]+|[a-z]+\/[^/\s"'<>)]+)/gi;

/**
 * 将文本中所有 localhost 绝对下载 URL 替换为相对路径
 *
 * 规则：
 *   http://localhost:7071/api/download/openclaw/xxx → /api/download/openclaw/xxx
 *   http://127.0.0.1:7071/api/download/openclaw/xxx → /api/download/openclaw/xxx
 *   http://localhost:18621/api/download/excel/xxx   → /api/download/excel/xxx
 *   http://127.0.0.1:18621/api/download/ppt/xxx     → /api/download/ppt/xxx
 *
 *   xxx 支持中英文、数字、URL编码（%20）等任意合法文件名字符
 *
 * @param {string} text - 原始文本
 * @returns {string} 替换后的文本
 */
function rewriteDownloadUrls(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(ABS_DOWNLOAD_RE, (match, path) => {
    // 无论原端口是什么，都转为相对路径
    return `/api/download/${path}`;
  });
}

module.exports = { rewriteDownloadUrls };
