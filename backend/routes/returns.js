const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  order_type TEXT DEFAULT 'sales',
  order_id TEXT,
  product_name TEXT,
  model TEXT,
  quantity REAL DEFAULT 1,
  reason TEXT,
  type TEXT DEFAULT 'return',
  exchange_product TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now','localtime'))
)`);

try { db.exec('ALTER TABLE returns ADD COLUMN order_type TEXT DEFAULT \'sales\''); } catch {}
try { db.exec('ALTER TABLE returns ADD COLUMN product_name TEXT'); } catch {}
try { db.exec('ALTER TABLE returns ADD COLUMN model TEXT'); } catch {}
try { db.exec('ALTER TABLE returns ADD COLUMN type TEXT DEFAULT \'return\''); } catch {}
try { db.exec('ALTER TABLE returns ADD COLUMN exchange_product TEXT'); } catch {}
try { db.exec('ALTER TABLE returns ADD COLUMN order_id TEXT'); } catch {}

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM returns ORDER BY created_at DESC LIMIT 500').all() });
});

router.post('/', (req, res) => {
  const { order_type, order_id, product_name, model, quantity, reason, type, exchange_product } = req.body;
  if (!product_name) return res.status(400).json({ code: 400, message: '产品名称必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO returns (id,order_type,order_id,product_name,model,quantity,reason,type,exchange_product) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, order_type||'sales', order_id||'', product_name, model||'', quantity||1, reason||'', type||'return', exchange_product||'');
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { status, type, exchange_product, reason } = req.body;
  db.prepare('UPDATE returns SET status=COALESCE(?,status), type=COALESCE(?,type), exchange_product=COALESCE(?,exchange_product), reason=COALESCE(?,reason) WHERE id=?')
    .run(status, type, exchange_product, reason, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM returns WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
