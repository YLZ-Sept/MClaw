const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM recruitment ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { department, position, headcount, status, requirements, salary_range } = req.body;
  if (!position) return res.status(400).json({ code: 400, message: '职位必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO recruitment (id,department,position,headcount,status,requirements,salary_range) VALUES (?,?,?,?,?,?,?)')
    .run(id, department, position, headcount || 1, status || 'open', requirements, salary_range);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { department, position, headcount, status, requirements, salary_range } = req.body;
  db.prepare('UPDATE recruitment SET department=?,position=?,headcount=?,status=?,requirements=?,salary_range=? WHERE id=?')
    .run(department, position, headcount, status, requirements, salary_range, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM candidates WHERE recruitment_id=?').run(req.params.id);
  db.prepare('DELETE FROM recruitment WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/:id/candidates', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM candidates WHERE recruitment_id=? ORDER BY created_at DESC').all(req.params.id) });
});

router.post('/:id/candidates', (req, res) => {
  const { name, phone, email, status, resume_path, remark } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '候选人名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO candidates (id,recruitment_id,name,phone,email,status,resume_path,remark) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, req.params.id, name, phone, email, status || 'pending', resume_path, remark);
  res.json({ code: 200, data: { id } });
});

router.put('/candidates/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE candidates SET status=? WHERE id=?').run(status, req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
