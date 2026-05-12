const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT o.*, c.name AS customer_name FROM opportunities o LEFT JOIN customers c ON o.customer_id=c.id ORDER BY o.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { title, customer_id, stage, amount, probability, expected_close_date, owner, remark } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '机会名称必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO opportunities (id,title,customer_id,stage,amount,probability,expected_close_date,owner,remark) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, title, customer_id, stage || 'contact', amount || 0, probability || 0, expected_close_date, owner, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { title, customer_id, stage, amount, probability, expected_close_date, owner, remark } = req.body;
  db.prepare('UPDATE opportunities SET title=?,customer_id=?,stage=?,amount=?,probability=?,expected_close_date=?,owner=?,remark=? WHERE id=?')
    .run(title, customer_id, stage, amount, probability, expected_close_date, owner, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM opportunities WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
