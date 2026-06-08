const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const XLSX = require('xlsx');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS recruitment_weekly_stats (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  position TEXT NOT NULL,
  new_resumes INTEGER DEFAULT 0,
  valid_resumes INTEGER DEFAULT 0,
  resume_valid_rate REAL DEFAULT 0,
  initial_screen_notify INTEGER DEFAULT 0,
  initial_screen_attend INTEGER DEFAULT 0,
  second_interview_notify INTEGER DEFAULT 0,
  second_interview_attend INTEGER DEFAULT 0,
  second_interview_pass_rate REAL DEFAULT 0,
  offer_count INTEGER DEFAULT 0,
  onboard_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// 按周查询
router.get('/', (req, res) => {
  const { week_start } = req.query;
  let sql = 'SELECT * FROM recruitment_weekly_stats';
  const params = [];
  if (week_start) {
    sql += ' WHERE week_start = ?';
    params.push(week_start);
  }
  sql += ' ORDER BY created_at ASC';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// 获取可用周期列表
router.get('/weeks', (req, res) => {
  const rows = db.prepare("SELECT DISTINCT week_start, week_end FROM recruitment_weekly_stats ORDER BY week_start DESC").all();
  res.json({ code: 200, data: rows });
});

// Excel 导入解析
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' });
  let wb, rows;
  try {
    wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  } catch (e) {
    return res.status(400).json({ code: 400, message: '文件解析失败: ' + e.message });
  }
  if (!rows || rows.length < 2) return res.status(400).json({ code: 400, message: '文件内容不足' });

  // 从前3行中搜索日期范围
  let week_start = '', week_end = '';
  for (let ri = 0; ri < Math.min(rows.length, 3); ri++) {
    const joined = rows[ri].map(c => String(c || '')).join(' ');
    const m = joined.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s*[-~到至]\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (m) {
      week_start = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
      week_end = `${m[4]}-${String(m[5]).padStart(2,'0')}-${String(m[6]).padStart(2,'0')}`;
      break;
    }
  }

  // 查找表头行（包含"岗位名称"或"岗位"的行）
  let headerRowIdx = -1;
  const fieldMap = {
    '岗位名称': 'position', '岗位': 'position', '职位': 'position',
    '新增简历数': 'new_resumes', '新增简历': 'new_resumes',
    '有效简历数': 'valid_resumes', '有效简历': 'valid_resumes',
    '简历有效率': 'resume_valid_rate', '有效率': 'resume_valid_rate',
    '初筛通知数': 'initial_screen_notify', '初筛通知': 'initial_screen_notify',
    '初筛到场数': 'initial_screen_attend', '初筛到场': 'initial_screen_attend',
    '复试通知数': 'second_interview_notify', '复试通知': 'second_interview_notify',
    '复试到场数': 'second_interview_attend', '复试到场': 'second_interview_attend',
    '复试通过率': 'second_interview_pass_rate', '通过率': 'second_interview_pass_rate',
    'offer发放数': 'offer_count', 'offer': 'offer_count', 'offer数': 'offer_count',
    '入职人数': 'onboard_count', '入职': 'onboard_count',
  };

  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(c => String(c || '').trim());
    if (cells.some(c => c.includes('岗位名称') || c === '岗位' || c === '职位')) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx < 0) return res.status(400).json({ code: 400, message: '未找到表头行（需包含"岗位名称"列）' });

  const headers = rows[headerRowIdx].map(h => String(h || '').trim());
  const colMap = {}; // headerIndex → fieldName
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (fieldMap[h]) colMap[i] = fieldMap[h];
  }
  if (Object.keys(colMap).length === 0) return res.status(400).json({ code: 400, message: '未识别到有效列' });

  // 解析数据行（跳过表头行之后到"合计"行之前）
  const items = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const cells = rows[i].map(c => String(c || '').trim());
    if (cells.length === 0 || cells.every(c => c === '')) continue;
    if (cells[0] === '合计' || cells[0] === '本周合计' || cells[0] === '总计' || cells.join('').includes('合计')) continue;
    const item = { position: '', new_resumes: 0, valid_resumes: 0, resume_valid_rate: 0, initial_screen_notify: 0, initial_screen_attend: 0, second_interview_notify: 0, second_interview_attend: 0, second_interview_pass_rate: 0, offer_count: 0, onboard_count: 0 };
    for (const [colIdx, field] of Object.entries(colMap)) {
      const val = cells[Number(colIdx)];
      if (field === 'position') {
        item[field] = val;
      } else {
        const num = parseFloat(String(val).replace(/[%％]/g, ''));
        item[field] = isNaN(num) ? 0 : num;
      }
    }
    if (item.position) items.push(item);
  }

  if (items.length === 0) return res.status(400).json({ code: 400, message: '未解析到有效数据行' });
  res.json({ code: 200, data: { week_start, week_end, items } });
});

// 新增
router.post('/', (req, res) => {
  const { week_start, week_end, position, new_resumes, valid_resumes, resume_valid_rate,
    initial_screen_notify, initial_screen_attend, second_interview_notify, second_interview_attend,
    second_interview_pass_rate, offer_count, onboard_count } = req.body;
  if (!week_start || !week_end || !position) {
    return res.status(400).json({ code: 400, message: '周期和岗位必填' });
  }
  const id = randomUUID();
  db.prepare(`INSERT INTO recruitment_weekly_stats
    (id,week_start,week_end,position,new_resumes,valid_resumes,resume_valid_rate,
     initial_screen_notify,initial_screen_attend,second_interview_notify,second_interview_attend,
     second_interview_pass_rate,offer_count,onboard_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, week_start, week_end, position, new_resumes || 0, valid_resumes || 0, resume_valid_rate || 0,
      initial_screen_notify || 0, initial_screen_attend || 0, second_interview_notify || 0, second_interview_attend || 0,
      second_interview_pass_rate || 0, offer_count || 0, onboard_count || 0);
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/:id', (req, res) => {
  const { week_start, week_end, position, new_resumes, valid_resumes, resume_valid_rate,
    initial_screen_notify, initial_screen_attend, second_interview_notify, second_interview_attend,
    second_interview_pass_rate, offer_count, onboard_count } = req.body;
  db.prepare(`UPDATE recruitment_weekly_stats SET
    week_start=?, week_end=?, position=?, new_resumes=?, valid_resumes=?, resume_valid_rate=?,
    initial_screen_notify=?, initial_screen_attend=?, second_interview_notify=?, second_interview_attend=?,
    second_interview_pass_rate=?, offer_count=?, onboard_count=?
    WHERE id=?`)
    .run(week_start, week_end, position, new_resumes || 0, valid_resumes || 0, resume_valid_rate || 0,
      initial_screen_notify || 0, initial_screen_attend || 0, second_interview_notify || 0, second_interview_attend || 0,
      second_interview_pass_rate || 0, offer_count || 0, onboard_count || 0, req.params.id);
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM recruitment_weekly_stats WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 导出 Excel（格式匹配原始模板）
router.get('/export', (req, res) => {
  const { week_start } = req.query;
  let rows;
  if (week_start) {
    rows = db.prepare('SELECT * FROM recruitment_weekly_stats WHERE week_start=? ORDER BY created_at ASC').all(week_start);
  } else {
    rows = db.prepare('SELECT * FROM recruitment_weekly_stats ORDER BY week_start DESC, created_at ASC').all();
  }
  if (rows.length === 0) {
    // 无数据时导出空模版
    const weekStart = week_start || 'YYYY-MM-DD';
    const weekEnd = 'YYYY-MM-DD';
    const headers = ['序号', '岗位名称', '新增简历数', '有效简历数', '简历有效率', '初筛通知数', '初筛到场数', '复试通知数', '复试到场数', '复试通过率', 'offer发放数', '入职人数'];
    const data = [
      ['招聘专员每周招聘数据统计表'],
      [`统计周期: ${weekStart} ~ ${weekEnd}`],
      headers,
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 6 : i === 1 ? 16 : 12 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '每周招聘数据统计表');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('招聘周报_模板.xlsx')}`,
    });
    return res.send(buf);
  }

  const weekStart = rows[0].week_start;
  const weekEnd = rows[0].week_end;
  const headers = ['序号', '岗位名称', '新增简历数', '有效简历数', '简历有效率', '初筛通知数', '初筛到场数', '复试通知数', '复试到场数', '复试通过率', 'offer发放数', '入职人数'];

  // 构建数据
  const data = [
    ['招聘专员每周招聘数据统计表'],
    [`统计周期: ${weekStart} ~ ${weekEnd}`],
    headers,
  ];
  let idx = 1;
  for (const r of rows) {
    data.push([idx++, r.position, r.new_resumes, r.valid_resumes, r.resume_valid_rate, r.initial_screen_notify, r.initial_screen_attend, r.second_interview_notify, r.second_interview_attend, r.second_interview_pass_rate, r.offer_count, r.onboard_count]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 6 : i === 1 ? 16 : 12 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '每周招聘数据统计表');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const filename = `招聘周报_${weekStart}_${weekEnd}.xlsx`;
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  res.send(buf);
});

// 批量导入
router.post('/batch', (req, res) => {
  const { week_start, week_end, rows } = req.body;
  if (!week_start || !week_end || !rows || !rows.length) {
    return res.status(400).json({ code: 400, message: '缺少数据' });
  }
  const insert = db.prepare(`INSERT INTO recruitment_weekly_stats
    (id,week_start,week_end,position,new_resumes,valid_resumes,resume_valid_rate,
     initial_screen_notify,initial_screen_attend,second_interview_notify,second_interview_attend,
     second_interview_pass_rate,offer_count,onboard_count)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const del = db.prepare('DELETE FROM recruitment_weekly_stats WHERE week_start=? AND week_end=?');
  del.run(week_start, week_end);
  const txn = db.transaction(() => {
    for (const r of rows) {
      insert.run(randomUUID(), week_start, week_end, r.position || '',
        r.new_resumes || 0, r.valid_resumes || 0, r.resume_valid_rate || 0,
        r.initial_screen_notify || 0, r.initial_screen_attend || 0,
        r.second_interview_notify || 0, r.second_interview_attend || 0,
        r.second_interview_pass_rate || 0, r.offer_count || 0, r.onboard_count || 0);
    }
  });
  txn();
  res.json({ code: 200, message: `导入 ${rows.length} 条记录` });
});

module.exports = router;
