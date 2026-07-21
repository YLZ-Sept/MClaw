// Channel Message Renderer — 参考 mateclaw ChannelMessageRenderer
// 过滤 + 切分 + 净化，确保渠道消息干净可读
const PLATFORM_LIMITS = {
  wecom: 2048,
  feishu: 30000,    // 飞书支持长消息
  wechat: 2048,
  dingtalk: 2048,
  telegram: 4096,
  discord: 2000,
  slack: 40000,     // Slack Block Kit 支持长内容
  qq: 2000,
  webchat: 10000,
  webhook: 10000,
  default: 2048,
};

/**
 * 渲染消息（过滤 + 切分）
 * @param {string} content — 原始 AI 回复
 * @param {object} options — { filterThinking, filterToolMessages, maxLen, platform }
 * @returns {string[]} — 切分后的消息片段数组
 */
function render(content, options = {}) {
  if (!content) return [''];

  const {
    filterThinking = true,
    filterToolMessages = true,
    platform = 'default',
  } = options;

  const maxLen = options.maxLen || PLATFORM_LIMITS[platform] || PLATFORM_LIMITS.default;
  let text = content;

  // 过滤 thinking 块
  if (filterThinking) {
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    text = text.replace(/【思考】[\s\S]*?【\/思考】/g, '');
    text = text.replace(/\[思考中\][\s\S]*?\[\/思考中\]/g, '');
  }

  // 过滤 tool_call 噪声
  if (filterToolMessages) {
    // 移除 JSON tool_call 块
    text = text.replace(/\n*\{[^{}]*"tool_calls"[^}]*\}\n*/g, '');
    // 移除 tool 执行日志
    text = text.replace(/\n*\[tool\][^\n]*\n*/g, '');
    text = text.replace(/\n*\[executor\][^\n]*\n*/g, '');
    // 移除审批提示中的技术细节
    text = text.replace(/\n*审批ID: [^\n]*\n*/g, '');
  }

  // 净化多余空行
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // 长度切分
  if (text.length <= maxLen) return [text];

  const parts = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    // 在 maxLen 附近找最近的换行或句号切分
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt === -1 || splitAt < maxLen * 0.5) {
      splitAt = remaining.lastIndexOf('。', maxLen);
    }
    if (splitAt === -1 || splitAt < maxLen * 0.5) {
      splitAt = remaining.lastIndexOf(' ', maxLen);
    }
    if (splitAt === -1 || splitAt < maxLen * 0.5) {
      splitAt = maxLen;
    }
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  return parts;
}

/**
 * 带平台标记的渲染
 */
function renderForChannel(content, channelType) {
  return render(content, { platform: channelType });
}

module.exports = { render, renderForChannel, PLATFORM_LIMITS };
