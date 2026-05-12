const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT f.*, c.name AS customer_name FROM customer_feedback f LEFT JOIN customers c ON f.customer_id=c.id ORDER BY f.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { customer_id, rating, category, content, status } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO customer_feedback (id,customer_id,rating,category,content,status) VALUES (?,?,?,?,?,?)')
    .run(id, customer_id, rating, category, content, status || 'pending');
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { rating, category, content, status } = req.body;
  db.prepare('UPDATE customer_feedback SET rating=?,category=?,content=?,status=? WHERE id=?')
    .run(rating, category, content, status, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM customer_feedback WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
