const express = require('express');
const router = express.Router();
const wsClient = require('../openclaw/ws-client');

function openclaw(method, params) {
  return wsClient.request(method, params).catch(err => {
    throw { status: 503, message: 'OpenClaw 服务不可用: ' + err.message };
  });
}

// GET /api/tasks — list cron jobs
router.get('/', async (req, res) => {
  try {
    const { enabled, query, limit } = req.query;
    const result = await openclaw('cron.list', {
      includeDisabled: true,
      limit: parseInt(limit) || 50,
      ...(query ? { query } : {}),
      ...(enabled === 'true' || enabled === 'false' ? { enabled: enabled === 'true' ? 'enabled' : 'disabled' } : { enabled: 'all' })
    });
    res.json({ code: 200, data: result.jobs || [], total: result.total || 0 });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/tasks — create cron job
router.post('/', async (req, res) => {
  try {
    const { name, description, schedule, agentId, message, enabled, sessionTarget } = req.body;
    if (!name || !schedule || !message) {
      return res.status(400).json({ code: 400, message: 'name, schedule, message 为必填项' });
    }
    const params = {
      name,
      description: description || '',
      enabled: enabled !== false,
      schedule: parseSchedule(schedule),
      sessionTarget: sessionTarget || 'isolated',
      wakeMode: 'now',
      payload: { kind: 'agentTurn', message }
    };
    if (agentId) params.agentId = agentId;
    const result = await openclaw('cron.add', params);
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// PUT /api/tasks/:id — update cron job
router.put('/:id', async (req, res) => {
  try {
    const { name, description, schedule, agentId, message, enabled, sessionTarget } = req.body;
    const params = { id: req.params.id };
    if (name !== undefined) params.name = name;
    if (description !== undefined) params.description = description;
    if (schedule !== undefined) params.schedule = parseSchedule(schedule);
    if (agentId !== undefined) params.agentId = agentId;
    if (message !== undefined) params.payload = { kind: 'agentTurn', message };
    if (enabled !== undefined) params.enabled = enabled;
    if (sessionTarget !== undefined) params.sessionTarget = sessionTarget;
    const result = await openclaw('cron.add', params);
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await openclaw('cron.remove', { id: req.params.id });
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/tasks/:id/run
router.post('/:id/run', async (req, res) => {
  try {
    const result = await openclaw('cron.run', { id: req.params.id });
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

function parseSchedule(s) {
  if (!s) return { kind: 'at', at: new Date(Date.now() + 86400000).toISOString() };
  // cron expression: "0 9 * * *" or "0 9 * * 1-5"
  if (/^[\d*,/\-]+\s+[\d*,/\-]+\s+[\d*,/\-]+\s+[\d*,/\-]+\s+[\d*,/\-]+(\s+[\d*,/\-]+)?$/.test(s.trim())) {
    return { kind: 'cron', expr: s.trim() };
  }
  // interval: "1h", "30m", "5m"
  const intervalMatch = s.trim().match(/^(\d+)\s*(h|m|s)$/i);
  if (intervalMatch) {
    const mult = { h: 3600000, m: 60000, s: 1000 };
    return { kind: 'every', everyMs: parseInt(intervalMatch[1]) * mult[intervalMatch[2].toLowerCase()] };
  }
  // default: treat as ISO timestamp
  return { kind: 'at', at: s.trim() };
}

module.exports = router;
