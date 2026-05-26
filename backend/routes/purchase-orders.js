const { Router } = require('express');
const { randomUUID } = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../db');
const router = Router();

// 检测并迁移旧 schema（有 supplier_id 列表示旧表结构）
const poHasOld = (() => { try { return !!db.prepare("SELECT supplier_id FROM purchase_orders LIMIT 0").columns(); } catch { return false; } })();
if (poHasOld) {
  db.exec('DROP TABLE IF EXISTS purchase_orders_old');
  db.exec('ALTER TABLE purchase_orders RENAME TO purchase_orders_old');
  db.exec(`CREATE TABLE purchase_orders (
    id TEXT PRIMARY KEY,
    supplier TEXT,
    brand TEXT,
    category TEXT,
    name TEXT NOT NULL,
    model TEXT,
    quantity REAL DEFAULT 1,
    unit TEXT DEFAULT '套',
    serial_number TEXT,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    stock_date TEXT,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  try { db.exec(`INSERT INTO purchase_orders (id,supplier,name,model,quantity,unit,unit_price,total_price,stock_date,status,created_at)
    SELECT id,COALESCE(supplier,''),COALESCE(name,'未命名'),model,quantity,COALESCE(unit,'套'),COALESCE(unit_price,0),COALESCE(total_price,0),stock_date,status,created_at FROM purchase_orders_old`); } catch {}
  db.exec('DROP TABLE IF EXISTS purchase_orders_old');
}
db.exec(`CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  supplier TEXT,
  brand TEXT,
  category TEXT,
  name TEXT NOT NULL,
  model TEXT,
  quantity REAL DEFAULT 1,
  unit TEXT DEFAULT '套',
  serial_number TEXT,
  unit_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  stock_date TEXT,
  status TEXT DEFAULT 'draft',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

const upload = multer({ dest: path.join(__dirname, '..', 'uploads', 'temp') });

router.get('/', (req, res) => {
  const { keyword } = req.query;
  let sql = 'SELECT * FROM purchase_orders WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND (name LIKE ? OR supplier LIKE ? OR model LIKE ? OR brand LIKE ? OR serial_number LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

router.post('/', (req, res) => {
  const { supplier, brand, category, name, model, quantity, unit, serial_number, unit_price, total_price, stock_date } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '名称必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO purchase_orders (id,supplier,brand,category,name,model,quantity,unit,serial_number,unit_price,total_price,stock_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, supplier||'', brand||'', category||'', name, model||'', quantity||1, unit||'套', serial_number||'', unit_price||0, total_price||0, stock_date||'');
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { supplier, brand, category, name, model, quantity, unit, serial_number, unit_price, total_price, stock_date, status } = req.body;
  db.prepare(`UPDATE purchase_orders SET supplier=COALESCE(?,supplier),brand=COALESCE(?,brand),category=COALESCE(?,category),name=COALESCE(?,name),model=COALESCE(?,model),quantity=COALESCE(?,quantity),unit=COALESCE(?,unit),serial_number=COALESCE(?,serial_number),unit_price=COALESCE(?,unit_price),total_price=COALESCE(?,total_price),stock_date=COALESCE(?,stock_date),status=COALESCE(?,status) WHERE id=?`)
    .run(supplier,brand,category,name,model,quantity,unit,serial_number,unit_price,total_price,stock_date,status,req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM purchase_orders WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择文件' });
  const wb = XLSX.readFile(req.file.path);
  const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  fs.unlinkSync(req.file.path);
  let count = 0;
  for (let i = 1; i < data.length; i++) {
    const r = data[i]; if (!r || !r[3]) continue;
    const id = randomUUID();
    db.prepare(`INSERT INTO purchase_orders (id,supplier,brand,category,name,model,quantity,unit,serial_number,unit_price,total_price,stock_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(r[0]||''), String(r[1]||''), String(r[2]||''), String(r[3]||''), String(r[4]||''), Number(r[5])||1, String(r[6]||'套'), String(r[7]||''), Number(r[8])||0, Number(r[9])||0, String(r[10]||''));
    count++;
  }
  res.json({ code: 200, data: { count } });
});

module.exports = router;
