const { Router } = require('express');
const { randomUUID } = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS asset_ledger (
  id TEXT PRIMARY KEY,
  manufacturer TEXT,
  category TEXT,
  product_name TEXT NOT NULL,
  model TEXT,
  unit TEXT DEFAULT '套',
  in_quantity REAL DEFAULT 0,
  out_quantity REAL DEFAULT 0,
  balance REAL DEFAULT 0,
  unit_price REAL DEFAULT 0,
  order_total REAL DEFAULT 0,
  inventory_value REAL DEFAULT 0,
  stock_date TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

try { db.exec('ALTER TABLE asset_ledger ADD COLUMN manufacturer TEXT'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN category TEXT'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN model TEXT'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN in_quantity REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN out_quantity REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN balance REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN unit_price REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN order_total REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN inventory_value REAL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN stock_date TEXT'); } catch {}
try { db.exec('ALTER TABLE asset_ledger ADD COLUMN unit TEXT DEFAULT \'套\''); } catch {}

const upload = multer({ dest: path.join(__dirname, '..', 'uploads', 'temp') });

router.get('/', (req, res) => {
  const { keyword } = req.query;
  let sql = 'SELECT * FROM asset_ledger WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND (product_name LIKE ? OR manufacturer LIKE ? OR model LIKE ? OR category LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

router.post('/', (req, res) => {
  const { manufacturer, category, product_name, model, unit, in_quantity, out_quantity, balance, unit_price, order_total, inventory_value, stock_date } = req.body;
  if (!product_name) return res.status(400).json({ code: 400, message: '产品名称必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO asset_ledger (id,manufacturer,category,product_name,model,unit,in_quantity,out_quantity,balance,unit_price,order_total,inventory_value,stock_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, manufacturer||'', category||'', product_name, model||'', unit||'套', in_quantity||0, out_quantity||0, balance||0, unit_price||0, order_total||0, inventory_value||0, stock_date||'');
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { manufacturer, category, product_name, model, unit, in_quantity, out_quantity, balance, unit_price, order_total, inventory_value, stock_date } = req.body;
  db.prepare(`UPDATE asset_ledger SET manufacturer=COALESCE(?,manufacturer),category=COALESCE(?,category),product_name=COALESCE(?,product_name),model=COALESCE(?,model),unit=COALESCE(?,unit),in_quantity=COALESCE(?,in_quantity),out_quantity=COALESCE(?,out_quantity),balance=COALESCE(?,balance),unit_price=COALESCE(?,unit_price),order_total=COALESCE(?,order_total),inventory_value=COALESCE(?,inventory_value),stock_date=COALESCE(?,stock_date) WHERE id=?`)
    .run(manufacturer,category,product_name,model,unit,in_quantity,out_quantity,balance,unit_price,order_total,inventory_value,stock_date,req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM asset_ledger WHERE id=?').run(req.params.id);
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
    db.prepare(`INSERT INTO asset_ledger (id,manufacturer,category,product_name,model,unit,in_quantity,out_quantity,balance,unit_price,order_total,inventory_value,stock_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, String(r[0]||''), String(r[1]||''), String(r[2]||''), String(r[3]||''), String(r[4]||'套'), Number(r[5])||0, Number(r[6])||0, Number(r[7])||0, Number(r[8])||0, Number(r[9])||0, Number(r[10])||0, String(r[11]||''));
    count++;
  }
  res.json({ code: 200, data: { count } });
});

module.exports = router;
