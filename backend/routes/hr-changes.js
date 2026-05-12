const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const list = db.prepare('SELECT pc.*, e.name AS employee_name FROM personnel_changes pc JOIN employees e ON pc.employee_id=e.id ORDER BY pc.created_at DESC').all();
  res.json({ code: 200, data: list });
});

router.post('/', (req, res) => {
  const { employee_id, type, old_department, new_department, old_role, new_role, effective_date, reason } = req.body;
  if (!employee_id || !type) return res.status(400).json({ code: 400, message: '参数不全' });
  const id = randomUUID();
  db.prepare('INSERT INTO personnel_changes (id,employee_id,type,old_department,new_department,old_role,new_role,effective_date,reason) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, employee_id, type, old_department, new_department, old_role, new_role, effective_date, reason);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE personnel_changes SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM personnel_changes WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
