const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM returns ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { sales_order_id, product_id, quantity, reason } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO returns (id,sales_order_id,product_id,quantity,reason) VALUES (?,?,?,?,?)')
    .run(id, sales_order_id, product_id, quantity || 1, reason);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE returns SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM returns WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
