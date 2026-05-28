const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM opportunities ORDER BY created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { title, sales_owner, contact_name, contact_phone, description, amount, stage, competition, progress, next_plan } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '商机名称必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO opportunities (id,title,sales_owner,contact_name,contact_phone,description,amount,stage,competition,progress,next_plan) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, title, sales_owner, contact_name, contact_phone, description, amount || 0, stage || 'contact', competition, progress, next_plan);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { title, sales_owner, contact_name, contact_phone, description, amount, stage, competition, progress, next_plan } = req.body;
  db.prepare('UPDATE opportunities SET title=?,sales_owner=?,contact_name=?,contact_phone=?,description=?,amount=?,stage=?,competition=?,progress=?,next_plan=? WHERE id=?')
    .run(title, sales_owner, contact_name, contact_phone, description, amount, stage, competition, progress, next_plan, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM opportunities WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
