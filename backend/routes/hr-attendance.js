const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const multer = require('multer');
const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── 考勤月报列表（按月筛选） ──
router.get('/reports', (req, res) => {
  const { month } = req.query;
  let sql = 'SELECT * FROM attendance_reports';
  const params = [];
  if (month) { sql += ' WHERE month=?'; params.push(month); }
  sql += ' ORDER BY employee_name';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// ── 单条新增 ──
router.post('/reports', (req, res) => {
  const id = randomUUID();
  const f = ['employee_name','department','position','month','should_work_days','actual_work_days','rest_days','normal_days','abnormal_days','standard_hours','actual_hours','late_count','late_minutes','absent_count','absent_minutes','missing_clock_count','location_abnormal','out_hours','travel_days','personal_leave','sick_leave','comp_leave','annual_leave','marriage_leave','maternity_leave','paternity_leave','other_leave'];
  const vals = f.map(k => req.body[k] ?? null);
  db.prepare(`INSERT INTO attendance_reports (id,${f.join(',')}) VALUES (?,${f.map(()=>'?').join(',')})`).run(id, ...vals);
  res.json({ code: 200, data: { id } });
});

// ── Excel 批量导入 ──
router.post('/reports/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' });
  const ext = require('path').extname(req.file.originalname).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') return res.status(400).json({ code: 400, message: '仅支持 .xlsx/.xls' });

  const XLSX = require('xlsx');
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  // 预期结构: row 0=主标题, row 1=子标题(列名), row 2+=数据
  if (data.length < 3) return res.status(400).json({ code: 400, message: '文件格式不符，请使用考勤月报模板' });

  const month = req.body.month || '2026-05';
  const parseNum = (v) => {
    if (v === '--' || v === '' || v === undefined || v === null) return 0;
    return parseFloat(v) || 0;
  };

  let imported = 0;
  const tx = db.transaction(() => {
    for (let i = 2; i < data.length; i++) {
      const r = data[i];
      if (!r[0] || String(r[0]).trim() === '') continue;
      const id = randomUUID();
      db.prepare(`INSERT INTO attendance_reports (id,employee_name,department,position,month,
        should_work_days,actual_work_days,rest_days,normal_days,abnormal_days,standard_hours,actual_hours,
        late_count,late_minutes,absent_count,absent_minutes,missing_clock_count,location_abnormal,
        out_hours,travel_days,personal_leave,sick_leave,comp_leave,annual_leave,marriage_leave,maternity_leave,paternity_leave,other_leave)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, String(r[0]).trim(), String(r[1]||'').trim(), String(r[2]||'').trim(), month,
          parseNum(r[3]), parseNum(r[4]), parseNum(r[5]), parseNum(r[6]), parseNum(r[7]), parseNum(r[8]), parseNum(r[9]),
          parseNum(r[10]), parseNum(r[11]), parseNum(r[12]), parseNum(r[13]), parseNum(r[14]), parseNum(r[15]),
          parseNum(r[16]), parseNum(r[17]), parseNum(r[18]), parseNum(r[19]), parseNum(r[20]), parseNum(r[21]),
          parseNum(r[22]), parseNum(r[23]), parseNum(r[24]), parseNum(r[25]));
      imported++;
    }
  });
  tx();
  res.json({ code: 200, data: { imported } });
});

// ── 单条更新 ──
router.put('/reports/:id', (req, res) => {
  const fields = ['employee_name','department','position','month','should_work_days','actual_work_days','rest_days','normal_days','abnormal_days','standard_hours','actual_hours','late_count','late_minutes','absent_count','absent_minutes','missing_clock_count','location_abnormal','out_hours','travel_days','personal_leave','sick_leave','comp_leave','annual_leave','marriage_leave','maternity_leave','paternity_leave','other_leave'];
  const sets = fields.filter(k => req.body[k] !== undefined);
  if (sets.length === 0) return res.status(400).json({ code: 400, message: '无更新字段' });
  const vals = sets.map(k => req.body[k]);
  vals.push(req.params.id);
  db.prepare(`UPDATE attendance_reports SET ${sets.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals);
  res.json({ code: 200, data: { id: req.params.id } });
});

// ── 删除 ──
router.delete('/reports/:id', (req, res) => {
  db.prepare('DELETE FROM attendance_reports WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// ── Excel 导出 ──
router.get('/export', (req, res) => {
  const { month } = req.query;
  const list = db.prepare('SELECT * FROM attendance_reports WHERE month=? ORDER BY employee_name').all(month);
  const XLSX = require('xlsx');
  const cols = [
    { key: 'employee_name', label: '姓名', wch: 10 },
    { key: 'department', label: '部门', wch: 12 },
    { key: 'position', label: '职务', wch: 12 },
    { key: 'should_work_days', label: '应出勤', wch: 8 },
    { key: 'actual_work_days', label: '实际', wch: 8 },
    { key: 'rest_days', label: '休息', wch: 8 },
    { key: 'normal_days', label: '正常', wch: 8 },
    { key: 'abnormal_days', label: '异常', wch: 8 },
    { key: 'standard_hours', label: '标准(h)', wch: 8 },
    { key: 'actual_hours', label: '实际(h)', wch: 8 },
    { key: 'late_count', label: '迟到次', wch: 8 },
    { key: 'late_minutes', label: '迟到分', wch: 8 },
    { key: 'absent_count', label: '旷工次', wch: 8 },
    { key: 'absent_minutes', label: '旷工分', wch: 8 },
    { key: 'missing_clock_count', label: '缺卡', wch: 8 },
    { key: 'location_abnormal', label: '地点异', wch: 8 },
    { key: 'out_hours', label: '外出(h)', wch: 8 },
    { key: 'travel_days', label: '出差', wch: 8 },
    { key: 'personal_leave', label: '事假', wch: 8 },
    { key: 'sick_leave', label: '病假', wch: 8 },
    { key: 'comp_leave', label: '调休', wch: 8 },
    { key: 'annual_leave', label: '年假', wch: 8 },
    { key: 'other_leave', label: '其他', wch: 8 },
  ];
  const ws = XLSX.utils.json_to_sheet(list.map(r =>
    Object.fromEntries(cols.map(c => [c.label, r[c.key] ?? '']))
  ));
  ws['!cols'] = cols.map(c => ({ wch: c.wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, month);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="考勤月报_${month}.xlsx"`);
  res.send(buf);
});

// ── 兼容旧月报接口 ──
router.get('/report/monthly', (req, res) => {
  const { month } = req.query;
  const m = month || '2026-05';
  const list = db.prepare('SELECT * FROM attendance_reports WHERE month=? ORDER BY employee_name').all(m);
  res.json({ code: 200, data: list });
});

module.exports = router;
