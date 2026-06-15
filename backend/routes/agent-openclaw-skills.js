// Agent 绑定的 OpenClaw 技能管理
const { Router } = require('express');
const db = require('../db');
const wsClient = require('../openclaw/ws-client');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS agent_openclaw_skills (
  agent_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (agent_id, skill_name)
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
    const skills = (result.skills || []).filter(s => !s.disabled).map(s => ({
      name: s.name,
      description: s.description || '',
      skillKey: s.skillKey,
      source: s.source,
      filePath: s.filePath,
      baseDir: s.baseDir
    }));
    res.json({ code: 200, data: skills });
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
