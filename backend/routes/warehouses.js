const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM warehouses ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { name, address, manager, remark } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '仓库名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO warehouses (id,name,address,manager,remark) VALUES (?,?,?,?,?)')
    .run(id, name, address, manager, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, address, manager, remark } = req.body;
  db.prepare('UPDATE warehouses SET name=?,address=?,manager=?,remark=? WHERE id=?')
    .run(name, address, manager, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM inventory WHERE warehouse_id=?').run(req.params.id);
  db.prepare('DELETE FROM warehouses WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
