const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT d.*, e.name AS manager_name FROM departments d LEFT JOIN employees e ON d.manager_id=e.id ORDER BY d.name').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { name, parent_id, manager_id, remark } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '部门名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO departments (id,name,parent_id,manager_id,remark) VALUES (?,?,?,?,?)')
    .run(id, name, parent_id || null, manager_id, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, parent_id, manager_id, remark } = req.body;
  db.prepare('UPDATE departments SET name=?,parent_id=?,manager_id=?,remark=? WHERE id=?')
    .run(name, parent_id || null, manager_id, remark, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE departments SET parent_id=NULL WHERE parent_id=?').run(req.params.id);
  db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
