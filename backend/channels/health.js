// Channel Health Monitor — 多渠道健康监控
// 统一监控企微、飞书、微信 Bot 等渠道的连接状态
const EventEmitter = require('events');
let _bus = null;
function bus() { if (!_bus) _bus = require('./event-bus'); return _bus; }

const HEALTH_STATUS = {
  HEALTHY: 'healthy',       // 连接正常
  DEGRADED: 'degraded',    // 降级（有错误但仍在工作）
  UNHEALTHY: 'unhealthy',  // 不健康（连续失败）
  DISABLED: 'disabled',     // 已禁用
  UNKNOWN: 'unknown'        // 未知（未初始化）
};

class ChannelHealthMonitor extends EventEmitter {
  constructor() {
    super();
    this._channels = new Map(); // channelId → ChannelHealth
    this._failureThreshold = 3;
    this._recoveryThreshold = 2; // 连续成功 2 次恢复
    this._checkIntervalMs = 60 * 1000; // 每分钟检查一次
    this._timer = null;
  }

  /**
   * 注册渠道
   */
  register(channelId, config = {}) {
    this._channels.set(channelId, {
      id: channelId,
      type: config.type || 'unknown',
      name: config.name || channelId,
      status: config.enabled !== false ? HEALTH_STATUS.UNKNOWN : HEALTH_STATUS.DISABLED,
      lastHeartbeat: null,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalMessages: 0,
      totalErrors: 0,
      lastError: null,
      lastErrorAt: null,
      extra: config.extra || {}
    });
    this.emit('channel.registered', this._channels.get(channelId));
  }

  /**
   * 记录心跳
   */
  heartbeat(channelId) {
    const ch = this._channels.get(channelId);
    if (!ch) return;
    ch.lastHeartbeat = Date.now();
    ch.consecutiveSuccesses++;
    ch.consecutiveFailures = 0;
    if (ch.status === HEALTH_STATUS.UNHEALTHY && ch.consecutiveSuccesses >= this._recoveryThreshold) {
      ch.status = HEALTH_STATUS.HEALTHY;
      bus().broadcast({ type: 'channel_health', channel: ch.id, status: 'healthy' });
      this.emit('channel.recovered', ch);
    } else if (ch.status === HEALTH_STATUS.UNKNOWN) {
      ch.status = HEALTH_STATUS.HEALTHY;
      bus().broadcast({ type: 'channel_health', channel: ch.id, status: 'healthy' });
    }
  }

  /**
   * 记录消息处理
   */
  recordMessage(channelId) {
    const ch = this._channels.get(channelId);
    if (!ch) return;
    ch.totalMessages++;
    this.heartbeat(channelId);
  }

  /**
   * 记录错误
   */
  recordError(channelId, error) {
    const ch = this._channels.get(channelId);
    if (!ch) return;
    ch.totalErrors++;
    ch.consecutiveFailures++;
    ch.consecutiveSuccesses = 0;
    ch.lastError = error?.message || String(error);
    ch.lastErrorAt = Date.now();

    if (ch.consecutiveFailures >= this._failureThreshold && ch.status === HEALTH_STATUS.HEALTHY) {
      ch.status = HEALTH_STATUS.UNHEALTHY;
      bus().broadcast({ type: 'channel_health', channel: ch.id, status: 'unhealthy' });
      this.emit('channel.unhealthy', ch);
    } else if (ch.consecutiveFailures >= 1 && ch.status === HEALTH_STATUS.HEALTHY) {
      ch.status = HEALTH_STATUS.DEGRADED;
      bus().broadcast({ type: 'channel_health', channel: ch.id, status: 'degraded' });
      this.emit('channel.degraded', ch);
    }
  }

  /**
   * 获取单个渠道状态
   */
  getChannel(channelId) {
    return this._channels.get(channelId) || null;
  }

  /**
   * 获取所有渠道状态
   */
  snapshot() {
    const channels = [];
    for (const ch of this._channels.values()) {
      channels.push({
        id: ch.id,
        type: ch.type,
        name: ch.name,
        status: ch.status,
        lastHeartbeat: ch.lastHeartbeat,
        lastHeartbeatAgo: ch.lastHeartbeat ? Date.now() - ch.lastHeartbeat : null,
        consecutiveFailures: ch.consecutiveFailures,
        totalMessages: ch.totalMessages,
        totalErrors: ch.totalErrors,
        lastError: ch.lastError,
        lastErrorAt: ch.lastErrorAt,
        extra: ch.extra
      });
    }

    const statusCounts = {};
    for (const s of Object.values(HEALTH_STATUS)) statusCounts[s] = 0;
    for (const ch of channels) statusCounts[ch.status]++;

    return {
      channels,
      summary: {
        total: channels.length,
        ...statusCounts,
        overallStatus: statusCounts[HEALTH_STATUS.UNHEALTHY] > 0 ? HEALTH_STATUS.DEGRADED
          : statusCounts[HEALTH_STATUS.DISABLED] === channels.length ? HEALTH_STATUS.DISABLED
          : HEALTH_STATUS.HEALTHY
      },
      timestamp: Date.now()
    };
  }

  /**
   * 启动定期健康检查
   */
  start() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      const now = Date.now();
      for (const ch of this._channels.values()) {
        // 检测心跳超时（5 分钟无心跳 → 标记为不健康）
        if (ch.status === HEALTH_STATUS.HEALTHY && ch.lastHeartbeat && (now - ch.lastHeartbeat) > 5 * 60 * 1000) {
          ch.status = HEALTH_STATUS.UNHEALTHY;
          ch.lastError = '心跳超时（5分钟无响应）';
          ch.lastErrorAt = now;
          this.emit('channel.unhealthy', ch);
        }
      }
    }, this._checkIntervalMs);
    this._timer.unref();
  }

  /**
   * 停止定期检查
   */
  stop() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /**
   * 启用/禁用渠道
   */
  setEnabled(channelId, enabled) {
    const ch = this._channels.get(channelId);
    if (!ch) return;
    ch.status = enabled ? HEALTH_STATUS.UNKNOWN : HEALTH_STATUS.DISABLED;
    this.emit(enabled ? 'channel.enabled' : 'channel.disabled', ch);
  }
}

// 全局单例
const monitor = new ChannelHealthMonitor();

module.exports = { ChannelHealthMonitor, monitor, HEALTH_STATUS };
