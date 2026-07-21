// Channel Manager — 参考 mateclaw ChannelManager
// 集中管理所有渠道适配器的生命周期：启动/停止/热替换/健康对账
const db = require('../db');
const { ChannelAdapter } = require('./adapter');

class ChannelManager {
  constructor() {
    this._adapters = new Map(); // channelId → ChannelAdapter
    this._factory = null;       // 工厂函数 (channelConfig) => ChannelAdapter
    this._reconcileTimer = null;
  }

  /**
   * 注册适配器工厂
   * @param {Function} factory — (channelConfig) => ChannelAdapter
   */
  registerFactory(factory) {
    this._factory = factory;
  }

  /**
   * 初始化：从 DB 加载所有活跃渠道并启动
   */
  async init() {
    const rows = db.prepare("SELECT * FROM channel_accounts WHERE status='active'").all();
    console.log(`[channel-manager] 初始化 ${rows.length} 个渠道`);

    for (const row of rows) {
      try {
        await this.startChannel(row);
      } catch (e) {
        console.error(`[channel-manager] 启动 ${row.account_name} 失败:`, e.message);
      }
    }

    // 启动健康对账（每 60 秒）
    this._reconcileTimer = setInterval(() => this.reconcile(), 60_000);
    if (this._reconcileTimer.unref) this._reconcileTimer.unref();
  }

  /**
   * 创建并启动适配器
   */
  async startChannel(config) {
    const id = String(config.id);
    if (this._adapters.has(id)) {
      console.log(`[channel-manager] ${id} 已在运行`);
      return this._adapters.get(id);
    }

    if (!this._factory) {
      throw new Error('未注册适配器工厂');
    }

    const adapter = this._factory(config);
    this._adapters.set(id, adapter);

    adapter.on('connected', () => console.log(`[channel-manager] ✓ ${adapter.name} 已连接`));
    adapter.on('disconnected', () => console.log(`[channel-manager] - ${adapter.name} 已断开`));
    adapter.on('reconnecting', (info) => console.log(`[channel-manager] ~ ${adapter.name} 重连 ${info.attempt}/${20} (${Math.round(info.delay/1000)}s)`));
    adapter.on('error', (e) => console.error(`[channel-manager] ✗ ${adapter.name}:`, e.message));
    adapter.on('reconnect_failed', (reason) => console.error(`[channel-manager] ✗ ${adapter.name} 重连失败: ${reason}`));

    await adapter.start();
    return adapter;
  }

  /**
   * 停止适配器
   */
  async stopChannel(id) {
    id = String(id);
    const adapter = this._adapters.get(id);
    if (!adapter) return;
    await adapter.stop();
    this._adapters.delete(id);
  }

  /**
   * 热替换：停止旧适配器，启动新配置
   */
  async restartChannel(config) {
    const id = String(config.id);
    const old = this._adapters.get(id);

    // 创建新适配器
    const newAdapter = this._factory(config);
    this._adapters.set(id, newAdapter);

    // 启动新适配器
    try {
      await newAdapter.start();
    } catch (e) {
      // 回滚：如果新适配器启动失败，恢复旧适配器
      if (old) {
        this._adapters.set(id, old);
        console.error(`[channel-manager] 热替换失败，已回滚: ${config.account_name}`);
      }
      throw e;
    }

    // 异步停止旧适配器
    if (old) {
      try {
        await old.stop();
      } catch (e) {
        console.error(`[channel-manager] 停止旧适配器失败: ${old.name}`, e.message);
      }
    }

    console.log(`[channel-manager] ✓ ${config.account_name} 热替换完成`);
  }

  /**
   * 健康对账：检测配置变更 + 僵死重启
   */
  async reconcile() {
    const dbRows = db.prepare("SELECT * FROM channel_accounts WHERE status='active'").all();
    const dbMap = new Map(dbRows.map(r => [String(r.id), r]));

    for (const [id, adapter] of this._adapters) {
      const row = dbMap.get(id);

      // 渠道已在 DB 中停用 → 停止
      if (!row) {
        console.log(`[channel-manager] ${adapter.name} 已在 DB 停用，停止中`);
        await this.stopChannel(id);
        continue;
      }

      // 更新配置（新消息会自动使用新配置）
      adapter.refreshConfig(row);

      // 僵死检测：ERROR 状态超过 5 分钟 → 重启
      const health = adapter.health();
      if (health.status === 'unhealthy' && adapter._state === 'error') {
        const errorDuration = adapter._lastEventTime ? Date.now() - adapter._lastEventTime : 0;
        if (errorDuration > 5 * 60 * 1000 && adapter._reconnectAttempts === 0) {
          console.log(`[channel-manager] ${adapter.name} ERROR 超过 5min，强制重启`);
          try { await this.restartChannel(row); } catch (e) {}
        }
      }

      // 僵死检测：CONNECTED 但超过 stalenessThreshold 无活动
      if (adapter.isStale()) {
        console.log(`[channel-manager] ${adapter.name} 长期无活动 (${Math.round((Date.now() - adapter._lastEventTime)/60000)}min)，重启`);
        try { await this.restartChannel(row); } catch (e) {}
      }
    }

    // 新增在 DB 中但不在此进程的渠道 → 启动
    for (const [id, row] of dbMap) {
      if (!this._adapters.has(id)) {
        try { await this.startChannel(row); } catch (e) {}
      }
    }
  }

  /**
   * 获取适配器
   */
  get(id) { return this._adapters.get(String(id)); }

  /**
   * 列举所有适配器
   */
  list() {
    return [...this._adapters.values()].map(a => a.getStats());
  }

  /**
   * 健康快照
   */
  healthSnapshot() {
    const channels = this.list();
    return {
      channels,
      summary: {
        total: channels.length,
        healthy: channels.filter(c => c.health.status === 'healthy').length,
        degraded: channels.filter(c => c.health.status === 'degraded').length,
        unhealthy: channels.filter(c => c.health.status === 'unhealthy').length,
      }
    };
  }

  /**
   * 销毁：停止所有适配器
   */
  async destroy() {
    if (this._reconcileTimer) clearInterval(this._reconcileTimer);
    for (const [, adapter] of this._adapters) {
      try { await adapter.stop(); } catch (e) {}
    }
    this._adapters.clear();
  }
}

// 单例
const channelManager = new ChannelManager();

module.exports = { ChannelManager, channelManager };
