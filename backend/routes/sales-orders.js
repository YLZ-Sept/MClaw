const { Router } = require('express');
const { randomUUID } = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT,
  distributor TEXT,
  product_name TEXT NOT NULL,
  model TEXT,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT '套',
  serial_number TEXT,
  out_date TEXT,
  unit_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  remark TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

try { db.exec('ALTER TABLE sales_orders ADD COLUMN distributor TEXT'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN product_name TEXT'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN model TEXT'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN serial_number TEXT'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN out_date TEXT'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN unit TEXT DEFAULT \'套\''); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN unit_price REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN total_price REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN customer_name TEXT'); } catch {}
try { db.exec('ALTER TABLE sales_orders ADD COLUMN quantity REAL DEFAULT 1'); } catch {}

const upload = multer({ dest: path.join(__dirname, '..', 'uploads', 'temp') });

router.get('/', (req, res) => {
  const { keyword } = req.query;
  let sql = 'SELECT * FROM sales_orders WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND (product_name LIKE ? OR customer_name LIKE ? OR model LIKE ? OR distributor LIKE ? OR serial_number LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

router.post('/', (req, res) => {
  const { customer_name, distributor, product_name, model, quantity, unit, serial_number, out_date, unit_price, total_price, remark } = req.body;
  if (!product_name) return res.status(400).json({ code: 400, message: '产品名称必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO sales_orders (id,customer_name,distributor,product_name,model,quantity,unit,serial_number,out_date,unit_price,total_price,remark)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, customer_name||'', distributor||'', product_name, model||'', quantity||1, unit||'套', serial_number||'', out_date||'', unit_price||0, total_price||0, remark||'');
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { customer_name, distributor, product_name, model, quantity, unit, serial_number, out_date, unit_price, total_price, remark, status } = req.body;
  db.prepare(`UPDATE sales_orders SET customer_name=COALESCE(?,customer_name),distributor=COALESCE(?,distributor),product_name=COALESCE(?,product_name),model=COALESCE(?,model),quantity=COALESCE(?,quantity),unit=COALESCE(?,unit),serial_number=COALESCE(?,serial_number),out_date=COALESCE(?,out_date),unit_price=COALESCE(?,unit_price),total_price=COALESCE(?,total_price),remark=COALESCE(?,remark),status=COALESCE(?,status) WHERE id=?`)
    .run(customer_name,distributor,product_name,model,quantity,unit,serial_number,out_date,unit_price,total_price,remark,status,req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sales_orders WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件' });
  const wb = XLSX.readFile(req.file.path);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  fs.unlinkSync(req.file.path);
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const r = data[i]; if (!r || !r[2]) continue;
    const id = randomUUID();
    db.prepare(`INSERT INTO sales_orders (id,customer_name,distributor,product_name,model,quantity,unit,serial_number,out_date,unit_price,total_price,remark)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(r[0]||''), String(r[1]||''), String(r[2]||''), String(r[3]||''), Number(r[4])||1, String(r[5]||'套'), String(r[6]||''), String(r[7]||''), Number(r[8])||0, Number(r[9])||0, String(r[10]||''));
    count++;
  }
  res.json({ code: 200, data: { count } });
});

router.get('/export', (req, res) => {
  const rows = db.prepare('SELECT * FROM sales_orders ORDER BY created_at DESC').all();
  const headers = ['客户','经销商','产品名称','型号','数量','单位','序列号','出库日期','单价','总价','备注','状态','创建时间'];
  const fields = ['customer_name','distributor','product_name','model','quantity','unit','serial_number','out_date','unit_price','total_price','remark','status','created_at'];
  const data = [headers];
  for (const r of rows) data.push(fields.map(f => r[f] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('销售订单_数据.xlsx')}` });
  res.send(buf);
});

module.exports = router;
