// Abstract Channel Adapter — 参考 mateclaw AbstractChannelAdapter
// 所有渠道适配器的公共基类：生命周期、重连、健康、访问控制
const EventEmitter = require('events');

// 连接状态机
const ConnectionState = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
});

// 健康状态
const HealthStatus = Object.freeze({
  UP: 'healthy',
  DOWN: 'unhealthy',
  RECONNECTING: 'degraded',
  OUT_OF_SERVICE: 'disabled',
  UNKNOWN: 'unknown',
});

class ChannelAdapter extends EventEmitter {
  constructor(config) {
    super();
    this.id = config.id;
    this.name = config.name || config.account_name || '';
    this.channelType = config.channelType || config.platform || 'unknown';
    this.config = config; // channel 完整配置（从 DB 加载）
    this._state = ConnectionState.DISCONNECTED;
    this._running = false;
    this._lastEventTime = null;
    this._consecutiveFailures = 0;
    this._totalMessages = 0;
    this._totalErrors = 0;

    // 重连参数
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 20;
    this._reconnectBaseMs = 2000;
    this._reconnectMaxMs = 60000;
  }

  // ─── 模板方法（子类必须实现）───

  /** 启动连接 */
  async doStart() { throw new Error('doStart() not implemented'); }

  /** 停止连接 */
  async doStop() { throw new Error('doStop() not implemented'); }

  /** 发送消息 */
  async doSend(targetId, content) { throw new Error('doSend() not implemented'); }

  // ─── 生命周期 ───

  async start() {
    if (this._running) return;
    this._state = ConnectionState.CONNECTING;
    this._running = true;
    try {
      await this.doStart();
      this._state = ConnectionState.CONNECTED;
      this._consecutiveFailures = 0;
      this._reconnectAttempts = 0;
      this.touchActivity();
      this.emit('connected');
    } catch (e) {
      this._state = ConnectionState.ERROR;
      this._consecutiveFailures++;
      this.emit('error', e);
      this._scheduleReconnect();
    }
  }

  async stop() {
    this._running = false;
    try {
      await this.doStop();
    } catch (e) {
      this.emit('error', e);
    }
    this._state = ConnectionState.DISCONNECTED;
    this.emit('disconnected');
  }

  isRunning() { return this._running; }

  // ─── 重连逻辑 ───

  _scheduleReconnect() {
    if (!this._running) return;
    if (this._reconnectAttempts >= this._maxReconnectAttempts) {
      this._state = ConnectionState.ERROR;
      this.emit('reconnect_failed', `max attempts (${this._maxReconnectAttempts}) reached`);
      return;
    }
    this._state = ConnectionState.RECONNECTING;
    const delay = Math.min(
      this._reconnectBaseMs * Math.pow(2, this._reconnectAttempts),
      this._reconnectMaxMs
    );
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    const actualDelay = delay + jitter;
    this._reconnectAttempts++;
    this.emit('reconnecting', { attempt: this._reconnectAttempts, delay: Math.round(actualDelay) });

    this._reconnectTimer = setTimeout(async () => {
      try {
        await this.doStart();
        this._state = ConnectionState.CONNECTED;
        this._consecutiveFailures = 0;
        this._reconnectAttempts = 0;
        this.touchActivity();
        this.emit('connected');
      } catch (e) {
        this._consecutiveFailures++;
        this.emit('error', e);
        this._scheduleReconnect();
      }
    }, actualDelay);
  }

  // ─── 健康检查 ───

  health() {
    if (!this._running) return { status: HealthStatus.OUT_OF_SERVICE, detail: '已停用' };
    switch (this._state) {
      case ConnectionState.CONNECTED: return { status: HealthStatus.UP, detail: '已连接' };
      case ConnectionState.RECONNECTING: return { status: HealthStatus.RECONNECTING, detail: `重连中 (${this._reconnectAttempts})` };
      case ConnectionState.ERROR: return { status: HealthStatus.DOWN, detail: '异常' };
      case ConnectionState.CONNECTING: return { status: HealthStatus.RECONNECTING, detail: '连接中...' };
      default: return { status: HealthStatus.UNKNOWN, detail: '未知' };
    }
  }

  stalenessThreshold() { return 60 * 60 * 1000; } // 默认 1 小时

  isStale() {
    if (!this._lastEventTime) return false;
    return (Date.now() - this._lastEventTime) > this.stalenessThreshold();
  }

  // ─── 消息处理 ───

  touchActivity() {
    this._lastEventTime = Date.now();
  }

  recordMessage() {
    this._totalMessages++;
    this.touchActivity();
  }

  recordError(err) {
    this._totalErrors++;
    this._consecutiveFailures++;
    this.emit('error', err);
  }

  // ─── 访问控制 ───

  /** 检查消息是否应被处理（Bot 前缀、访问策略） */
  shouldProcess(msg, botPrefix) {
    const config = this.config || {};
    const dmPolicy = config.dm_policy || 'open';       // open | closed
    const groupPolicy = config.group_policy || 'open'; // open | prefix | closed
    const allowFrom = _parseList(config.allow_from);    // 白名单
    const denyFrom = _parseList(config.deny_from);      // 黑名单
    const senderId = msg.from || '';

    // 黑名单优先
    if (denyFrom.length && denyFrom.some(id => senderId.includes(id) || id.includes(senderId))) {
      return { process: false, reason: 'denied_user' };
    }

    // 私聊
    if (!msg.isGroup && !msg.isRoom) {
      if (dmPolicy === 'closed') return { process: false, reason: 'dm_closed' };
      if (allowFrom.length && !allowFrom.some(id => senderId.includes(id) || id.includes(senderId))) {
        return { process: false, reason: 'not_in_allowlist' };
      }
      return { process: true };
    }

    // 群聊
    if (groupPolicy === 'closed') return { process: false, reason: 'group_closed' };

    // 白名单（群聊也适用）
    if (allowFrom.length && !allowFrom.some(id => senderId.includes(id) || id.includes(senderId))) {
      return { process: false, reason: 'not_in_allowlist' };
    }

    // Bot 前缀
    if (groupPolicy === 'prefix' || botPrefix) {
      if (botPrefix && msg.content) {
        const lowered = msg.content.toLowerCase();
        const prefixLowered = botPrefix.toLowerCase();
        if (lowered.startsWith(prefixLowered)) {
          msg.content = msg.content.slice(botPrefix.length).trim();
          return { process: true, cleaned: true };
        }
        // @mention 也触发（平台会用 @bot_name 格式）
        if (lowered.includes('@' + prefixLowered.replace(/^[@/]/, ''))) {
          return { process: true };
        }
      }
      return { process: false, reason: 'no_prefix' };
    }

    return { process: true };
  }

  /** 发送拒绝消息（当 shouldProcess 返回 false 时） */
  getDenyMessage(reason, botPrefix) {
    const denyMsg = this.config?.deny_message || '';
    if (denyMsg) return denyMsg;
    switch (reason) {
      case 'no_prefix': return botPrefix ? `请使用 "${botPrefix}" 开头与我对话` : '';
      case 'dm_closed': return '暂不支持私聊，请联系管理员';
      case 'group_closed': return '暂不支持群聊，请联系管理员';
      case 'denied_user': return '您暂无访问权限';
      case 'not_in_allowlist': return '您暂无访问权限';
      default: return '';
    }
  }

  // ─── 消息发送 ───

  async sendMessage(targetId, content) {
    try {
      await this.doSend(targetId, content);
      this.touchActivity();
    } catch (e) {
      this.recordError(e);
      throw e;
    }
  }

  /** 发送打字指示器（如果平台支持） */
  async sendTyping(targetId) {
    if (this.doSendTyping) {
      try { await this.doSendTyping(targetId); } catch {}
    }
  }

  /** 取消打字指示器 */
  async cancelTyping(targetId) {
    if (this.doCancelTyping) {
      try { await this.doCancelTyping(targetId); } catch {}
    }
  }

  // ─── 辅助 ───

  /** 重新加载 DB 配置（每条消息前调用，配置变更即时生效） */
  refreshConfig(freshConfig) {
    if (freshConfig) {
      this.config = freshConfig;
      this.name = freshConfig.name || freshConfig.account_name || this.name;
    }
  }

  getState() { return this._state; }
  getStats() {
    return {
      id: this.id, name: this.name, type: this.channelType,
      state: this._state, running: this._running,
      totalMessages: this._totalMessages, totalErrors: this._totalErrors,
      consecutiveFailures: this._consecutiveFailures,
      reconnectAttempts: this._reconnectAttempts,
      lastEvent: this._lastEventTime,
      health: this.health(),
    };
  }
}

function _parseList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string') return val.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  return [];
}

module.exports = { ChannelAdapter, ConnectionState, HealthStatus };
