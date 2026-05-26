const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS agent_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  desc TEXT,
  agent_id TEXT,
  tools TEXT,
  prompt_snippet TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 获取某 Agent 的技能列表
router.get('/', (req, res) => {
  const { agent_id } = req.query;
  let sql = 'SELECT * FROM agent_skills WHERE 1=1';
  const params = [];
  if (agent_id) { sql += ' AND (agent_id=? OR agent_id IS NULL OR agent_id=\'\')'; params.push(agent_id); }
  sql += ' ORDER BY created_at DESC';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// 新增
router.post('/', (req, res) => {
  const { name, desc, agent_id, tools, prompt_snippet } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '名称必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO agent_skills (id,name,desc,agent_id,tools,prompt_snippet) VALUES (?,?,?,?,?,?)')
    .run(id, name, desc || '', agent_id || '', tools || '', prompt_snippet || '');
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/:id', (req, res) => {
  const { name, desc, agent_id, tools, prompt_snippet, status } = req.body;
  db.prepare(`UPDATE agent_skills SET
    name=COALESCE(?,name), desc=COALESCE(?,desc), agent_id=COALESCE(?,agent_id),
    tools=COALESCE(?,tools), prompt_snippet=COALESCE(?,prompt_snippet), status=COALESCE(?,status)
    WHERE id=?`).run(name, desc, agent_id, tools, prompt_snippet, status, req.params.id);
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM agent_skills WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
