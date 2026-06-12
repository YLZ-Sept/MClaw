const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const multer = require('multer');
const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ── 按类别+月份查询 ──
router.get('/reports', (req, res) => {
  const { month, category } = req.query;
  let sql = 'SELECT * FROM performance_reports WHERE 1=1';
  const params = [];
  if (month) { sql += ' AND month=?'; params.push(month); }
  if (category) { sql += ' AND category=?'; params.push(category); }
  sql += category === 'monthly' ? ' ORDER BY total_score DESC' : ' ORDER BY employee_name';
  const list = db.prepare(sql).all(...params);
  list.forEach(r => { try { r.dims = JSON.parse(r.dims); } catch { r.dims = []; } });
  res.json({ code: 200, data: list });
});

// ── 删除单条 ──
router.delete('/reports/:id', (req, res) => {
  db.prepare('DELETE FROM performance_reports WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// ── 编辑单条 ──
router.put('/reports/:id', (req, res) => {
  const fields = ['employee_name','department','position','month','category','dims','total_score'];
  const sets = fields.filter(k => req.body[k] !== undefined);
  if (sets.length === 0) return res.status(400).json({ code: 400, message: '无更新字段' });
  const vals = [];
  for (const k of sets) {
    const v = req.body[k];
    vals.push(k === 'dims' && typeof v === 'object' ? JSON.stringify(v) : v);
  }
  vals.push(req.params.id);
  db.prepare(`UPDATE performance_reports SET ${sets.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals);
  res.json({ code: 200, data: { id: req.params.id } });
});

// ── 批量入库（用于月度考核汇总 + 导入确认） ──
router.post('/batch', (req, res) => {
  const { month, category, records } = req.body;
  if (!month || !records || !records.length) return res.status(400).json({ code: 400, message: '参数不全' });

  const cat = category || 'monthly';
  // 先删当月+同类别旧数据再插入
  db.prepare('DELETE FROM performance_reports WHERE month=? AND category=?').run(month, cat);

  let count = 0;
  const tx = db.transaction(() => {
    for (const r of records) {
      const id = randomUUID();
      const total = r.total_score != null ? r.total_score : 0;
      const dims = JSON.stringify(r.dims || []);
      db.prepare(`INSERT INTO performance_reports (id,employee_name,department,position,month,category,dims,total_score)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, r.employee_name || '', r.department || '', r.position || '', month, cat, dims, total);
      count++;
    }
  });
  tx();
  res.json({ code: 200, data: { imported: count } });
});

// ── 导入解析（预览） ──
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' });

  const ext = require('path').extname(req.file.originalname).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') return res.status(400).json({ code: 400, message: '仅支持 .xlsx/.xls，请使用模板文件' });

  const category = req.body.category || 'tech';
  const month = req.body.month || new Date().toISOString().slice(0, 7);

  try {
    const result = parsePerfExcel(req.file.buffer, month, category);
    if (!result.records.length) return res.status(400).json({ code: 400, message: '未能解析出考核数据，请检查文件是否为正确模板' });
    res.json({ code: 200, data: { month, category, ...result } });
  } catch (e) {
    console.error('[perf-import]', e.message);
    res.status(500).json({ code: 500, message: '解析失败: ' + e.message });
  }
});

// ── 月度考核汇总 ──
router.post('/aggregate', (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ code: 400, message: 'month 必填' });

  // 查财务和技术中心当月数据
  const financeList = db.prepare("SELECT * FROM performance_reports WHERE month=? AND category='finance'").all(month);
  const techList = db.prepare("SELECT * FROM performance_reports WHERE month=? AND category='tech'").all(month);

  // 按姓名合并分组
  const map = new Map();
  const ensure = (name) => { if (!map.has(name)) map.set(name, { f: null, t: null, dept: '', pos: '' }); return map.get(name); };

  financeList.forEach(r => {
    const m = ensure(r.employee_name); m.f = r; m.dept = r.department || m.dept; m.pos = r.position || m.pos;
  });
  techList.forEach(r => {
    const m = ensure(r.employee_name); m.t = r; m.dept = r.department || m.dept; m.pos = r.position || m.pos;
  });

  // 生成月度考核记录
  const records = [];
  for (const [name, d] of map) {
    let totalScore = 0;
    let dims = [];

    if (d.f && d.t) {
      // 两表都有 → 取平均分
      totalScore = Math.round((d.f.total_score + d.t.total_score) / 2 * 10) / 10;
      let fdims = [];
      try { fdims = JSON.parse(d.f.dims); } catch {}
      let tdims = [];
      try { tdims = JSON.parse(d.t.dims); } catch {}
      dims = [...fdims, ...tdims];
    } else if (d.f) {
      totalScore = d.f.total_score;
      try { dims = JSON.parse(d.f.dims); } catch {}
    } else if (d.t) {
      totalScore = d.t.total_score;
      try { dims = JSON.parse(d.t.dims); } catch {}
    } else {
      continue;
    }

    records.push({
      employee_name: name,
      department: (d.f && d.f.department) || (d.t && d.t.department) || '',
      position: (d.f && d.f.position) || (d.t && d.t.position) || '',
      dims,
      total_score: totalScore
    });
  }

  // 去重写入
  db.prepare("DELETE FROM performance_reports WHERE month=? AND category='monthly'").run(month);
  let count = 0;
  const tx = db.transaction(() => {
    for (const r of records) {
      const id = randomUUID();
      db.prepare(`INSERT INTO performance_reports (id,employee_name,department,position,month,category,dims,total_score)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, r.employee_name, r.department, r.position, month, 'monthly', JSON.stringify(r.dims), r.total_score);
      count++;
    }
  });
  tx();
  res.json({ code: 200, data: { aggregated: count } });
});

// ── 导出 Excel ──
router.get('/export', (req, res) => {
  try {
  const { month, category } = req.query;
  const m = month || new Date().toISOString().slice(0, 7);
  const cat = category || 'monthly';

  let sql = 'SELECT * FROM performance_reports WHERE month=?';
  const params = [m];
  if (cat !== 'all') { sql += ' AND category=?'; params.push(cat); }
  sql += ' ORDER BY employee_name';
  const list = db.prepare(sql).all(...params);

  const XLSX = require('xlsx');

  // 收集所有维度
  const allDims = new Map();
  list.forEach(r => {
    let d = [];
    try { d = JSON.parse(r.dims); } catch {}
    d.forEach(dd => { if (!allDims.has(dd.name)) allDims.set(dd.name, dd.weight); });
  });
  const dimNames = [...allDims.keys()];

  // 按类别生成不同的标题
  const catLabel = cat === 'finance' ? '财务' : cat === 'tech' ? '技术中心' : '月度考核';

  const headers = ['姓名', '部门', '职位', '月份'];
  dimNames.forEach(n => headers.push(n + '(' + allDims.get(n) + '%)'));
  headers.push('总分');

  const rows = [headers];
  list.forEach(r => {
    let d = [];
    try { d = JSON.parse(r.dims); } catch {}
    const row = [r.employee_name, r.department, r.position, r.month];
    dimNames.forEach(n => {
      const dd = d.find(x => x.name === n);
      row.push(dd ? dd.score : '');
    });
    row.push(r.total_score);
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  // 设置列宽
  const wch = [12, 12, 12, 10, ...dimNames.map(() => 10), 8];
  ws['!cols'] = wch.map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, catLabel);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${catLabel}_${m}.xlsx`)}`,
  });
  res.send(buf);
  } catch (e) {
    console.error('[performance] export error:', e.message || e);
    res.status(500).json({ code: 500, message: '导出失败: ' + (e.message || '未知错误') });
  }
});

// ─── Excel 解析（按类别） ───

function parsePerfExcel(buf, month, category) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (data.length < 3) throw new Error('文件行数不足');

  // 定义各类别的维度关键词映射
  const dimKeywords = category === 'finance'
    ? ['工作任务及质量', '工作态度', '协调能力', '学习能力']
    : ['工作效率', '工作质量', '执行反馈力', '专业技能', '团队协作'];

  // 在开头行中找维度行（含 (xx%) 模式的列）
  let dimCols = [], nameCol = -1, deptCol = -1, posCol = -1, monthCol = -1;
  for (let r = 0; r < Math.min(data.length, 5); r++) {
    const row = (data[r] || []).map(c => String(c || '').trim());
    const dims = [];
    for (let c = 0; c < row.length; c++) {
      const m = row[c].match(/(.+?)[（(](\d+)[%％][）)]/);
      if (m) { dims.push({ col: c, name: m[1], weight: parseInt(m[2]) }); }
      if (row[c].includes('姓名') || row[c] === '员工') nameCol = c;
      if (row[c].includes('部门')) deptCol = c;
      if (row[c].includes('职位') || row[c].includes('职务')) posCol = c;
      if (row[c].includes('月份') || row[c].includes('考核月份')) monthCol = c;
    }
    if (dims.length >= 2) { dimCols = dims; break; }
  }
  if (dimCols.length === 0) throw new Error('未识别到维度列（如"工作效率（20%）"），请确认模板格式');

  // 默认列映射
  if (nameCol < 0) nameCol = 1;
  if (deptCol < 0) deptCol = 2;
  if (posCol < 0) posCol = 3;

  const dims = dimCols.map(d => ({ name: d.name, weight: d.weight }));
  const parseNum = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  // 找第一个有数据的行（跳过表头）
  let dataStart = 3;
  for (let r = 3; r < data.length; r++) {
    const row = data[r];
    if (!row || !row[nameCol] || String(row[nameCol]).trim() === '') continue;
    const name = String(row[nameCol]).trim();
    if (name === '姓名' || name === '员工' || name === '') continue;
    // 检查维度列是否有数字
    const hasNums = dimCols.some(d => parseNum(row[d.col]) > 0);
    if (hasNums) { dataStart = r; break; }
  }

  const records = [];
  for (let r = dataStart; r < data.length; r++) {
    const row = data[r];
    if (!row || !row[nameCol] || String(row[nameCol]).trim() === '') continue;
    const name = String(row[nameCol]).trim();
    if (name === '姓名' || name === '员工') continue;

    // 检查是否有有效分数
    const hasScore = dimCols.some(d => parseNum(row[d.col]) > 0);
    if (!hasScore) continue;

    const scores = dimCols.map(d => ({ name: d.name, weight: d.weight, score: parseNum(row[d.col]) }));
    // 检查是否最后一列是总分列
    let total = null;
    let dimEnd = dimCols.length > 0 ? Math.max(...dimCols.map(d => d.col)) : -1;
    if (dimEnd + 1 < row.length) {
      const nextVal = parseNum(row[dimEnd + 1]);
      if (nextVal > 0 && nextVal <= 100) total = nextVal;
    }
    const weightedTotal = total ?? Math.round(scores.reduce((s, d) => s + d.score * d.weight / 100, 0) * 10) / 10;

    records.push({
      employee_name: name,
      department: String(row[deptCol] || '').trim(),
      position: String(row[posCol] || '').trim(),
      dims: scores,
      total_score: weightedTotal
    });
  }

  return { dims, records };
}

module.exports = router;
