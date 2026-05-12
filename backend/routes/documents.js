const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const id = randomUUID();
    const ext = path.extname(file.originalname);
    cb(null, id + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '未上传文件' });
  const id = randomUUID();
  const { originalname, filename, mimetype, size } = req.file;
  db.prepare('INSERT INTO documents (id,title,file_path,file_type,file_size) VALUES (?,?,?,?,?)')
    .run(id, originalname, filename, mimetype, size);
  res.json({ code: 200, data: { id, name: originalname } });
});

router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all();
  // 不返回文件路径直接下载
  res.json({ code: 200, data: list });
});

router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404 });
  const filePath = path.join(UPLOAD_DIR, doc.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM documents WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ code: 200, data: [] });
  // 简单模糊搜索（后续可升级为 ChromaDB 向量搜索）
  const list = db.prepare('SELECT * FROM documents WHERE title LIKE ? ORDER BY created_at DESC')
    .all(`%${q}%`);
  res.json({ code: 200, data: list });
});

router.get('/download/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404 });
  const filePath = path.join(UPLOAD_DIR, doc.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ code: 404 });
  res.download(filePath, doc.title);
});

module.exports = router;
