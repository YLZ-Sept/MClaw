/**
 * 渠道字段定义 & 配置构建工具
 * 对应 mateclaw CHANNEL_FIELD_DEFS / buildConfigJson 模式
 */

/**
 * 每个渠道类型对应的字段定义
 * key: 配置键名
 * label: 中文标签
 * required: 是否必填
 * sensitive: 是否密码字段（输入框默认隐藏）
 * placeholder: 占位提示
 * tooltip: 字段说明
 */
export const CHANNEL_FIELD_DEFS = {
  telegram: [
    { key: 'bot_token', label: 'Bot Token', required: true, sensitive: true, placeholder: '123456:ABC-DEF1234ghikl...', tooltip: '从 @BotFather 获取' },
  ],
  discord: [
    { key: 'bot_token', label: 'Bot Token', required: true, sensitive: true, placeholder: 'MTIzNDU2...', tooltip: 'Discord Developer Portal → Bot → Token' },
  ],
  slack: [
    { key: 'bot_token', label: 'Bot Token', required: true, sensitive: true, placeholder: 'xoxb-...', tooltip: 'Slack App → OAuth & Permissions → Bot User OAuth Token' },
    { key: 'app_token', label: 'App Token (可选)', required: false, sensitive: true, placeholder: 'xapp-...', tooltip: 'Socket Mode 需要' },
  ],
  qq: [
    { key: 'app_id', label: 'App ID', required: true, placeholder: '1020xxxxx' },
    { key: 'client_secret', label: 'Client Secret', required: true, sensitive: true, placeholder: 'xxxxx', tooltip: 'QQ 开放平台 → 应用管理 → 密钥' },
  ],
  wecom: [],  // WeCom 在向导中有独立模板，不走通用字段渲染
  weixin: [
    { key: 'token', label: 'Bot Token', required: true, sensitive: true, placeholder: '扫码登录自动填入', tooltip: '通过微信扫码登录获取，用于 iLink API 认证' },
    { key: 'base_url', label: 'Base URL（可选）', required: false, placeholder: '扫码登录自动填入' },
  ],
  feishu: [
    { key: 'app_id', label: 'App ID', required: true, placeholder: 'cli_...' },
    { key: 'app_secret', label: 'App Secret', required: true, sensitive: true, placeholder: '飞书应用凭证', tooltip: '飞书开放平台 → 应用 → 凭证与基础信息' },
  ],
  dingtalk: [
    { key: 'client_id', label: 'Client ID (AppKey)', required: true, placeholder: 'ding...' },
    { key: 'client_secret', label: 'Client Secret (AppSecret)', required: true, sensitive: true, placeholder: '钉钉应用密钥', tooltip: '钉钉开放平台 → 应用 → 凭证信息' },
  ],
  web: [],
  webchat: [],
  webhook: [
    { key: 'secret', label: '签名密钥 (可选)', required: false, sensitive: true, placeholder: 'Webhook 验签用', tooltip: '用于验证 Webhook 请求来源' },
  ],
}

/**
 * 各渠道类型的 how-to 指南步骤
 */
export const CHANNEL_GUIDES = {
  telegram: [
    '在 Telegram 搜索 <b>@BotFather</b> 并发送 <code>/newbot</code>',
    '按提示设置 Bot 名称和用户名',
    '获取 <b>Bot Token</b>（格式: <code>123456:ABC-DEF...</code>）',
    '将 Token 粘贴到上方输入框中',
  ],
  discord: [
    '打开 <a href="https://discord.com/developers/applications" target="_blank">Discord Developer Portal</a>',
    '创建 New Application → Bot → Add Bot',
    '在 Bot 页面点击 <b>Reset Token</b> 获取 Token',
    '开启 <b>Message Content Intent</b>（Privileged Gateway Intents）',
    '使用 OAuth2 URL Generator 将 Bot 邀请到服务器（勾选 bot + Send Messages 权限）',
  ],
  qq: [
    '打开 <a href="https://q.qq.com/" target="_blank">QQ 开放平台</a> 创建应用',
    '进入应用管理 → 开发设置 → 获取 <b>AppID</b> 和 <b>Client Secret</b>',
    '配置消息回调地址（你的服务器地址 + /api/channels/qq）',
    '点击 [扫码绑定] 或粘贴凭证后保存',
  ],
  wecom: [
    '登录 <a href="https://work.weixin.qq.com/" target="_blank">企业微信管理后台</a>',
    '进入「应用管理」→ 自建应用 → 获取 <b>Corp ID</b>',
    '在「接收消息」中设置回调 URL（你的服务器地址 + /api/channels/wecom）',
    '随机生成 <b>Token</b> 和 <b>Encoding AES Key</b> 填入上方',
  ],
  feishu: [
    '打开 <a href="https://open.feishu.cn/" target="_blank">飞书开放平台</a> 创建企业自建应用',
    '进入「凭证与基础信息」获取 <b>App ID</b> 和 <b>App Secret</b>',
    '在「事件订阅」中配置回调地址并添加事件',
    '发布应用并获取管理员审批',
  ],
  dingtalk: [
    '打开 <a href="https://open.dingtalk.com/" target="_blank">钉钉开放平台</a> 创建应用',
    '进入「凭证与基础信息」获取 <b>AppKey</b>（Client ID）和 <b>AppSecret</b>（Client Secret）',
    '配置消息接收地址和事件订阅',
    '发布应用并安装到企业',
  ],
}

/**
 * 构建 configJson 字符串
 * @param {string} channelType - 渠道类型
 * @param {object} channelConfig - 渠道配置键值对
 * @returns {string} JSON 字符串
 */
export function buildConfigJson(channelType, channelConfig) {
  const fields = CHANNEL_FIELD_DEFS[channelType] || []
  const cfg = {}

  // 渠道特有字段
  for (const f of fields) {
    const val = channelConfig[f.key]
    if (val !== undefined && val !== '' && val !== null) {
      cfg[f.key] = val
    }
  }

  return JSON.stringify(cfg, null, 2)
}

/**
 * 从 configJson 解析出字段值
 */
export function extractChannelFields(cfgJson, channelType) {
  let cfg = {}
  if (cfgJson) {
    try { cfg = JSON.parse(cfgJson) } catch {}
  }
  const fields = CHANNEL_FIELD_DEFS[channelType] || []
  const result = {}
  for (const f of fields) {
    result[f.key] = cfg[f.key] !== undefined ? cfg[f.key] : ''
  }
  return result
}
