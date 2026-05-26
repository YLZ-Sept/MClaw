const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const multer = require('multer');
const { getActiveConfig } = require('./model-configs');
const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 按月查询 ──
router.get('/reports', (req, res) => {
  const { month } = req.query;
  let sql = 'SELECT * FROM performance_reports';
  const params = [];
  if (month) { sql += ' WHERE month=?'; params.push(month); }
  sql += ' ORDER BY employee_name';
  const list = db.prepare(sql).all(...params);
  list.forEach(r => { try { r.dims = JSON.parse(r.dims); } catch { r.dims = []; } });
  res.json({ code: 200, data: list });
});

// ── 删除 ──
router.delete('/reports/:id', (req, res) => {
  db.prepare('DELETE FROM performance_reports WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// ── 批量入库 ──
router.post('/batch', (req, res) => {
  const { month, records } = req.body;
  if (!month || !records || !records.length) return res.status(400).json({ code: 400, message: '参数不全' });

  // 先删当月旧数据再插入
  db.prepare('DELETE FROM performance_reports WHERE month=?').run(month);

  let count = 0;
  const tx = db.transaction(() => {
    for (const r of records) {
      const id = randomUUID();
      const total = r.total_score != null ? r.total_score : 0;
      const dims = JSON.stringify(r.dims || []);
      db.prepare(`INSERT INTO performance_reports (id,employee_name,department,position,month,dims,total_score)
        VALUES (?,?,?,?,?,?,?)`)
        .run(id, r.employee_name || '', r.department || '', r.position || '', month, dims, total);
      count++;
    }
  });
  tx();
  res.json({ code: 200, data: { imported: count } });
});

// ── 导入解析（预览） ──
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' });

  const ext = require('path').extname(req.file.originalname).toLowerCase();
  const month = req.body.month || new Date().toISOString().slice(0, 7);
  let dims = [], records = [];

  try {
    if (ext === '.xlsx' || ext === '.xls') {
      ({ dims, records } = parseExcel(req.file.buffer, month));
    } else {
      // 非 Excel：提取文本后调 AI 解析
      const text = await extractText(req.file.buffer, ext);
      ({ dims, records } = await aiParse(text, month));
    }

    if (!records.length) return res.status(400).json({ code: 400, message: '未能解析出考核数据，请检查文件内容' });

    res.json({ code: 200, data: { month, dims, records } });
  } catch (e) {
    console.error('[perf-import]', e.message);
    res.status(500).json({ code: 500, message: '解析失败: ' + e.message });
  }
});

// ── 导出 Excel ──
router.get('/export', (req, res) => {
  const { month } = req.query;
  const m = month || new Date().toISOString().slice(0, 7);
  const list = db.prepare('SELECT * FROM performance_reports WHERE month=? ORDER BY employee_name').all(m);

  const XLSX = require('xlsx');
  const headers = ['姓名', '部门', '职位', '月份', '总分'];
  // 收集所有维度名
  const allDims = new Map();
  list.forEach(r => {
    let d = [];
    try { d = JSON.parse(r.dims); } catch {}
    d.forEach(dd => { if (!allDims.has(dd.name)) allDims.set(dd.name, dd.weight); });
  });

  const dimNames = [...allDims.keys()];
  dimNames.forEach(n => headers.push(n + '(' + allDims.get(n) + '%)'));

  const rows = [headers];
  list.forEach(r => {
    let d = [];
    try { d = JSON.parse(r.dims); } catch {}
    const row = [r.employee_name, r.department, r.position, r.month, r.total_score];
    dimNames.forEach(n => {
      const dd = d.find(x => x.name === n);
      row.push(dd ? dd.score : '');
    });
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '绩效考核');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="绩效考核_${m}.xlsx"`);
  res.send(buf);
});

// ─── 文件解析 ───

function parseExcel(buf, month) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (data.length < 3) throw new Error('文件行数不足');

  // 查找包含维度名+权重的行（如 "工作效率（20%）"）
  let headerRow = -1, nameCol = -1, deptCol = -1, posCol = -1, monthCol = -1, dimCols = [];
  for (let r = 0; r < Math.min(data.length, 5); r++) {
    const row = (data[r] || []).map(c => String(c || '').trim());
    let dimCount = 0;
    const cols = [];
    for (let c = 0; c < row.length; c++) {
      const m = row[c].match(/(.+?)[（(](\d+)[%％][）)]/);
      if (m) { dimCount++; cols.push({ col: c, name: m[1], weight: parseInt(m[2]) }); }
      if (row[c].includes('姓名') || row[c] === '员工') nameCol = c;
      if (row[c].includes('部门')) deptCol = c;
      if (row[c].includes('职位') || row[c].includes('职务')) posCol = c;
      if (row[c].includes('月份') || row[c].includes('考核月份')) monthCol = c;
    }
    if (dimCount >= 2) { headerRow = r; dimCols = cols; break; }
  }
  if (dimCols.length === 0) throw new Error('未识别到维度列（如"工作效率（20%）"）');

  // 如果没找到姓名/部门列，用默认映射（前几列）
  if (nameCol < 0) nameCol = 0;
  if (deptCol < 0) deptCol = 1;
  if (posCol < 0) posCol = 2;

  const dims = dimCols.map(d => ({ name: d.name, weight: d.weight }));
  const records = [];
  const parseNum = v => { if (v === '' || v === undefined || v === null) return null; const n = parseFloat(v); return isNaN(n) ? null : n; };

  for (let r = headerRow + 1; r < data.length; r++) {
    const row = data[r];
    if (!row || !row[nameCol] || String(row[nameCol]).trim() === '') continue;
    const name = String(row[nameCol]).trim();
    if (name === '姓名' || name === '员工') continue;
    const scores = dimCols.map(d => ({ ...d, score: parseNum(row[d.col]) || 0 }));
    const weightedTotal = scores.reduce((s, d) => s + d.score * d.weight / 100, 0);
    records.push({
      employee_name: name,
      department: String(row[deptCol] || '').trim(),
      position: String(row[posCol] || '').trim(),
      dims: scores,
      total_score: Math.round(weightedTotal * 10) / 10
    });
  }

  return { dims, records };
}

// ─── 文本提取 ───

async function extractText(buf, ext) {
  if (ext === '.docx' || ext === '.doc') {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }
  if (ext === '.pdf') {
    const PDFParse = require('pdf-parse');
    const pdf = new PDFParse(new Uint8Array(buf));
    await pdf.load();
    const pages = await pdf.getText();
    return (pages?.pages || []).map(p => p.text).join('\n');
  }
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(ext)) {
    // 图片转 base64，交给 AI 多模态解析
    const base64 = buf.toString('base64');
    const mime = ext === '.jpg' ? 'jpeg' : ext.replace('.', '');
    return `data:image/${mime};base64,${base64}`;
  }
  // 纯文本
  return buf.toString('utf-8');
}

// ─── AI 解析 ───

async function aiParse(text, month) {
  const config = getActiveConfig();
  if (!config) throw new Error('没有活跃的模型配置');

  const isImage = typeof text === 'string' && text.startsWith('data:');

  // 检测模型是否支持多模态
  const multimodalProviders = ['xiaomi', 'anthropic', 'zhipu', 'qwen', 'doubao'];
  if (isImage && !multimodalProviders.includes(config.provider)) {
    throw new Error('当前模型 ' + config.model + ' 不支持图片识别，请使用 Excel 格式导入，或切换到支持多模态的模型（小米/Claude/智谱/通义/豆包）');
  }

  const employees = db.prepare('SELECT name, department, role FROM employees ORDER BY name').all();

  const systemPrompt = `你是一个数据提取助手。请从${isImage ? '图片' : '文档'}中提取绩效考核数据。
返回一个 JSON 对象，格式如下：
{
  "dims": [{"name":"维度名","weight":权重数字}],
  "records": [{"employee_name":"员工姓名","department":"部门","position":"职位","dims":[{"name":"维度名","weight":权重,"score":分数}]}]
}

注意：
- 维度名称和权重从表头识别（如"工作效率（20%）"表示 name=工作效率, weight=20）
- 每条记录必须包含 total_score（所有维度 score * weight / 100 的加权总和）
- 员工姓名尽量匹配以下已有员工：${JSON.stringify(employees.map(e => e.name))}
- 如果没有部门信息，根据已有员工信息推测：${JSON.stringify(employees)}
- 只返回 JSON，不要加任何说明文字`;

  const messages = isImage
    ? [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: text } },
        { type: 'text', text: '请提取图片中的绩效考核数据' }
      ]}]
    : [{ role: 'user', content: `请从以下文档内容中提取绩效考核数据：\n\n${text.slice(0, 8000)}` }];

  const resp = await fetch(`${config.api_base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.api_key}` },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.1,
      max_tokens: 4096
    })
  });
  const respJson = await resp.json();
  if (respJson.error) throw new Error(respJson.error.message || 'AI 调用失败');
  const raw = respJson.choices[0].message.content;
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const result = JSON.parse(cleaned);

  // 补全 total_score
  result.records = (result.records || []).map(r => {
    r.total_score = r.total_score ?? (r.dims || []).reduce((s, d) => s + (d.score || 0) * (d.weight || 0) / 100, 0);
    r.total_score = Math.round(r.total_score * 10) / 10;
    return r;
  });

  if (!result.dims || !result.records || !result.records.length) {
    throw new Error('AI 未能提取到有效的考核数据');
  }

  return result;
}

module.exports = router;
