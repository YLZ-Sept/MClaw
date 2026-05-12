const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT t.*, c.name AS customer_name FROM tickets t LEFT JOIN customers c ON t.customer_id=c.id ORDER BY t.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { customer_id, title, description, priority, status, assigned_to } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '工单标题必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO tickets (id,customer_id,title,description,priority,status,assigned_to) VALUES (?,?,?,?,?,?,?)')
    .run(id, customer_id, title, description, priority || 'medium', status || 'open', assigned_to);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { title, description, priority, status, assigned_to } = req.body;
  db.prepare('UPDATE tickets SET title=?,description=?,priority=?,status=?,assigned_to=? WHERE id=?')
    .run(title, description, priority, status, assigned_to, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tickets WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
