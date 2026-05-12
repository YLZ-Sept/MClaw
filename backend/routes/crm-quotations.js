const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT q.*, c.name AS customer_name FROM quotations q LEFT JOIN customers c ON q.customer_id=c.id ORDER BY q.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { customer_id, title, total, status, valid_until, remark } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO quotations (id,customer_id,title,total,status,valid_until,remark) VALUES (?,?,?,?,?,?,?)')
    .run(id, customer_id, title, total, status || 'draft', valid_until, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { customer_id, title, total, status, valid_until, remark } = req.body;
  db.prepare('UPDATE quotations SET customer_id=?,title=?,total=?,status=?,valid_until=?,remark=? WHERE id=?')
    .run(customer_id, title, total, status, valid_until, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM quotation_items WHERE quotation_id=?').run(req.params.id);
  db.prepare('DELETE FROM quotations WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/:id/items', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM quotation_items WHERE quotation_id=?').all(req.params.id) });
});

router.post('/:id/items', (req, res) => {
  const { product_id, description, quantity, unit_price, total } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO quotation_items (id,quotation_id,product_id,description,quantity,unit_price,total) VALUES (?,?,?,?,?,?,?)')
    .run(id, req.params.id, product_id, description, quantity || 1, unit_price || 0, total || 0);
  res.json({ code: 200, data: { id } });
});

router.delete('/:id/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM quotation_items WHERE id=?').run(req.params.itemId);
  res.json({ code: 200 });
});

module.exports = router;
