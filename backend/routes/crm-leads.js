const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { name, phone, company, source, status, assigned_to, remark } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '姓名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO leads (id,name,phone,company,source,status,assigned_to,remark) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, name, phone, company, source, status || 'new', assigned_to, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, phone, company, source, status, assigned_to, remark } = req.body;
  db.prepare('UPDATE leads SET name=?,phone=?,company=?,source=?,status=?,assigned_to=?,remark=? WHERE id=?')
    .run(name, phone, company, source, status, assigned_to, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
