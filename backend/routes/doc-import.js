const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const router = Router();

// ── 上传目录 ──
const uploadDir = path.join(__dirname, '..', 'uploads', 'knowledge');
fs.mkdirSync(uploadDir, { recursive: true });

// ── 文件大小限制映射 (bytes) ──
const SIZE_MAP = {
  big: 200 * 1024 * 1024,    // pdf, doc, docx, ppt, mhtml, pptx, wps, ppsx
  mid: 50 * 1024 * 1024,     // keynote, pages, jpg, png, jpeg, tiff, bmp, gif
  small: 20 * 1024 * 1024,   // xlsx, xls, csv, md, txt, html, xmind, json, xml, log, numbers
};

const BIG_EXTS = ['pdf', 'doc', 'docx', 'ppt', 'mhtml', 'pptx', 'wps', 'ppsx'];
const MID_EXTS = ['keynote', 'pages', 'jpg', 'png', 'jpeg', 'tiff', 'bmp', 'gif'];
const SMALL_EXTS = ['xlsx', 'xls', 'csv', 'md', 'txt', 'html', 'xmind', 'json', 'xml', 'log', 'numbers'];

function getLimit(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  if (BIG_EXTS.includes(ext)) return SIZE_MAP.big;
  if (MID_EXTS.includes(ext)) return SIZE_MAP.mid;
  if (SMALL_EXTS.includes(ext)) return SIZE_MAP.small;
  return SIZE_MAP.mid; // 默认 50MB
}

const storage = multer.diskStorage({
  destination: uploadDir,
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
    const allowed = [...BIG_EXTS, ...MID_EXTS, ...SMALL_EXTS];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

// ── 文本提取 ──
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
        // mammoth is sync in our usage
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
        const rows = [];
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        // 限制行/列
        const limited = data.slice(0, 30000).map(row => {
          const r = Array.isArray(row) ? row : [row];
          return r.slice(0, 180);
        });
        content.text = limited.map(r => r.join('\t')).join('\n');
        content.tables = [{ name: sheetName, rows: limited }];
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

// ── 网页内容抓取 ──
async function fetchWebContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MClaw-KB/1.0)' },
      signal: AbortSignal.timeout(15000)
    });
    const html = await res.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, iframe').remove();
    const title = $('title').text().trim() || url;
    const body = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 50000);
    return { title, content: body, url };
  } catch (e) {
    return { title: url, content: `抓取失败: ${e.message}`, url };
  }
}

// ── 上传单个文件 ──
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件' });
  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  const maxSize = getLimit(req.file.originalname);
  if (req.file.size > maxSize) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ code: 400, message: `文件大小超过限制 (${(maxSize/1024/1024).toFixed(0)}MB)` });
  }
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
  if (req.file.size > 15 * 1024 * 1024) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ code: 400, message: '文件大小不超过 15MB' });
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
