// 渠道会话管理 — 会话列表、消息记录、回复模式、手动回复
const { Router } = require('express');
const db = require('../db');
const { setConversationMode, setConversationAgent, sendReply, generateAIReply } = require('../channels/index');
const router = Router();

// 会话列表（支持按平台/状态/账号筛选，带未读排序）
router.get('/', (req, res) => {
  const { platform, status, account_id, page, limit } = req.query;
  let sql = 'SELECT * FROM channel_conversations WHERE 1=1';
  const params = [];
  if (platform) { sql += ' AND platform=?'; params.push(platform); }
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (account_id) { sql += ' AND account_id=?'; params.push(account_id); }
  sql += ' ORDER BY unread_count DESC, updated_at DESC';
  if (limit) {
    const p = parseInt(page) || 1;
    const l = parseInt(limit) || 20;
    sql += ` LIMIT ${l} OFFSET ${(p - 1) * l}`;
  }
  const rows = db.prepare(sql).all(...params);
  const total = db.prepare(sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) AS c FROM')
    .replace(/ ORDER BY.*/, '')).get(...params)?.c || 0;
  res.json({ code: 200, data: { list: rows, total } });
});

// 单个会话
router.get('/:id', (req, res) => {
  const conv = db.prepare('SELECT * FROM channel_conversations WHERE id=?').get(req.params.id);
  if (!conv) return res.status(404).json({ code: 404, message: '会话不存在' });
  res.json({ code: 200, data: conv });
});

// 获取会话消息
router.get('/:id/messages', (req, res) => {
  const { limit, before } = req.query;
  let sql = 'SELECT * FROM channel_messages WHERE conversation_id=?';
  const params = [req.params.id];
  if (before) { sql += ' AND created_at < ?'; params.push(before); }
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ` LIMIT ${parseInt(limit) || 50}`; }
  const rows = db.prepare(sql).all(...params);
  // 标记已读
  db.prepare('UPDATE channel_conversations SET unread_count=0 WHERE id=?').run(req.params.id);
  res.json({ code: 200, data: rows.reverse() });
});

// 设置回复模式
router.put('/:id/mode', (req, res) => {
  const { reply_mode } = req.body;
  if (!['auto', 'manual', 'assisted'].includes(reply_mode)) {
    return res.status(400).json({ code: 400, message: '回复模式必须是 auto/manual/assisted' });
  }
  const result = setConversationMode(req.params.id, reply_mode);
  res.json({ code: 200, data: result });
});

// 切换智能体
router.put('/:id/agent', (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ code: 400, message: 'agent_id 不能为空' });
  try {
    const result = setConversationAgent(req.params.id, agent_id);
    res.json({ code: 200, data: result });
  } catch (err) {
    res.status(400).json({ code: 400, message: err.message });
  }
});

// 手动回复（手动模式 / 协同模式确认发送）
router.post('/:id/reply', async (req, res) => {
  const { content, reply_mode } = req.body;
  if (!content) return res.status(400).json({ code: 400, message: '回复内容不能为空' });
  const msg = await sendReply(req.params.id, content, reply_mode || 'manual');
  res.json({ code: 200, data: msg });
});

// 重命名联系人
router.put('/:id/rename', (req, res) => {
  const { contact_name } = req.body;
  if (!contact_name) return res.status(400).json({ code: 400, message: 'contact_name 不能为空' });
  const conv = db.prepare('SELECT * FROM channel_conversations WHERE id=?').get(req.params.id);
  if (!conv) return res.status(404).json({ code: 404, message: '会话不存在' });
  db.prepare('UPDATE channel_conversations SET contact_name=? WHERE id=?').run(contact_name, req.params.id);
  res.json({ code: 200, data: { id: req.params.id, contact_name } });
});

// 删除会话及其所有消息
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM channel_messages WHERE conversation_id=?').run(req.params.id);
  db.prepare('DELETE FROM channel_conversations WHERE id=?').run(req.params.id);
  res.json({ code: 200, data: { message: '已删除' } });
});

// 获取 AI 建议（协同模式下预览，不自动发送）
router.post('/:id/suggest', async (req, res) => {
  const conv = db.prepare('SELECT * FROM channel_conversations WHERE id=?').get(req.params.id);
  if (!conv) return res.status(404).json({ code: 404, message: '会话不存在' });
  const suggestion = await generateAIReply(conv.id, conv.platform, conv.agent_id);
  if (suggestion) {
    // 暂存 AI 建议到最新 incoming 消息上
    const lastIncoming = db.prepare(
      'SELECT id FROM channel_messages WHERE conversation_id=? AND direction=? ORDER BY created_at DESC LIMIT 1'
    ).get(conv.id, 'incoming');
    if (lastIncoming) {
      db.prepare('UPDATE channel_messages SET ai_suggestion=? WHERE id=?').run(suggestion, lastIncoming.id);
    }
  }
  res.json({ code: 200, data: { suggestion } });
});

module.exports = router;
