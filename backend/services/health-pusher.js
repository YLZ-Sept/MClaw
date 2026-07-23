// 系统健康状态 WebSocket 推送器
// 每 30 秒采集系统/服务/渠道健康数据，通过 event-bus 广播给所有前端客户端

const os = require('os');

let _timer = null;
let _running = false;

function gather() {
  const data = { type: 'system_health', time: Date.now() };

  try {
    // ── 系统资源 ──
    data.system = {
      cpu: `${Math.round(os.loadavg()[0] * 100) / 100}%`,
      memory: `${Math.round((os.totalmem() - os.freemem()) / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB`,
      uptime: process.uptime(),
    };

    // ── 服务状态 ──
    const services = [];
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600), m = Math.floor((uptime % 3600) / 60);

    services.push({ name: '后端 API 服务', status: 'running', port: 18621, uptime: `${h}h ${m}m` });
    services.push({ name: '前端 Web 服务', status: 'running', port: 18621, uptime: `${h}h ${m}m` });

    // 多平台发布服务
    try {
      const multiPublish = require('./multi-publish');
      const pubHealth = multiPublish.health();
      services.push({ name: '多平台发布服务', status: pubHealth.status === 'healthy' ? 'running' : 'stopped', port: 18623 });
    } catch {
      services.push({ name: '多平台发布服务', status: 'stopped', port: 18623 });
    }

    // AI 引擎服务
    try {
      const wsClient = require('../openclaw/ws-client');
      services.push({ name: 'AI引擎服务', status: wsClient.isConnected() ? 'running' : 'stopped', port: 18622 });
    } catch {
      services.push({ name: 'AI引擎服务', status: 'stopped', port: 18622 });
    }

    data.services = services;

    // ── 渠道健康摘要 ──
    try {
      const { monitor: channelMonitor } = require('../channels/health');
      data.channels = channelMonitor.snapshot();
    } catch {}

    // ── 渠道管理器状态 ──
    try {
      const { channelManager } = require('../channels/manager');
      data.channelManager = channelManager.healthSnapshot();
    } catch {}
  } catch (e) {
    console.error('[health-pusher] 采集失败:', e.message);
  }

  return data;
}

function start(intervalMs = 30000) {
  if (_running) return;
  _running = true;

  const { broadcast } = require('../channels/event-bus');

  // 首次延迟 2 秒等各服务初始化完成
  _timer = setTimeout(() => {
    broadcast(gather());
    // 之后定期推送
    _timer = setInterval(() => {
      broadcast(gather());
    }, intervalMs);
  }, 2000);

  console.log(`[health-pusher] 已启动，间隔 ${intervalMs / 1000}s`);
}

function stop() {
  _running = false;
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop, gather };
