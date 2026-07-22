const { Router } = require('express');
const db = require('../db');
const router = Router();

// 辅助：按时间段统计 chat_messages
function periodStats(since, until) {
  let sql = 'SELECT role, tool_name FROM chat_messages WHERE created_at >= ?';
  const params = [since];
  if (until) { sql += ' AND created_at < ?'; params.push(until); }
  const messages = db.prepare(sql).all(...params);

  let sessSql = 'SELECT COUNT(DISTINCT session_id) as cnt FROM chat_messages WHERE created_at >= ?';
  const sessParams = [since];
  if (until) { sessSql += ' AND created_at < ?'; sessParams.push(until); }
  const sessions = db.prepare(sessSql).get(...sessParams);

  return {
    conversations: sessions?.cnt || 0,
    messages: messages.length,
    toolCalls: messages.filter(m => m.tool_name).length,
  };
}

// GET /api/dashboard/overview — 今日/昨日/本周 统计
router.get('/overview', (req, res) => {
  try {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

    const today = fmt(now);
    const yesterdayStart = fmt(new Date(now - 86400000));
    const weekStart = fmt(new Date(now - 7 * 86400000));

    res.json({
      code: 200,
      data: {
        today:     periodStats(today),
        yesterday: periodStats(yesterdayStart, today),
        thisWeek:  periodStats(weekStart),
      },
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// GET /api/dashboard/trend?days=7 — 按天聚合的消息数 / 会话数
router.get('/trend', (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 7, 90);
    // 生成日期列表
    const dates = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      dates.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD
    }

    const rows = dates.map(date => {
      const next = new Date(new Date(date).getTime() + 86400000).toISOString().slice(0, 10);
      const messages = db.prepare(
        'SELECT role, tool_name FROM chat_messages WHERE created_at >= ? AND created_at < ?'
      ).all(date, next);
      const sessions = db.prepare(
        'SELECT COUNT(DISTINCT session_id) as cnt FROM chat_messages WHERE created_at >= ? AND created_at < ?'
      ).get(date, next);

      return {
        date,
        messages: messages.length,
        conversations: sessions?.cnt || 0,
        toolCalls: messages.filter(m => m.tool_name).length,
      };
    });

    res.json({ code: 200, data: rows });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// GET /api/dashboard/recent-runs?limit=10 — 最近 OpenClaw cron 执行记录
router.get('/recent-runs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    // 尝试通过 OpenClaw WebSocket 获取 cron 运行历史
    const wsClient = require('../openclaw/ws-client');
    const result = await Promise.race([
      wsClient.request('cron.runs', { limit }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]).catch(() => null);

    if (result?.runs) {
      res.json({ code: 200, data: result.runs });
    } else {
      // 回退：从本地 logs 表取最近记录
      const rows = db.prepare(
        `SELECT id, type, action, detail, username, created_at
         FROM logs ORDER BY created_at DESC LIMIT ?`
      ).all(limit);
      res.json({
        code: 200,
        data: rows.map(r => ({
          id: r.id,
          type: r.type,
          jobName: r.action,
          detail: r.detail,
          trigger: r.username || 'system',
          startedAt: r.created_at,
          status: r.type === 'error' ? 'failed' : 'completed',
        })),
      });
    }
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// GET /api/dashboard/models — 模型配置摘要（兼容旧接口）
router.get('/models', (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT id, name, provider, model, is_active, is_default FROM model_configs ORDER BY is_default DESC'
    ).all();
    res.json({ code: 200, data: rows });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// GET /api/dashboard/models-full — 模型配置 + 健康状态
router.get('/models-full', (req, res) => {
  try {
    const models = db.prepare(
      'SELECT id, name, provider, model, is_active, is_default, api_base, api_key FROM model_configs ORDER BY is_default DESC'
    ).all();

    // 脱敏 + 附加 liveness 标记
    const enriched = models.map(m => ({
      id: m.id,
      name: m.name || m.provider,
      provider: m.provider,
      model: m.model,
      isDefault: !!m.is_default,
      isActive: !!m.is_active,
      liveness: m.is_active ? 'LIVE' : 'UNCONFIGURED',
      configured: !!(m.api_base || m.api_key),
    }));

    // 查找当前默认/激活模型
    const activeModel = enriched.find(m => m.isDefault && m.isActive) || enriched.find(m => m.isActive) || null;

    res.json({
      code: 200,
      data: {
        providers: enriched,
        activeModel: activeModel ? { providerId: activeModel.id, model: activeModel.model } : null,
      },
    });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
