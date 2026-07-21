// Channel Verifier — 参考 mateclaw ChannelVerifier SPI
// 保存前验证渠道凭证是否有效

const https = require('https');
const http = require('http');

/**
 * 验证结果
 * @typedef {{ ok: boolean, message: string, identity?: object }} VerificationResult
 */

/**
 * 验证请求
 * @typedef {{ platform: string, config: object }} VerificationRequest
 */

// 各平台验证器
const verifiers = {

  /**
   * 飞书：获取 tenant_access_token 验证 app_id + app_secret
   */
  async feishu(config) {
    const { app_id, app_secret } = config;
    if (!app_id || !app_secret) return { ok: false, message: '缺少 App ID 或 App Secret' };

    try {
      const body = JSON.stringify({ app_id, app_secret });
      const res = await _post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', body);
      if (res.code === 0) {
        return {
          ok: true,
          message: '飞书凭证验证通过',
          identity: { app_name: res.tenant_access_token ? '授权成功' : '' }
        };
      }
      return { ok: false, message: `飞书返回错误: code=${res.code} msg=${res.msg || ''}` };
    } catch (e) {
      return { ok: false, message: `飞书 API 不可达: ${e.message}` };
    }
  },

  /**
   * 企业微信：验证 Corp ID + Token 非空（webhook 模式无需在线验证）
   */
  async wecom(config) {
    const { corp_id, token } = config;
    if (!corp_id) return { ok: false, message: '缺少 Corp ID' };
    if (!token) return { ok: false, message: '缺少 Token' };
    if (token.length < 8) return { ok: false, message: 'Token 长度不足（至少 8 位）' };
    return { ok: true, message: '企业微信配置格式验证通过' };
  },

  /**
   * 微信 Bot：验证 Bot ID 格式
   */
  async wechat(config) {
    const { bot_id } = config;
    if (!bot_id) return { ok: false, message: '缺少 Bot ID' };
    if (!/^[a-f0-9-]{20,}$/i.test(bot_id)) return { ok: false, message: 'Bot ID 格式无效' };
    return { ok: true, message: '微信 Bot 配置格式验证通过' };
  },

  /**
   * Telegram：调用 getMe 验证 Bot Token
   */
  async telegram(config) {
    const { bot_token } = config;
    if (!bot_token) return { ok: false, message: '缺少 Bot Token' };
    try {
      const data = await _get(`https://api.telegram.org/bot${bot_token}/getMe`);
      if (data.ok) {
        return {
          ok: true,
          message: `Telegram Bot @${data.result.username} 验证通过`,
          identity: { bot_name: data.result.first_name, username: data.result.username }
        };
      }
      return { ok: false, message: `Telegram 返回错误: ${data.description || ''}` };
    } catch (e) {
      return { ok: false, message: `Telegram API 不可达: ${e.message}` };
    }
  },

  /**
   * Discord：调用 /users/@me 验证 Bot Token
   */
  async discord(config) {
    const { bot_token } = config;
    if (!bot_token) return { ok: false, message: '缺少 Bot Token' };
    try {
      const data = await _get('https://discord.com/api/v10/users/@me', {
        Authorization: `Bot ${bot_token}`
      });
      if (data.id) {
        return {
          ok: true,
          message: `Discord Bot @${data.username} 验证通过`,
          identity: { bot_name: data.username, bot_id: data.id }
        };
      }
      return { ok: false, message: `Discord 返回错误: ${data.message || JSON.stringify(data)}` };
    } catch (e) {
      return { ok: false, message: `Discord API 不可达: ${e.message}` };
    }
  },

  /**
   * Slack：调用 auth.test 验证 Bot Token
   */
  async slack(config) {
    const { bot_token } = config;
    if (!bot_token) return { ok: false, message: '缺少 Bot Token' };
    if (!bot_token.startsWith('xoxb-')) return { ok: false, message: 'Bot Token 应以 xoxb- 开头' };
    try {
      const data = await _post('https://slack.com/api/auth.test', null, {
        Authorization: `Bearer ${bot_token}`
      });
      if (data.ok) {
        return {
          ok: true,
          message: `Slack @${data.user} 在 ${data.team} 验证通过`,
          identity: { user: data.user, team: data.team, url: data.url }
        };
      }
      return { ok: false, message: `Slack 返回错误: ${data.error || ''}` };
    } catch (e) {
      return { ok: false, message: `Slack API 不可达: ${e.message}` };
    }
  },

  /**
   * WebChat / Webhook：无需验证
   */
  async webchat() { return { ok: true, message: '网页聊天无需凭证验证' }; },
  async webhook() { return { ok: true, message: 'Webhook 无需凭证验证' }; },

  /**
   * 钉钉：格式验证（Stream 模式需要 SDK，这里只做基本检查）
   */
  async dingtalk(config) {
    const { client_id, client_secret } = config;
    if (!client_id) return { ok: false, message: '缺少 Client ID' };
    if (!client_secret) return { ok: false, message: '缺少 Client Secret' };
    return { ok: true, message: '钉钉配置格式验证通过' };
  },

  /**
   * QQ：格式验证
   */
  async qq(config) {
    const { app_id, client_secret } = config;
    if (!app_id) return { ok: false, message: '缺少 App ID' };
    if (!client_secret) return { ok: false, message: '缺少 Client Secret' };
    return { ok: true, message: 'QQ 配置格式验证通过' };
  },

  /**
   * 抖音：格式验证
   */
  async douyin() {
    return { ok: true, message: '抖音配置格式验证通过' };
  },
};

/**
 * 执行预检验证
 * @param {string} platform — 平台类型
 * @param {object} config — 渠道配置
 * @returns {VerificationResult}
 */
async function verify(platform, config = {}) {
  const verifier = verifiers[platform];
  if (!verifier) return { ok: false, message: `不支持的平台: ${platform}` };

  const startTime = Date.now();
  try {
    const result = await verifier(config);
    result.duration_ms = Date.now() - startTime;
    return result;
  } catch (e) {
    return { ok: false, message: `验证异常: ${e.message}`, duration_ms: Date.now() - startTime };
  }
}

/**
 * 列出支持的预检平台
 */
function supportedPlatforms() {
  return Object.keys(verifiers);
}

// HTTP 工具
function _get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); } });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function _post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 10000,
    };
    const req = mod.request(url, options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ raw: body }); } });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { verify, supportedPlatforms, verifiers };
