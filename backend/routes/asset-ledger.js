const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM asset_ledger ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { customer_id, product_name, serial_no, deploy_date, warranty_expire, license_expire, status, remark } = req.body;
  if (!product_name) return res.status(400).json({ code: 400, message: '产品名称必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO asset_ledger (id,customer_id,product_name,serial_no,deploy_date,warranty_expire,license_expire,status,remark) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, customer_id, product_name, serial_no, deploy_date, warranty_expire, license_expire, status || 'active', remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { customer_id, product_name, serial_no, deploy_date, warranty_expire, license_expire, status, remark } = req.body;
  db.prepare('UPDATE asset_ledger SET customer_id=?,product_name=?,serial_no=?,deploy_date=?,warranty_expire=?,license_expire=?,status=?,remark=? WHERE id=?')
    .run(customer_id, product_name, serial_no, deploy_date, warranty_expire, license_expire, status, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM asset_ledger WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
