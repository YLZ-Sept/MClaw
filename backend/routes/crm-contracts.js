const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { title, contract_no, sales_owner, contact_name, contact_phone, content, amount, signed_date, warranty_period, prepaid_amount, receivable_amount, invoice, delivery_progress, remark } = req.body;
  if (!title) return res.status(400).json({ code: 400, message: '合同名称必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO contracts (id,title,contract_no,sales_owner,contact_name,contact_phone,content,amount,signed_date,warranty_period,prepaid_amount,receivable_amount,invoice,delivery_progress,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, title, contract_no, sales_owner, contact_name, contact_phone, content, amount || 0, signed_date, warranty_period, prepaid_amount || 0, receivable_amount || 0, invoice, delivery_progress, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { title, contract_no, sales_owner, contact_name, contact_phone, content, amount, signed_date, warranty_period, prepaid_amount, receivable_amount, invoice, delivery_progress, remark } = req.body;
  db.prepare('UPDATE contracts SET title=?,contract_no=?,sales_owner=?,contact_name=?,contact_phone=?,content=?,amount=?,signed_date=?,warranty_period=?,prepaid_amount=?,receivable_amount=?,invoice=?,delivery_progress=?,remark=? WHERE id=?')
    .run(title, contract_no, sales_owner, contact_name, contact_phone, content, amount, signed_date, warranty_period, prepaid_amount, receivable_amount, invoice, delivery_progress, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM contracts WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
