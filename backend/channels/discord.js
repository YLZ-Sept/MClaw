// Discord Bot Channel Adapter — Gateway WebSocket + REST API
const https = require('https');
const { ChannelAdapter } = require('./adapter');

const API_BASE = 'discord.com';
const API_VERSION = 'v10';
const GATEWAY_URL = 'gateway.discord.gg';
let _heartbeatInterval = null;
let _ws = null;
let _seq = null;

class DiscordChannelAdapter extends ChannelAdapter {
  constructor(config) {
    super(config);
    this.channelType = 'discord';
    this._botToken = config.bot_token || config.token || '';
  }

  async doStart() {
    if (!this._botToken) throw new Error('缺少 bot_token');

    // 验证 token
    const me = await this._api('GET', '/users/@me');
    if (me.error) throw new Error(`Token 无效: ${me.error}`);
    this._botUser = me;
    console.log(`[discord] @${me.username}#${me.discriminator} 已认证`);

    // 获取 Gateway URL
    const gw = await this._api('GET', '/gateway/bot');
    const wsUrl = (gw.url || `wss://${GATEWAY_URL}`) + '/?v=10&encoding=json';

    this._connect(wsUrl);
  }

  async doStop() {
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
    if (_ws) { _ws.close(); _ws = null; }
  }

  // ─── WebSocket ───

  _connect(wsUrl) {
    const WebSocket = require('ws');
    _ws = new WebSocket(wsUrl);

    _ws.on('open', () => {
      this._state = 'connected';
      this.touchActivity();
      this.emit('connected');
    });

    _ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        this._handleGateway(payload);
      } catch {}
    });

    _ws.on('close', (code) => {
      console.log(`[discord] WS 断开 code=${code}`);
      this._state = 'disconnected';
      if (this._running) this._scheduleReconnect();
    });

    _ws.on('error', (e) => {
      this.recordError(e);
    });
  }

  _handleGateway(payload) {
    const { op, d, s, t } = payload;
    if (s) _seq = s;

    switch (op) {
      case 10: // Hello
        const interval = d.heartbeat_interval || 41250;
        _heartbeatInterval = setInterval(() => {
          if (_ws?.readyState === 1) _ws.send(JSON.stringify({ op: 1, d: _seq }));
        }, interval);
        // Identify
        _ws.send(JSON.stringify({
          op: 2,
          d: {
            token: this._botToken,
            intents: 1 << 9 | 1 << 0, // GUILD_MESSAGES | GUILDS
            properties: { os: 'linux', browser: 'mclaw', device: 'mclaw' }
          }
        }));
        break;

      case 0: // Dispatch
        if (t === 'MESSAGE_CREATE') this._handleMessage(d);
        break;

      case 11: // Heartbeat ACK
        break;
    }
  }

  // ─── 消息处理 ───

  async _handleMessage(msg) {
    if (!msg.content) return; // 只处理文本
    if (msg.author?.bot) return; // 忽略 bot 消息

    const standardMsg = {
      channelId: this.id,
      channelType: 'discord',
      from: msg.author?.id || '',
      to: msg.channel_id,
      content: _cleanMentions(msg),
      msgType: 'text',
      isGroup: true, // Discord 消息始终在频道中
      isRoom: true,
      extra: {
        targetId: msg.channel_id,
        senderName: msg.author?.username || '',
        guildId: msg.guild_id || '',
      },
    };

    this.touchActivity();
    this.recordMessage();

    try {
      const { handleIncoming } = require('./index');
      await handleIncoming({
        account_id: this.id,
        platform: 'discord',
        contact_name: standardMsg.extra.senderName,
        contact_avatar: msg.author?.avatar
          ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`
          : '',
        content: standardMsg.content,
        raw_data: msg,
        extra: standardMsg.extra,
      });
    } catch (e) {
      this.recordError(e);
    }
  }

  // ─── 发送 ───

  async doSendTyping(channelId) {
    if (!channelId) return;
    await this._api('POST', `/channels/${channelId}/typing`);
  }

  async doCancelTyping() {} // Discord 自动过期

  async doSend(channelId, content) {
    const { renderForChannel } = require('./renderer');
    const parts = renderForChannel(content, 'discord');

    for (const part of parts) {
      const body = { content: part.slice(0, 2000) };
      await this._api('POST', `/channels/${channelId}/messages`, body);
    }
  }

  // ─── REST API ───

  _api(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: API_BASE,
        path: `/api/${API_VERSION}${path}`,
        method,
        headers: {
          Authorization: `Bot ${this._botToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'MClaw/1.0',
        },
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

// 清理 @mentions
function _cleanMentions(msg) {
  let text = msg.content || '';
  // 替换 <@!123> 风格的 mentions 为 @username
  if (msg.mentions) {
    for (const m of msg.mentions) {
      text = text.replace(new RegExp(`<@!?${m.id}>`, 'g'), `@${m.username}`);
    }
  }
  return text;
}

module.exports = { DiscordChannelAdapter };
