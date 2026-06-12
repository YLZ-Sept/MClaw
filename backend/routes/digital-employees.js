const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const router = Router();

const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ storage: multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname))
}), limits: { fileSize: 5 * 1024 * 1024 } });

db.exec(`CREATE TABLE IF NOT EXISTS digital_employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '销售',
  agent_id TEXT,
  avatar_url TEXT,
  avatar_bg TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 尝试加列（兼容旧表）
try { db.exec('ALTER TABLE digital_employees ADD COLUMN avatar_url TEXT'); } catch {}
try { db.exec('ALTER TABLE digital_employees ADD COLUMN agent_ids TEXT'); } catch {}
try { db.exec('ALTER TABLE digital_employees ADD COLUMN avatar_emoji TEXT'); } catch {}

// 静态文件
router.use('/avatars', (req, res, next) => {
  if (req.path.includes('..')) return res.status(403).end();
  next();
}, require('express').static(uploadDir));

// 列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM digital_employees ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

// 新增
router.post('/', upload.single('avatar'), (req, res) => {
  const { name, role, agent_ids, avatar_bg, avatar_emoji } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '名称必填' });
  const id = randomUUID();
  const avatar_url = req.file ? '/api/digital-employees/avatars/' + req.file.filename : null;
  const ids = agent_ids || '';
  db.prepare('INSERT INTO digital_employees (id,name,role,agent_ids,avatar_url,avatar_bg,avatar_emoji) VALUES (?,?,?,?,?,?,?)')
    .run(id, name, role || '销售', ids, avatar_url, avatar_bg || '', avatar_emoji || '');
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/:id', upload.single('avatar'), (req, res) => {
  const { name, role, agent_ids, avatar_bg, avatar_emoji, avatar_url } = req.body;
  const ids = agent_ids || '';
  db.prepare('UPDATE digital_employees SET name=COALESCE(?,name), role=COALESCE(?,role), agent_ids=COALESCE(?,agent_ids), avatar_bg=COALESCE(?,avatar_bg), avatar_emoji=COALESCE(?,avatar_emoji) WHERE id=?')
    .run(name, role, ids, avatar_bg, avatar_emoji, req.params.id);
  if (req.file) {
    db.prepare('UPDATE digital_employees SET avatar_url=? WHERE id=?')
      .run('/api/digital-employees/avatars/' + req.file.filename, req.params.id);
  } else if (avatar_url !== undefined) {
    db.prepare('UPDATE digital_employees SET avatar_url=? WHERE id=?').run(avatar_url, req.params.id);
  }
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM digital_employees WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
