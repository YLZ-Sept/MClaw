const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { ALLOWED_EXTS, readTextFile, extractText, fetchWebContent } = require('../services/document-parser');
const router = Router();

// ── 上传目录 ──
const uploadDir = path.join(__dirname, '..', 'uploads', 'knowledge');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// ── 上传单个文件 ──
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件或文件格式不支持' });
  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const result = await extractText(req.file.path, ext);
  res.json({
    code: 200,
    data: {
      fileName: req.file.originalname,
      filePath: '/api/doc-import/files/' + req.file.filename,
      text: result.text.slice(0, 100000),
      tables: result.tables || [],
      ext,
      size: req.file.size,
      error: result.error || null
    }
  });
});

// ── 批量上传文件 ──
router.post('/upload-batch', upload.array('files', 50), async (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ code: 400, message: '请选择文件' });
  const results = [];
  for (const file of req.files) {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const result = await extractText(file.path, ext);
    results.push({
      fileName: file.originalname,
      filePath: '/api/doc-import/files/' + file.filename,
      text: result.text.slice(0, 100000),
      tables: result.tables || [],
      ext,
      size: file.size,
      error: result.error || null
    });
  }
  res.json({ code: 200, data: results });
});

// ── 抓取网页 ──
router.post('/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ code: 400, message: 'URL 必填' });
  const data = await fetchWebContent(url);
  res.json({ code: 200, data });
});

// ── 批量导入 URL（xlsx 上传） ──
router.post('/batch-urls', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传 xlsx 文件' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext !== '.xlsx') {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ code: 400, message: '仅支持 .xlsx 格式' });
  }
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(req.file.path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const urls = [];
  for (let i = 1; i < Math.min(data.length, 501); i++) {
    const row = data[i];
    if (!row || !row[0]) continue;
    const url = String(row[0]).trim();
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      urls.push(url);
    }
  }
  fs.unlinkSync(req.file.path);
  if (urls.length === 0) return res.status(400).json({ code: 400, message: '未检测到有效网址（需以 http:// 或 https:// 开头）' });
  res.json({ code: 200, data: { urls } });
});

// ── 下载批量导入模板 ──
router.get('/template', (req, res) => {
  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['网址'], ['https://example.com/article1'], ['https://example.com/article2']]);
  XLSX.utils.book_append_sheet(wb, ws, '网址列表');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename=kb_url_template.xlsx'
  });
  res.send(buf);
});

// ── 静态文件访问 ──
router.use('/files', (req, res, next) => {
  if (req.path.includes('..')) return res.status(403).end();
  next();
}, require('express').static(uploadDir));

module.exports = router;
