// System Info Plugin — 服务器状态查询
const os = require('os');

const manifest = {
  name: 'system-info',
  version: '0.2.0',
  description: '系统信息查询工具: CPU/内存/磁盘/进程',

  tools: [
    {
      name: 'system_info',
      description: '获取服务器系统信息（CPU、内存、运行时间、进程等）',
      parameters: {
        type: 'object',
        properties: {
          detail: { type: 'string', description: '查询类别: summary|cpu|memory|disk|processes', default: 'summary' }
        }
      },
      handler: async (args) => {
        const detail = args.detail || 'summary';
        const info = {
          hostname: os.hostname(),
          platform: os.platform(),
          arch: os.arch(),
          cpus: os.cpus().length,
          uptime: Math.round(os.uptime()),
          uptime_formatted: _fmtUptime(os.uptime()),
        };

        if (detail === 'cpu' || detail === 'summary') {
          const cpus = os.cpus();
          info.cpu_model = cpus[0]?.model || '';
          info.cpu_speed = cpus[0]?.speed || 0;
        }

        if (detail === 'memory' || detail === 'summary') {
          const total = os.totalmem();
          const free = os.freemem();
          info.memory_total = Math.round(total / 1024 / 1024);
          info.memory_free = Math.round(free / 1024 / 1024);
          info.memory_used = Math.round((total - free) / 1024 / 1024);
          info.memory_usage_pct = Math.round((total - free) / total * 100);
        }

        if (detail === 'disk' || detail === 'summary') {
          try {
            const fs = require('fs');
            const dbStat = fs.statSync(require('path').join(__dirname, '..', 'data', 'internal.db'));
            info.db_size = Math.round(dbStat.size / 1024 / 1024 * 100) / 100 + ' MB';
          } catch { info.db_size = 'N/A'; }
        }

        if (detail === 'processes' || detail === 'summary') {
          info.node_version = process.version;
          info.pid = process.pid;
          info.memory_rss = Math.round(process.memoryUsage().rss / 1024 / 1024) + ' MB';
          info.memory_heap = Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB';
        }

        return { success: true, ...info };
      }
    },
    {
      name: 'server_uptime',
      description: '查询服务器运行时间',
      parameters: { type: 'object', properties: {} },
      handler: async () => ({
        success: true,
        uptime_seconds: Math.round(os.uptime()),
        uptime_formatted: _fmtUptime(os.uptime()),
        started_at: new Date(Date.now() - os.uptime() * 1000).toISOString()
      })
    }
  ]
};

function _fmtUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(d + '天');
  if (h) parts.push(h + '时');
  parts.push(m + '分');
  return parts.join(' ');
}

module.exports = { manifest };
