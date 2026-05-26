const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '新会话',
  agent_id TEXT,
  employee_id TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
)`);

db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 会话列表
router.get('/', (req, res) => {
  const { agent_id, employee_id } = req.query;
  let sql = 'SELECT * FROM chat_sessions WHERE 1=1';
  const params = [];
  if (agent_id) { sql += ' AND agent_id=?'; params.push(agent_id); }
  if (employee_id) { sql += ' AND employee_id=?'; params.push(employee_id); }
  sql += ' ORDER BY updated_at DESC';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// 获取单个会话
router.get('/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM chat_sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ code: 404, message: '会话不存在' });
  res.json({ code: 200, data: s });
});

// 新建会话
router.post('/', (req, res) => {
  const { name, agent_id, employee_id } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO chat_sessions (id,name,agent_id,employee_id) VALUES (?,?,?,?)')
    .run(id, name || '新会话', agent_id || '', employee_id || '');
  res.json({ code: 200, data: { id } });
});

// 重命名
router.put('/:id', (req, res) => {
  const { name } = req.body;
  db.prepare('UPDATE chat_sessions SET name=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?')
    .run(name, req.params.id);
  res.json({ code: 200 });
});

// 删除会话（级联删除消息）
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM chat_messages WHERE session_id=?').run(req.params.id);
  db.prepare('DELETE FROM chat_sessions WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 清空会话消息（保留会话）
router.delete('/:id/messages', (req, res) => {
  db.prepare('DELETE FROM chat_messages WHERE session_id=?').run(req.params.id);
  db.prepare('UPDATE chat_sessions SET updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 获取会话消息
router.get('/:id/messages', (req, res) => {
  const msgs = db.prepare('SELECT * FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 100').all(req.params.id);
  res.json({ code: 200, data: msgs });
});

module.exports = router;
