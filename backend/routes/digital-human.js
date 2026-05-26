const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

// 确保表存在
db.exec(`CREATE TABLE IF NOT EXISTS digital_human_records (
  id TEXT PRIMARY KEY,
  avatar TEXT,
  avatar_name TEXT,
  text TEXT,
  video_url TEXT,
  status TEXT DEFAULT 'processing',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 生成（mock，后续替换为真实 API 调用）
router.post('/generate', (req, res) => {
  const { avatar, text } = req.body;
  if (!text) return res.status(400).json({ code: 400, message: '文案不能为空' });

  const avatarMap = {
    'male-1': '商务男-A', 'male-2': '技术男-B',
    'female-1': '职场女-A', 'female-2': '主播女-B'
  };
  const id = randomUUID();
  db.prepare(`INSERT INTO digital_human_records (id, avatar, avatar_name, text) VALUES (?,?,?,?)`)
    .run(id, avatar, avatarMap[avatar] || avatar, text);

  // mock: 2 秒后自动标记完成
  setTimeout(() => {
    db.prepare(`UPDATE digital_human_records SET status='done', video_url=? WHERE id=?`)
      .run(`/api/digital-human/video/${id}`, id);
  }, 2000);

  res.json({ code: 200, data: { id } });
});

// 记录列表
router.get('/records', (req, res) => {
  const rows = db.prepare('SELECT * FROM digital_human_records ORDER BY created_at DESC LIMIT 50').all();
  res.json({ code: 200, data: rows });
});

// 删除记录
router.delete('/records/:id', (req, res) => {
  db.prepare('DELETE FROM digital_human_records WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
