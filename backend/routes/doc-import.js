const { Router } = require('express');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const router = Router();

// ── 上传目录 ──
const uploadDir = path.join(__dirname, '..', 'uploads', 'knowledge');
fs.mkdirSync(uploadDir, { recursive: true });

// ── 允许的扩展名 ──
const ALLOWED_EXTS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'ppsx', 'mhtml', 'wps',
  'xlsx', 'xls', 'csv', 'md', 'txt', 'html', 'json', 'xml', 'log',
  'keynote', 'pages', 'numbers', 'xmind',
  'jpg', 'png', 'jpeg', 'tiff', 'bmp', 'gif'
]);

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

// ── 带编码检测的文本读取 ──
function readTextFile(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length === 0) return '';
  const detected = jschardet.detect(buf);
  if (detected.encoding && detected.encoding !== 'UTF-8' && detected.encoding !== 'ascii') {
    try { return iconv.decode(buf, detected.encoding); } catch {}
  }
  return buf.toString('utf-8');
}

// ── 文本提取 ──
async function extractText(filePath, ext) {
  const content = { text: '', tables: [], error: null };
  try {
    switch (ext) {
      case 'pdf': {
        const { PDFParse } = require('pdf-parse');
        const parser = new PDFParse(new Uint8Array(fs.readFileSync(filePath)));
        const result = await parser.load().then(() => parser.getText());
        content.text = (result.pages || []).map(p => p.text || '').join('\n');
        break;
      }
      case 'doc': {
        const WordExtractor = require('word-extractor');
        const extractor = new WordExtractor();
        const doc = await extractor.extract(filePath);
        content.text = doc.getBody();
        break;
      }
      case 'docx': {
        const buf = fs.readFileSync(filePath);
        const r = await require('mammoth').extractRawText({ buffer: buf });
        content.text = r.value || '';
        break;
      }
      case 'pptx':
      case 'ppsx':
      case 'ppt': {
        // pptx/ppsx 是 ZIP 包，ppt 旧格式尝试同样处理
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        const slides = [];
        for (const entry of entries) {
          const name = entry.entryName;
          if (/ppt\/slides\/slide\d+\.xml/.test(name)) {
            const xml = entry.getData().toString('utf-8');
            const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
              .map(m => m[1].trim()).filter(Boolean);
            if (texts.length) slides.push(texts.join(' '));
          }
        }
        if (slides.length) {
          content.text = slides.join('\n\n');
        } else {
          content.error = '未检测到幻灯片文本（旧版 .ppt 暂不支持）';
        }
        break;
      }
      case 'xlsx':
      case 'xls':
      case 'csv': {
        const XLSX = require('xlsx');
        const wb = XLSX.readFile(filePath, { type: 'file' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const limited = data.slice(0, 30000).map(row => {
          const r = Array.isArray(row) ? row : [row];
          return r.slice(0, 180);
        });
        content.text = limited.map(r => r.join('\t')).join('\n');
        content.tables = [{ name: sheetName, rows: limited }];
        break;
      }
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'bmp':
      case 'tiff':
      case 'gif': {
        // OCR 图片文字提取
        try {
          const Tesseract = require('tesseract.js');
          const { data } = await Tesseract.recognize(filePath, 'chi_sim+eng', {
            logger: () => {} // 静默
          });
          content.text = (data.text || '').trim();
          if (!content.text) {
            content.text = `[图片文件: ${path.basename(filePath)}]`;
          }
        } catch (ocrErr) {
          content.text = `[图片文件: ${path.basename(filePath)}，OCR 失败: ${ocrErr.message}]`;
          content.error = ocrErr.message;
        }
        break;
      }
      case 'txt':
      case 'md':
      case 'html':
      case 'json':
      case 'xml':
      case 'log':
        content.text = readTextFile(filePath);
        break;

      default:
        content.text = `[未支持格式: ${path.basename(filePath)}]`;
    }
  } catch (e) {
    content.error = e.message;
  }
  return content;
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
