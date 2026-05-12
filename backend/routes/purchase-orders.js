const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT po.*, s.name AS supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id=s.id ORDER BY po.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { supplier_id, total, status, ordered_date, remark } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO purchase_orders (id,supplier_id,total,status,ordered_date,remark) VALUES (?,?,?,?,?,?)')
    .run(id, supplier_id, total, status || 'draft', ordered_date, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { supplier_id, total, status, ordered_date, received_date, remark } = req.body;
  db.prepare('UPDATE purchase_orders SET supplier_id=?,total=?,status=?,ordered_date=?,received_date=?,remark=? WHERE id=?')
    .run(supplier_id, total, status, ordered_date, received_date, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id=?').run(req.params.id);
  db.prepare('DELETE FROM purchase_orders WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/:id/items', (req, res) => {
  const items = db.prepare('SELECT poi.*, p.name AS product_name FROM purchase_order_items poi LEFT JOIN products p ON poi.product_id=p.id WHERE poi.purchase_order_id=?').all(req.params.id);
  res.json({ code: 200, data: items });
});

router.post('/:id/items', (req, res) => {
  const { product_id, quantity, unit_price, total } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO purchase_order_items (id,purchase_order_id,product_id,quantity,unit_price,total) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, product_id, quantity || 1, unit_price || 0, total || 0);
  res.json({ code: 200, data: { id } });
});

router.delete('/:id/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM purchase_order_items WHERE id=?').run(req.params.itemId);
  res.json({ code: 200 });
});

module.exports = router;
