// Agent 绑定的 OpenClaw 技能管理
const { Router } = require('express');
const db = require('../db');
const wsClient = require('../openclaw/ws-client');
const { getTranslations, translateInBackground } = require('../services/skill-translator');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS agent_openclaw_skills (
  agent_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (agent_id, skill_name)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS skill_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  command TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

function openclaw(method, params) {
  return wsClient.request(method, params).catch(err => {
    throw { status: 503, message: 'OpenClaw 服务不可用: ' + err.message };
  });
}

// GET /api/agent-openclaw-skills — 获取所有已启用的 OpenClaw 技能列表
router.get('/', async (req, res) => {
  try {
    const result = await openclaw('skills.status');
    const translations = getTranslations();
    const skills = (result.skills || []).filter(s => !s.disabled).map(s => {
      const key = s.skillKey || s.name;
      const t = translations[key];
      return {
        name: s.name,
        description: s.description || '',
        nameZh: t?.name_zh || null,
        descZh: t?.desc_zh || null,
        skillKey: s.skillKey,
        source: s.source,
        filePath: s.filePath,
        baseDir: s.baseDir
      };
    });
    const untranslated = skills.filter(s => !translations[s.skillKey || s.name]);
    if (untranslated.length > 0) {
      translateInBackground(untranslated);
    }
    res.json({ code: 200, data: skills });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// GET /api/agent-openclaw-skills/recent-usage — 获取最近使用记录
router.get('/recent-usage', (req, res) => {
  try {
    const agentId = req.query.agent_id || null;
    const limit = parseInt(req.query.limit) || 50;
    let rows;
    if (agentId) {
      rows = db.prepare(
        'SELECT * FROM skill_usage_log WHERE agent_id=? ORDER BY created_at DESC LIMIT ?'
      ).all(agentId, limit);
    } else {
      rows = db.prepare(
        'SELECT * FROM skill_usage_log ORDER BY created_at DESC LIMIT ?'
      ).all(limit);
    }
    res.json({ code: 200, data: rows });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// PUT /api/agent-openclaw-skills/toggle — 切换技能启用/禁用状态
router.put('/toggle', async (req, res) => {
  try {
    const { skillKey, enabled } = req.body;
    if (!skillKey || typeof skillKey !== 'string') return res.status(400).json({ code: 400, message: 'skillKey 为必填项' });
    await openclaw('skills.update', { skillKey, enabled: !!enabled });
    // 记录使用日志（最近使用追踪）
    try { db.prepare('INSERT INTO skill_usage_log (agent_id, command) VALUES (?,?)').run('openclaw', skillKey); } catch {}
    res.json({ code: 200, data: { ok: true } });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// GET /api/agent-openclaw-skills/:agentId — 获取指定 Agent 已勾选的技能
router.get('/:agentId', (req, res) => {
  try {
    const rows = db.prepare('SELECT skill_name FROM agent_openclaw_skills WHERE agent_id=? AND enabled=1')
      .all(req.params.agentId);
    res.json({ code: 200, data: rows.map(r => r.skill_name) });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

// PUT /api/agent-openclaw-skills/:agentId — 更新 Agent 勾选的技能列表
router.put('/:agentId', (req, res) => {
  try {
    const { skills } = req.body;
    const agentId = req.params.agentId;
    if (!Array.isArray(skills)) return res.status(400).json({ code: 400, message: 'skills 必须为数组' });

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM agent_openclaw_skills WHERE agent_id=?').run(agentId);
      const insert = db.prepare('INSERT OR REPLACE INTO agent_openclaw_skills (agent_id,skill_name,enabled) VALUES (?,?,1)');
      for (const name of skills) {
        if (name && typeof name === 'string') insert.run(agentId, name);
      }
    });
    tx();
    res.json({ code: 200, data: { ok: true } });
  } catch (e) {
    res.status(500).json({ code: 500, message: e.message });
  }
});

module.exports = router;
