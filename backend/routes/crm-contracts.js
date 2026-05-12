const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT ct.*, c.name AS customer_name FROM contracts ct LEFT JOIN customers c ON ct.customer_id=c.id ORDER BY ct.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { customer_id, title, total, status, start_date, end_date, content } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '合同标题必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO contracts (id,customer_id,title,total,status,start_date,end_date,content) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, customer_id, title, total, status || 'draft', start_date, end_date, content);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { title, total, status, start_date, end_date, content } = req.body;
  db.prepare('UPDATE contracts SET title=?,total=?,status=?,start_date=?,end_date=?,content=? WHERE id=?')
    .run(title, total, status, start_date, end_date, content, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contracts WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
