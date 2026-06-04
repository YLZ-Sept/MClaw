// 渠道账号管理 — 绑定微信/企微/飞书/抖音
const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

// 解析 agent_id → agent_ids 数组（兼容旧单值格式）
function parseAgentIds(raw) {
  if (!raw) return []
  if (raw.startsWith('[')) {
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : [raw] } catch { return [raw] }
  }
  return [raw]
}

// 列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM channel_accounts ORDER BY created_at DESC').all();
  for (const r of rows) r.agent_ids = parseAgentIds(r.agent_id);
  res.json({ code: 200, data: rows });
});

// 详情
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ code: 404, message: '账号不存在' });
  row.agent_ids = parseAgentIds(row.agent_id);
  if (row.config) {
    try { const cfg = JSON.parse(row.config); if (cfg.app_secret) cfg.app_secret = '***'; row.config = JSON.stringify(cfg); } catch {}
  }
  res.json({ code: 200, data: row });
});

// 创建
router.post('/', (req, res) => {
  const { platform, account_name, agent_ids, agent_id, default_reply_mode, config } = req.body;
  if (!platform || !account_name) return res.status(400).json({ code: 400, message: 'platform 和 account_name 必填' });
  const ids = agent_ids || (agent_id ? [agent_id] : []);
  const id = randomUUID();
  db.prepare(`INSERT INTO channel_accounts (id,platform,account_name,agent_id,default_reply_mode,config)
    VALUES (?,?,?,?,?,?)`).run(id, platform, account_name, JSON.stringify(ids), default_reply_mode || 'manual', JSON.stringify(config || {}));
  res.json({ code: 200, data: { id, message: '渠道账号创建成功' } });
});

// 更新
router.put('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM channel_accounts WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '账号不存在' });
  const { platform, account_name, agent_ids, agent_id, default_reply_mode, config, status } = req.body;
  let newAgentId = cur.agent_id;
  if (agent_ids !== undefined) {
    newAgentId = JSON.stringify(agent_ids);
  } else if (agent_id !== undefined) {
    newAgentId = JSON.stringify([agent_id]);
  }
  db.prepare(`UPDATE channel_accounts SET platform=?,account_name=?,agent_id=?,default_reply_mode=?,config=?,status=? WHERE id=?`)
    .run(
      platform ?? cur.platform, account_name ?? cur.account_name,
      newAgentId, default_reply_mode ?? cur.default_reply_mode,
      config ? JSON.stringify(config) : cur.config, status ?? cur.status,
      req.params.id
    );
  if (status === 'inactive') {
    try { require('../channels/index').kickSocket(req.params.id); } catch {}
  }
  res.json({ code: 200, data: { message: '更新成功' } });
});

// 删除（级联删除关联会话及消息）
router.delete('/:id', (req, res) => {
  const convs = db.prepare('SELECT id FROM channel_conversations WHERE account_id=?').all(req.params.id);
  for (const c of convs) {
    db.prepare('DELETE FROM channel_messages WHERE conversation_id=?').run(c.id);
  }
  db.prepare('DELETE FROM channel_conversations WHERE account_id=?').run(req.params.id);
  db.prepare('DELETE FROM channel_accounts WHERE id=?').run(req.params.id);
  res.json({ code: 200, data: { message: '已删除' } });
});

module.exports = router;
