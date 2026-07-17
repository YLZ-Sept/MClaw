// 共享文档解析模块 — doc-import.js 和 wiki.js 共用
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const ALLOWED_EXTS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'ppsx', 'mhtml', 'wps',
  'xlsx', 'xls', 'csv', 'md', 'txt', 'html', 'json', 'xml', 'log',
  'keynote', 'pages', 'numbers', 'xmind',
  'jpg', 'png', 'jpeg', 'tiff', 'bmp', 'gif'
]);

// 带编码检测的文本读取
function readTextFile(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length === 0) return '';
  const detected = jschardet.detect(buf);
  if (detected.encoding && detected.encoding !== 'UTF-8' && detected.encoding !== 'ascii') {
    try { return iconv.decode(buf, detected.encoding); } catch {}
  }
  return buf.toString('utf-8');
}

// 文本提取
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
        content.text = doc.getBody() || '';
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
        try {
          const Tesseract = require('tesseract.js');
          const { data } = await Tesseract.recognize(filePath, 'chi_sim+eng', {
            logger: m => { if (m.status === 'error') console.log('[tesseract]', m); }
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

// 网页内容抓取
async function fetchWebContent(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MClaw-Wiki/1.0)' },
      signal: AbortSignal.timeout(15000)
    });
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return { title: url, content: `不支持的内容类型: ${contentType}`, url };
    }
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

module.exports = { ALLOWED_EXTS, readTextFile, extractText, fetchWebContent };
