// Telegram Bot Channel Adapter — 参考 mateclaw TelegramChannelAdapter
// 长轮询 getUpdates 模式，无需公网 IP
const https = require('https');
const { ChannelAdapter, ConnectionState } = require('./adapter');

const API_BASE = 'api.telegram.org';
const POLL_TIMEOUT = 30; // 长轮询超时（秒）
const POLL_INTERVAL_MS = 1000; // 轮询间隔

class TelegramChannelAdapter extends ChannelAdapter {
  constructor(config) {
    super(config);
    this.channelType = 'telegram';
    this._botToken = config.bot_token || config.token || '';
    this._offset = 0; // 已处理的 update_id
    this._pollTimer = null;
    this._running = false;
  }

  // ─── 生命周期 ───

  async doStart() {
    if (!this._botToken) throw new Error('缺少 bot_token');

    // 验证 token
    const me = await this._api('getMe');
    if (!me.ok) throw new Error(`Token 无效: ${me.description || ''}`);
    console.log(`[telegram] @${me.result.username} 已认证`);

    this._running = true;
    this._startPolling();
  }

  async doStop() {
    this._running = false;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // ─── 打字指示器 ───

  async doSendTyping(chatId) {
    if (!chatId) return;
    await this._api('sendChatAction', { chat_id: chatId, action: 'typing' });
  }

  async doCancelTyping(chatId) {
    // Telegram 打字状态自动过期，无需显式取消
  }

  // ─── 消息发送 ───

  async doSend(targetId, content) {
    // 过滤渲染
    const { renderForChannel } = require('./renderer');
    const parts = renderForChannel(content, 'telegram');

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const payload = {
        chat_id: targetId,
        text: part,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };

      // 转义 HTML 特殊字符（保留已有的 HTML 标签）
      // 简化处理：不使用 parse_mode 以避免格式问题
      if (i > 0) {
        // 续段提示
        payload.text = `(续) ${part}`;
      }

      const res = await this._api('sendMessage', payload);
      if (!res.ok) {
        // 回退到纯文本
        delete payload.parse_mode;
        const fallback = await this._api('sendMessage', { ...payload, text: part });
        if (!fallback.ok) throw new Error(`发送失败: ${fallback.description}`);
      }
    }
  }

  // ─── 轮询逻辑 ───

  _startPolling() {
    if (!this._running) return;

    this._poll();
  }

  async _poll() {
    if (!this._running) return;

    try {
      const updates = await this._api('getUpdates', {
        offset: this._offset,
        timeout: POLL_TIMEOUT,
        allowed_updates: ['message', 'edited_message'],
      });

      if (updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          this._offset = Math.max(this._offset, update.update_id + 1);
          await this._handleUpdate(update);
        }
      }
    } catch (e) {
      if (this._running) {
        this.recordError(e);
        console.error(`[telegram] 轮询错误:`, e.message);
      }
    }

    if (this._running) {
      this._pollTimer = setTimeout(() => this._poll(), POLL_INTERVAL_MS);
    }
  }

  // ─── 消息解析 ───

  async _handleUpdate(update) {
    const msg = update.message || update.edited_message;
    if (!msg || !msg.text) return; // 只处理文本消息
    if (update.edited_message) return; // 忽略编辑

    const from = msg.from;
    const chat = msg.chat;

    // 标准化为 MClaw 消息格式
    const standardMsg = {
      channelId: this.id,
      channelType: 'telegram',
      from: String(from.id),
      to: String(chat.id),
      content: msg.text || '',
      msgType: 'text',
      isGroup: chat.type === 'group' || chat.type === 'supergroup',
      isRoom: chat.type === 'group' || chat.type === 'supergroup',
      extra: {
        targetId: String(chat.id),
        senderName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
        senderUsername: from.username || '',
        chatTitle: chat.title || '',
      },
    };

    this.touchActivity();
    this.recordMessage();

    // 交给统一消息处理
    try {
      const { handleIncoming } = require('./index');
      await handleIncoming({
        account_id: this.id,
        platform: 'telegram',
        contact_name: standardMsg.extra.senderName,
        contact_avatar: '',
        content: standardMsg.content,
        raw_data: msg,
        extra: standardMsg.extra,
      });
    } catch (e) {
      this.recordError(e);
    }
  }

  // ─── API 调用 ───

  _api(method, params = {}) {
    return new Promise((resolve, reject) => {
      const queryParts = [];
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) {
          queryParts.push(`${k}=${encodeURIComponent(Array.isArray(v) ? JSON.stringify(v) : v)}`);
        }
      }
      const path = `/bot${this._botToken}/${method}`;
      const url = queryParts.length ? `${path}?${queryParts.join('&')}` : path;

      const req = https.get({
        hostname: API_BASE,
        path: url,
        timeout: method === 'getUpdates' ? (POLL_TIMEOUT + 10) * 1000 : 15000,
      }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { resolve({ ok: false, description: 'Invalid JSON response' }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }
}

module.exports = { TelegramChannelAdapter };
