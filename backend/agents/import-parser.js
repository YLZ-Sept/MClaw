// FAQ 多格式导入解析器 — Excel / Word / PDF / Markdown
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

// 从纯文本中提取 Q&A 对
function extractQA(text, filename) {
  const pairs = [];

  // 风格A: Q: ... A: ... 或 问：... 答：...
  const qaRegex = /(?:^|\n)\s*(?:Q[：:.\s]|问[：:.\s]|问题[：:.\s])\s*(.+?)(?:\n\s*(?:A[：:.\s]|答[：:.\s]|答案[：:.\s])\s*([\s\S]*?))(?=\n\s*(?:Q[：:.\s]|问[：:.\s]|问题[：:.\s]|$))/gi;
  let match;
  while ((match = qaRegex.exec(text)) !== null) {
    pairs.push({ question: match[1].trim(), answer: (match[2] || '').trim() });
  }

  if (pairs.length > 0) return pairs;

  // 风格B: ## 标题 / **粗体** 作为问题，后续段落作为答案
  const headingRegex = /(?:^|\n)(?:#{2,3}\s*|(?:\*\*|__)(.+?)(?:\*\*|__)\s*\n)(.+?)(?=\n(?:#{2,3}\s*|\*\*|__)|\n*$)/g;
  while ((match = headingRegex.exec(text)) !== null) {
    const question = (match[1] || match[2] || '').trim();
    const answer = (match[3] || match[2] || '').trim();
    if (question && answer) pairs.push({ question, answer });
  }

  if (pairs.length > 0) return pairs;

  // 兜底: 整个文档作为一个 FAQ
  const cleanText = text.trim();
  if (cleanText.length > 10) {
    const name = filename.replace(/\.[^.]+$/, '');
    pairs.push({ question: name, answer: cleanText.slice(0, 5000) });
  }

  return pairs;
}

// Excel 解析
function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(r => ({
    question: r.question || r.问题 || r.Q || '',
    answer: r.answer || r.答案 || r.A || '',
    category: r.category || r.分类 || r.cat || '通用',
    similar_questions: r.similar_questions || r.相似问 || r.similar || '',
    notes: r.notes || r.备注 || r.note || ''
  })).filter(r => r.question && r.answer);
}

// Word 解析
async function parseWord(buffer) {
  const { value } = await mammoth.extractRawText({ buffer });
  return extractQA(value, 'word-import.docx');
}

// PDF 解析
async function parsePDF(buffer) {
  const data = await pdfParse(buffer);
  return extractQA(data.text, 'pdf-import.pdf');
}

// Markdown 解析
function parseMarkdown(text) {
  const pairs = [];

  // ## 标题 + 内容
  const blocks = text.split(/^##\s+/gm).filter(b => b.trim());
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const question = lines[0].replace(/^#+\s*/, '').trim();
    const answer = lines.slice(1).join('\n').trim();
    if (question && answer) pairs.push({ question, answer });
  }

  return pairs.length > 0 ? pairs : extractQA(text, 'markdown-import.md');
}

// 主入口: 根据文件扩展名和 buffer 解析
async function parse(buffer, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();

  switch (ext) {
    case 'xlsx':
    case 'xls':
      return { type: 'excel', items: parseExcel(buffer) };

    case 'docx':
    case 'doc':
      return { type: 'word', items: await parseWord(buffer) };

    case 'pdf':
      return { type: 'pdf', items: await parsePDF(buffer) };

    case 'md':
    case 'txt':
      return { type: 'markdown', items: parseMarkdown(buffer.toString('utf-8')) };

    default:
      throw new Error(`不支持的文件格式: .${ext}`);
  }
}

module.exports = { parse, extractQA };
