const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const { customer_id } = req.query;
  let sql = 'SELECT * FROM contacts';
  const params = [];
  if (customer_id) { sql += ' WHERE customer_id=?'; params.push(customer_id); }
  sql += ' ORDER BY created_at DESC';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

router.post('/', (req, res) => {
  const { customer_id, name, position, phone, email, is_primary, remark } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '联系人名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO contacts (id,customer_id,name,position,phone,email,is_primary,remark) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, customer_id, name, position, phone, email, is_primary || 0, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, position, phone, email, is_primary, remark } = req.body;
  db.prepare('UPDATE contacts SET name=?,position=?,phone=?,email=?,is_primary=?,remark=? WHERE id=?')
    .run(name, position, phone, email, is_primary, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contacts WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
