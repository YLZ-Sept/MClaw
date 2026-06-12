const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'org-charts');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff', 'pdf', 'ppt', 'pptx', 'doc', 'docx', 'vsdx', 'xlsx', 'xls'];
const ALLOWED_MIME = [
  'image/png', 'image/jpeg', 'image/gif', 'image/bmp', 'image/tiff',
  'application/pdf',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-visio.drawing', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (ALLOWED_EXTS.includes(ext) || ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// 上传
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件' });

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const title = req.body.title || req.file.originalname.replace(/\.[^.]+$/, '');
  const id = randomUUID();

  db.prepare('INSERT INTO org_charts (id,title,file_path,file_type,file_size) VALUES (?,?,?,?,?)')
    .run(id, title, req.file.filename, ext, req.file.size);

  res.json({
    code: 200,
    data: { id, title, file_type: ext, file_size: req.file.size, fileName: req.file.originalname }
  });
});

// 列表
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM org_charts ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

// 下载
router.get('/download/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM org_charts WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404, message: '文件不存在' });
  const filePath = path.join(UPLOAD_DIR, doc.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ code: 404, message: '文件不存在' });
  res.download(filePath, doc.title + '.' + doc.file_type);
});

// 预览（图片直接返回，其他下载）
router.get('/preview/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM org_charts WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404, message: '文件不存在' });
  const filePath = path.join(UPLOAD_DIR, doc.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ code: 404, message: '文件不存在' });

  const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tiff'];
  if (imgExts.includes(doc.file_type)) {
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', tiff: 'image/tiff' };
    res.set('Content-Type', mimeMap[doc.file_type] || 'image/png');
    return fs.createReadStream(filePath).pipe(res);
  }
  // PDF inline
  if (doc.file_type === 'pdf') {
    res.set('Content-Type', 'application/pdf');
    return fs.createReadStream(filePath).pipe(res);
  }
  // 其他格式下载
  res.download(filePath, doc.title + '.' + doc.file_type);
});

// 删除
router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM org_charts WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404, message: '文件不存在' });
  const filePath = path.join(UPLOAD_DIR, doc.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM org_charts WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 用 Excel 导入部门数据（解析 xlsx 并调用 IO 批量导入）
router.post('/import-departments', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传 xlsx 文件' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ code: 400, message: '仅支持 .xlsx/.xls 格式' });
  }
  try {
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(req.file.path);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const config = require('./io-configs').departments;
    const cols = config.columns.filter(c => !c.templateExclude);
    let imported = 0;

    const insertStmt = db.prepare(`INSERT INTO departments (id,${cols.map(c => c.field).join(',')},created_at) VALUES (?,${cols.map(() => '?').join(',')},datetime('now','localtime'))`);

    const tx = db.transaction(() => {
      for (const row of rows) {
        const name = row['部门名'] || row['name'] || '';
        if (!name) continue;
        const id = randomUUID();
        const vals = cols.map(c => {
          const v = row[c.header] !== undefined ? row[c.header] : (row[c.field] || '');
          return c.required && !String(v).trim() ? name : String(v).trim();
        });
        insertStmt.run(id, ...vals);
        imported++;
      }
    });
    tx();
    fs.unlinkSync(req.file.path);
    res.json({ code: 200, data: { imported } });
  } catch (e) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ code: 500, message: '导入失败: ' + e.message });
  }
});

module.exports = router;
