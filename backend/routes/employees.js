const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');

const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM employees ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { name, department, role, phone, email } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '姓名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO employees (id,name,department,role,phone,email) VALUES (?,?,?,?,?,?)')
    .run(id, name, department, role, phone, email);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, department, role, phone, email } = req.body;
  db.prepare('UPDATE employees SET name=?,department=?,role=?,phone=?,email=? WHERE id=?')
    .run(name, department, role, phone, email, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM leave_requests WHERE employee_id=?').run(req.params.id);
  db.prepare('DELETE FROM employees WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/leave-requests', (req, res) => {
  const list = db.prepare(`
    SELECT lr.*, e.name AS employee_name
    FROM leave_requests lr JOIN employees e ON lr.employee_id = e.id
    ORDER BY lr.created_at DESC
  `).all();
  res.json({ code: 200, data: list });
});

router.post('/leave-requests', (req, res) => {
  const { employee_id, start_date, end_date, reason } = req.body;
  if (!employee_id || !start_date || !end_date) {
    return res.status(400).json({ code: 400, message: '参数不全' });
  }
  const id = randomUUID();
  db.prepare('INSERT INTO leave_requests (id,employee_id,start_date,end_date,reason) VALUES (?,?,?,?,?)')
    .run(id, employee_id, start_date, end_date, reason);
  res.json({ code: 200, data: { id } });
});

router.put('/leave-requests/:id/approve', (req, res) => {
  const { status, approver_id } = req.body;
  db.prepare('UPDATE leave_requests SET status=?,approver_id=? WHERE id=?')
    .run(status || 'approved', approver_id, req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
