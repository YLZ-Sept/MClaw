const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '新会话',
  agent_id TEXT,
  employee_id TEXT,
  user_id TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 兼容旧表
try { db.exec('ALTER TABLE chat_sessions ADD COLUMN user_id TEXT'); } catch {}

db.exec(`CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_name TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 会话列表 — 仅查看自己的会话
router.get('/', (req, res) => {
  const { agent_id, employee_id } = req.query;
  const userId = req.user?.id;
  let sql = 'SELECT * FROM chat_sessions WHERE user_id=?';
  const params = [userId];
  if (agent_id) { sql += ' AND agent_id=?'; params.push(agent_id); }
  if (employee_id) { sql += ' AND employee_id=?'; params.push(employee_id); }
  sql += ' ORDER BY updated_at DESC';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

function getOwnedSession(id, userId) {
  return db.prepare('SELECT * FROM chat_sessions WHERE id=? AND user_id=?').get(id, userId);
}

// 获取单个会话
router.get('/:id', (req, res) => {
  const s = getOwnedSession(req.params.id, req.user?.id);
  if (!s) return res.status(404).json({ code: 404, message: '会话不存在' });
  res.json({ code: 200, data: s });
});

// 新建会话
router.post('/', (req, res) => {
  const { name, agent_id, employee_id } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO chat_sessions (id,name,agent_id,employee_id,user_id) VALUES (?,?,?,?,?)')
    .run(id, name || '新会话', agent_id || '', employee_id || '', req.user?.id);
  res.json({ code: 200, data: { id } });
});

// 重命名
router.put('/:id', (req, res) => {
  const s = getOwnedSession(req.params.id, req.user?.id);
  if (!s) return res.status(404).json({ code: 404, message: '会话不存在' });
  const { name } = req.body;
  db.prepare("UPDATE chat_sessions SET name=?, updated_at=datetime('now','localtime') WHERE id=?")
    .run(name, req.params.id);
  res.json({ code: 200 });
});

// 删除会话
router.delete('/:id', async (req, res) => {
  const s = getOwnedSession(req.params.id, req.user?.id);
  if (!s) return res.status(404).json({ code: 404, message: '会话不存在' });
  db.prepare('DELETE FROM chat_messages WHERE session_id=?').run(req.params.id);
  db.prepare('DELETE FROM chat_sessions WHERE id=?').run(req.params.id);
  // 通过 WebSocket RPC 通知 OpenClaw 删除对应会话
  try {
    const wsClient = require('../openclaw/ws-client');
    // 等待 WS 连接就绪（最多等 3 秒）
    for (let i = 0; i < 10 && !wsClient.isConnected(); i++) {
      await new Promise(r => setTimeout(r, 300));
    }
    if (!wsClient.isConnected()) {
      console.log('[chat-sessions] OpenClaw WS not connected, skip delete sync for', req.params.id);
    } else {
      const sessionKey = `agent:main:openai-user:${req.params.id}`;
      const result = await wsClient.request('sessions.delete', { key: sessionKey, deleteTranscript: true });
      if (result && !result.deleted) {
        console.log('[chat-sessions] OpenClaw session key not found:', sessionKey);
      }
    }
  } catch (e) {
    console.log('[chat-sessions] OpenClaw session delete error:', e.message);
  }
  res.json({ code: 200 });
});

// 清空会话消息
router.delete('/:id/messages', (req, res) => {
  const s = getOwnedSession(req.params.id, req.user?.id);
  if (!s) return res.status(404).json({ code: 404, message: '会话不存在' });
  db.prepare('DELETE FROM chat_messages WHERE session_id=?').run(req.params.id);
  db.prepare("UPDATE chat_sessions SET updated_at=datetime('now','localtime') WHERE id=?").run(req.params.id);
  res.json({ code: 200 });
});

// 获取会话消息
router.get('/:id/messages', (req, res) => {
  const s = getOwnedSession(req.params.id, req.user?.id);
  if (!s) return res.status(404).json({ code: 404, message: '会话不存在' });
  const msgs = db.prepare('SELECT * FROM chat_messages WHERE session_id=? ORDER BY created_at ASC LIMIT 100').all(req.params.id);
  res.json({ code: 200, data: msgs });
});

module.exports = router;
