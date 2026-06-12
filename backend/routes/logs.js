const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = Router();

// 写入日志（供其他模块调用）
function addLog(type, action, detail, username, ip) {
  try {
    db.prepare('INSERT INTO logs (id, type, action, detail, username, ip) VALUES (?,?,?,?,?,?)')
      .run(crypto.randomUUID(), type, action, detail || '', username || '', ip || '');
  } catch { /* 日志写入失败不应影响业务 */ }
}

// 日志查询（需登录，由 server.js 挂载时加 requireAuth）
router.get('/', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;
  const filter = req.query.type || '';

  let where = '';
  const params = [];
  if (filter && ['info','success','warning','danger'].includes(filter)) {
    where = 'WHERE type = ?';
    params.push(filter);
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM logs ${where}`).get(...params).c;
  const logs = db.prepare(`SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset);

  res.json({
    code: 200,
    data: { total, page, limit, logs },
  });
});

// 保留最近 N 天日志，供定时清理
router.delete('/cleanup', (req, res) => {
  const days = parseInt(req.body?.days) || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const info = db.prepare('DELETE FROM logs WHERE created_at < ?').run(cutoff);
  res.json({ code: 200, message: `已清理 ${info.changes} 条日志`, data: { deleted: info.changes } });
});

router.addLog = addLog;
module.exports = router;
