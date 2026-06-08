const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const XLSX = require('xlsx');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS finance_records (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'receivable',
  customer_name TEXT NOT NULL,
  receivable_amount REAL DEFAULT 0,
  received_amount REAL DEFAULT 0,
  unreceived_amount REAL DEFAULT 0,
  contract_date TEXT,
  payment_term TEXT,
  due_date TEXT,
  overdue_days TEXT,
  invoiced TEXT DEFAULT '未开票',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

// type = 'receivable' (应收账款) or 'payable' (应付账款)

// 列表
router.get('/', (req, res) => {
  const { type } = req.query;
  let sql = 'SELECT * FROM finance_records';
  const params = [];
  if (type) { sql += ' WHERE type=?'; params.push(type); }
  sql += ' ORDER BY created_at ASC';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// 汇总
router.get('/summary', (req, res) => {
  const stats = (type) => {
    const rows = db.prepare('SELECT * FROM finance_records WHERE type=?').all(type);
    const total_receivable = rows.reduce((s, r) => s + (r.receivable_amount || 0), 0);
    const total_received = rows.reduce((s, r) => s + (r.received_amount || 0), 0);
    const total_unreceived = rows.reduce((s, r) => s + (r.unreceived_amount || 0), 0);
    return { count: rows.length, total_receivable, total_received, total_unreceived };
  };
  res.json({ code: 200, data: { receivable: stats('receivable'), payable: stats('payable') } });
});

// 新增
router.post('/', (req, res) => {
  const { type, customer_name, receivable_amount, received_amount, unreceived_amount,
    contract_date, payment_term, due_date, overdue_days, invoiced, notes } = req.body;
  if (!customer_name) return res.status(400).json({ code: 400, message: '客户名称必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO finance_records
    (id,type,customer_name,receivable_amount,received_amount,unreceived_amount,
     contract_date,payment_term,due_date,overdue_days,invoiced,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, type || 'receivable', customer_name, receivable_amount || 0, received_amount || 0,
      unreceived_amount || 0, contract_date || '', payment_term || '', due_date || '',
      overdue_days || '', invoiced || '未开票', notes || '');
  res.json({ code: 200, data: { id } });
});

// 更新
router.put('/:id', (req, res) => {
  const fields = ['customer_name','receivable_amount','received_amount','unreceived_amount',
    'contract_date','payment_term','due_date','overdue_days','invoiced','notes'];
  const sets = fields.filter(k => req.body[k] !== undefined);
  if (sets.length === 0) return res.status(400).json({ code: 400, message: '无更新字段' });
  const vals = sets.map(k => req.body[k]);
  vals.push(req.params.id);
  db.prepare(`UPDATE finance_records SET ${sets.map(k => k + '=?').join(',')} WHERE id=?`).run(...vals);
  res.json({ code: 200 });
});

// 删除
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM finance_records WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 批量删除
router.post('/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!ids || !ids.length) return res.status(400).json({ code: 400, message: '请提供要删除的ID' });
  const del = db.prepare('DELETE FROM finance_records WHERE id=?');
  const txn = db.transaction(() => { for (const id of ids) del.run(id); });
  txn();
  res.json({ code: 200, message: `已删除 ${ids.length} 条` });
});

// Excel 导入解析
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请上传文件' });
  const type = req.body.type || 'receivable';
  let wb, rows;
  try {
    wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  } catch (e) {
    return res.status(400).json({ code: 400, message: '文件解析失败' });
  }
  if (!rows || rows.length < 3) return res.status(400).json({ code: 400, message: '文件内容不足' });

  const fieldMap = {
    '客户名称': 'customer_name', '应收金额(元)': 'receivable_amount', '应收金额': 'receivable_amount',
    '已收金额(元)': 'received_amount', '已收金额': 'received_amount',
    '未收金额(元)': 'unreceived_amount', '未收金额': 'unreceived_amount',
    '合同签订时间': 'contract_date', '账期': 'payment_term', '到期日期': 'due_date',
    '逾期天数': 'overdue_days', '是否开票': 'invoiced', '备注': 'notes',
  };

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c || '').includes('客户名称'))) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return res.status(400).json({ code: 400, message: '未找到表头行' });

  const headers = rows[headerIdx].map(h => String(h || '').trim());
  const colMap = {};
  for (let i = 0; i < headers.length; i++) { if (fieldMap[headers[i]]) colMap[i] = fieldMap[headers[i]]; }
  if (!Object.keys(colMap).length) return res.status(400).json({ code: 400, message: '未识别到有效列' });

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cells = rows[i].map(c => String(c || '').trim());
    if (cells.every(c => c === '')) continue;
    if (cells[0] === '合计' || cells[0] === '总计') continue;
    const item = { customer_name: '', receivable_amount: 0, received_amount: 0, unreceived_amount: 0, contract_date: '', payment_term: '', due_date: '', overdue_days: '', invoiced: '未开票', notes: '' };
    for (const [ci, field] of Object.entries(colMap)) {
      const val = cells[Number(ci)];
      if (['receivable_amount','received_amount','unreceived_amount'].includes(field)) {
        item[field] = parseFloat(String(val).replace(/[,，]/g, '')) || 0;
      } else {
        item[field] = val;
      }
    }
    if (item.customer_name) items.push(item);
  }
  if (!items.length) return res.status(400).json({ code: 400, message: '未解析到有效数据' });
  res.json({ code: 200, data: { items } });
});

// 批量导入
router.post('/batch', (req, res) => {
  const { type, items } = req.body;
  if (!items || !items.length) return res.status(400).json({ code: 400, message: '缺少数据' });
  const insert = db.prepare(`INSERT INTO finance_records
    (id,type,customer_name,receivable_amount,received_amount,unreceived_amount,
     contract_date,payment_term,due_date,overdue_days,invoiced,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const txn = db.transaction(() => {
    for (const r of items) {
      insert.run(randomUUID(), type || 'receivable', r.customer_name || '',
        r.receivable_amount || 0, r.received_amount || 0, r.unreceived_amount || 0,
        r.contract_date || '', r.payment_term || '', r.due_date || '',
        r.overdue_days || '', r.invoiced || '未开票', r.notes || '');
    }
  });
  txn();
  res.json({ code: 200, message: `导入 ${items.length} 条` });
});

// 导出 Excel
router.get('/export', (req, res) => {
  const { type } = req.query;
  let rows;
  const title = type === 'payable' ? '应付账款明细表' : '应收账款明细表';
  if (type) {
    rows = db.prepare('SELECT * FROM finance_records WHERE type=? ORDER BY created_at ASC').all(type);
  } else {
    rows = db.prepare('SELECT * FROM finance_records ORDER BY type, created_at ASC').all();
  }
  if (!rows.length) {
    const headers = ['序号', '客户名称', '应收金额(元)', '已收金额(元)', '未收金额(元)', '合同签订时间', '账期', '到期日期', '逾期天数', '是否开票', '备注'];
    const data = [[title], headers, ['合计', '', 0, 0, 0, '', '', '', '', '', '']];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map((h, i) => ({ wch: i === 1 ? 40 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(title + '_模板.xlsx')}` });
    return res.send(buf);
  }

  const headers = ['序号', '客户名称', '应收金额(元)', '已收金额(元)', '未收金额(元)', '合同签订时间', '账期', '到期日期', '逾期天数', '是否开票', '备注'];
  const data = [[title], headers];
  let idx = 1;
  let sumReceivable = 0, sumReceived = 0, sumUnreceived = 0;
  for (const r of rows) {
    data.push([idx++, r.customer_name, r.receivable_amount, r.received_amount, r.unreceived_amount, r.contract_date || '', r.payment_term || '', r.due_date || '', r.overdue_days || '', r.invoiced || '', r.notes || '']);
    sumReceivable += r.receivable_amount || 0;
    sumReceived += r.received_amount || 0;
    sumUnreceived += r.unreceived_amount || 0;
  }
  data.push(['合计', '', sumReceivable, sumReceived, sumUnreceived, '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 1 ? 40 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const label = type === 'payable' ? '应付账款' : '应收账款';
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(label + '_' + new Date().toISOString().slice(0,10) + '.xlsx')}` });
  res.send(buf);
});

module.exports = router;
