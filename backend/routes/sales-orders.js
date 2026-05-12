const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT so.*, c.name AS customer_name FROM sales_orders so LEFT JOIN customers c ON so.customer_id=c.id ORDER BY so.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { customer_id, total, status, order_date, remark } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO sales_orders (id,customer_id,total,status,order_date,remark) VALUES (?,?,?,?,?,?)')
    .run(id, customer_id, total, status || 'draft', order_date, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { customer_id, total, status, order_date, remark } = req.body;
  db.prepare('UPDATE sales_orders SET customer_id=?,total=?,status=?,order_date=?,remark=? WHERE id=?')
    .run(customer_id, total, status, order_date, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM sales_order_items WHERE sales_order_id=?').run(req.params.id);
  db.prepare('DELETE FROM sales_orders WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/:id/items', (req, res) => {
  const items = db.prepare('SELECT soi.*, p.name AS product_name FROM sales_order_items soi LEFT JOIN products p ON soi.product_id=p.id WHERE soi.sales_order_id=?').all(req.params.id);
  res.json({ code: 200, data: items });
});

router.post('/:id/items', (req, res) => {
  const { product_id, quantity, unit_price, total } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO sales_order_items (id,sales_order_id,product_id,quantity,unit_price,total) VALUES (?,?,?,?,?,?)')
    .run(id, req.params.id, product_id, quantity || 1, unit_price || 0, total || 0);
  res.json({ code: 200, data: { id } });
});

router.delete('/:id/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM sales_order_items WHERE id=?').run(req.params.itemId);
  res.json({ code: 200 });
});

module.exports = router;
