const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');

const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { name, phone, company, source, remark } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '客户名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO customers (id,name,phone,company,source,remark) VALUES (?,?,?,?,?,?)')
    .run(id, name, phone, company, source, remark);
  res.json({ code: 200, data: { id } });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ code: 404, message: '未找到' });
  res.json({ code: 200, data: row });
});

router.put('/:id', (req, res) => {
  const { name, phone, company, source, remark } = req.body;
  db.prepare('UPDATE customers SET name=?,phone=?,company=?,source=?,remark=? WHERE id=?')
    .run(name, phone, company, source, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM follow_ups WHERE customer_id=?').run(req.params.id);
  db.prepare('DELETE FROM customers WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/:id/follow-ups', (req, res) => {
  const list = db.prepare('SELECT * FROM follow_ups WHERE customer_id=? ORDER BY created_at DESC')
    .all(req.params.id);
  res.json({ code: 200, data: list });
});

router.post('/:id/follow-ups', (req, res) => {
  const { content, next_contact_date } = req.body;
  const id = randomUUID();
  db.prepare('INSERT INTO follow_ups (id,customer_id,content,next_contact_date) VALUES (?,?,?,?)')
    .run(id, req.params.id, content, next_contact_date);
  res.json({ code: 200, data: { id } });
});

module.exports = router;
