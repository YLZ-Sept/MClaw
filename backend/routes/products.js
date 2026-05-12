const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');

const router = Router();

const DEFAULT_WH = 'wh-default';

router.get('/', (req, res) => {
  const list = db.prepare(`
    SELECT p.*, i.quantity, i.warehouse_id
    FROM products p LEFT JOIN inventory i ON p.id = i.product_id
    ORDER BY p.created_at DESC
  `).all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { name, sku, unit, sale_price, cost_price } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '产品名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO products (id,name,sku,unit,sale_price,cost_price) VALUES (?,?,?,?,?,?)')
    .run(id, name, sku, unit, sale_price, cost_price);
  db.prepare('INSERT INTO inventory (product_id,warehouse_id,quantity) VALUES (?,?,0)').run(id, DEFAULT_WH);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, sku, unit, sale_price, cost_price } = req.body;
  db.prepare('UPDATE products SET name=?,sku=?,unit=?,sale_price=?,cost_price=? WHERE id=?')
    .run(name, sku, unit, sale_price, cost_price, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM stock_transactions WHERE product_id=?').run(req.params.id);
  db.prepare('DELETE FROM inventory_alerts WHERE product_id=?').run(req.params.id);
  db.prepare('DELETE FROM inventory WHERE product_id=?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.post('/stock-in', (req, res) => {
  const { product_id, quantity, warehouse_id, operator, remark } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ code: 400, message: '参数不全' });
  const wid = warehouse_id || DEFAULT_WH;
  const id = randomUUID();
  db.prepare(`INSERT INTO stock_transactions (id,product_id,type,quantity,warehouse_id,operator,remark)
    VALUES (?,?,'in',?,?,?,?)`).run(id, product_id, quantity, wid, operator, remark);
  db.prepare(`INSERT INTO inventory (product_id,warehouse_id,quantity) VALUES (?,?,?)
    ON CONFLICT(product_id,warehouse_id) DO UPDATE SET quantity = quantity + ?`)
    .run(product_id, wid, quantity, quantity);
  res.json({ code: 200, data: { id } });
});

router.post('/stock-out', (req, res) => {
  const { product_id, quantity, warehouse_id, operator, remark } = req.body;
  if (!product_id || !quantity) return res.status(400).json({ code: 400, message: '参数不全' });
  const wid = warehouse_id || DEFAULT_WH;
  const current = db.prepare('SELECT quantity FROM inventory WHERE product_id=? AND warehouse_id=?')
    .get(product_id, wid);
  if (!current || current.quantity < quantity) {
    return res.status(400).json({ code: 400, message: '库存不足' });
  }
  const id = randomUUID();
  db.prepare(`INSERT INTO stock_transactions (id,product_id,type,quantity,warehouse_id,operator,remark)
    VALUES (?,?,'out',?,?,?,?)`).run(id, product_id, quantity, wid, operator, remark);
  db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE product_id=? AND warehouse_id=?')
    .run(quantity, product_id, wid);
  res.json({ code: 200, data: { id } });
});

router.get('/stock-query', (req, res) => {
  const list = db.prepare(`
    SELECT i.*, p.name, p.sku, p.unit, w.name AS warehouse_name
    FROM inventory i JOIN products p ON i.product_id = p.id
    LEFT JOIN warehouses w ON i.warehouse_id = w.id
    ORDER BY i.quantity ASC
  `).all();
  res.json({ code: 200, data: list });
});

router.get('/transactions', (req, res) => {
  const { product_id } = req.query;
  let sql = 'SELECT st.*, p.name AS product_name FROM stock_transactions st JOIN products p ON st.product_id = p.id';
  const params = [];
  if (product_id) { sql += ' WHERE st.product_id=?'; params.push(product_id); }
  sql += ' ORDER BY st.created_at DESC LIMIT 100';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// 库存预警
router.get('/alerts', (req, res) => {
  const list = db.prepare(`
    SELECT a.*, p.name AS product_name, p.sku, i.quantity
    FROM inventory_alerts a JOIN products p ON a.product_id = p.id
    LEFT JOIN inventory i ON i.product_id = a.product_id AND (a.warehouse_id IS NULL OR i.warehouse_id = a.warehouse_id)
    ORDER BY p.name
  `).all();
  res.json({ code: 200, data: list });
});

router.post('/alerts', (req, res) => {
  const { product_id, warehouse_id, min_quantity, max_quantity, enabled } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO inventory_alerts (id,product_id,warehouse_id,min_quantity,max_quantity,enabled) VALUES (?,?,?,?,?,?)')
    .run(id, product_id, warehouse_id, min_quantity || 0, max_quantity, enabled !== false ? 1 : 0);
  res.json({ code: 200, data: { id } });
});

router.delete('/alerts/:id', (req, res) => {
  db.prepare('DELETE FROM inventory_alerts WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
