const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM suppliers ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { name, contact_person, phone, email, address, remark } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '供应商名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO suppliers (id,name,contact_person,phone,email,address,remark) VALUES (?,?,?,?,?,?,?)')
    .run(id, name, contact_person, phone, email, address, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, contact_person, phone, email, address, remark } = req.body;
  db.prepare('UPDATE suppliers SET name=?,contact_person=?,phone=?,email=?,address=?,remark=? WHERE id=?')
    .run(name, contact_person, phone, email, address, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM purchase_orders WHERE supplier_id=?').run(req.params.id);
  db.prepare('DELETE FROM suppliers WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
