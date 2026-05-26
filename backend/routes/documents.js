const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');

const router = Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 迁移：内容字段
try { db.exec('ALTER TABLE documents ADD COLUMN content TEXT DEFAULT \'\''); } catch {}

// ── 格式与大小限制（与知识库一致） ──
const BIG_EXTS = ['pdf', 'doc', 'docx', 'ppt', 'mhtml', 'pptx', 'wps', 'ppsx'];
const MID_EXTS = ['keynote', 'pages', 'jpg', 'png', 'jpeg', 'tiff', 'bmp', 'gif'];
const SMALL_EXTS = ['xlsx', 'xls', 'csv', 'md', 'txt', 'html', 'xmind', 'json', 'xml', 'log', 'numbers'];
const ALL_EXTS = [...BIG_EXTS, ...MID_EXTS, ...SMALL_EXTS];

function getLimit(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (BIG_EXTS.includes(ext)) return 200 * 1024 * 1024;
  if (MID_EXTS.includes(ext)) return 50 * 1024 * 1024;
  if (SMALL_EXTS.includes(ext)) return 20 * 1024 * 1024;
  return 50 * 1024 * 1024;
}

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
    if (ALL_EXTS.includes(ext)) return cb(null, true);
    cb(new Error(`不支持的文件类型: .${ext}`));
  }
});

// ── 文本提取（与 doc-import.js 相同的解析管道） ──
function extractText(filePath, ext) {
  const content = { text: '', tables: [], error: null };
  try {
    switch (ext) {
      case 'pdf': {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse(new Uint8Array(fs.readFileSync(filePath)));
        return parser.load().then(() => parser.getText()).then(result => {
          content.text = (result.pages || []).map(p => p.text || '').join('\n');
          return content;
        });
      }
      case 'docx': {
        const buf = fs.readFileSync(filePath);
        return require('mammoth').extractRawText({ buffer: buf }).then(r => {
          content.text = r.value || '';
          return content;
        });
      }
      case 'xlsx':
      case 'xls':
      case 'csv': {
        const XLSX = require('xlsx');
        const wb = XLSX.readFile(filePath, { type: 'file' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const limited = data.slice(0, 10000).map(row => (Array.isArray(row) ? row : [row]).slice(0, 100));
        content.text = limited.map(r => r.join('\t')).join('\n');
        return Promise.resolve(content);
      }
      case 'txt':
      case 'md':
      case 'html':
      case 'json':
      case 'xml':
      case 'log':
        content.text = fs.readFileSync(filePath, 'utf-8');
        return Promise.resolve(content);
      default:
        content.text = `[二进制文件: ${path.basename(filePath)}]`;
        return Promise.resolve(content);
    }
  } catch (e) {
    content.error = e.message;
    return Promise.resolve(content);
  }
}

// ── 上传并解析 ──
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件' });

  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const maxSize = getLimit(req.file.originalname);
  if (req.file.size > maxSize) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ code: 400, message: `文件大小超过限制 (${(maxSize / 1024 / 1024).toFixed(0)}MB)` });
  }

  const result = await extractText(req.file.path, ext);

  res.json({
    code: 200,
    data: {
      fileName: req.file.originalname,
      filePath: req.file.filename,
      text: result.text.slice(0, 100000),
      tables: result.tables || [],
      ext,
      size: req.file.size,
      error: result.error || null
    }
  });
});

// ── 保存文档（上传后确认） ──
router.post('/', (req, res) => {
  const { title, file_path, file_type, file_size, content, category, tags } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '标题必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO documents (id,title,file_path,file_type,file_size,content,category,tags) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, title, file_path || '', file_type || '', file_size || 0, content || '', category || '', tags || '');
  res.json({ code: 200, data: { id } });
});

// ── 列表（不含完整 content，只给前 200 字预览） ──
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT id, title, file_path, file_type, file_size, category, tags, created_at, substr(content,1,200) AS preview FROM documents ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

// ── 搜索（必须在 /:id 之前） ──
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ code: 200, data: [] });
  const list = db.prepare('SELECT id, title, file_path, file_type, file_size, category, tags, created_at, substr(content,1,200) AS preview FROM documents WHERE title LIKE ? OR content LIKE ? ORDER BY created_at DESC')
    .all(`%${q}%`, `%${q}%`);
  res.json({ code: 200, data: list });
});

// ── 详情（含完整内容） ──
router.get('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404, message: '文档不存在' });
  res.json({ code: 200, data: doc });
});

// ── 更新分类/标签 ──
router.put('/:id', (req, res) => {
  const { category, tags } = req.body;
  db.prepare('UPDATE documents SET category=COALESCE(?,category), tags=COALESCE(?,tags) WHERE id=?')
    .run(category, tags, req.params.id);
  res.json({ code: 200 });
});

// ── 删除 ──
router.delete('/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404 });
  const filePath = path.join(UPLOAD_DIR, doc.file_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM documents WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// ── 下载 ──
router.get('/download/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.id);
  if (!doc) return res.status(404).json({ code: 404 });
  const filePath = path.join(UPLOAD_DIR, doc.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ code: 404 });
  res.download(filePath, doc.title);
});

module.exports = router;
