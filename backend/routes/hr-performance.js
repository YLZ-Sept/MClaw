const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/schemes', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM performance_schemes ORDER BY created_at DESC').all() });
});

router.post('/schemes', (req, res) => {
  const { name, period, status } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '方案名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO performance_schemes (id,name,period,status) VALUES (?,?,?,?)')
    .run(id, name, period || 'quarterly', status || 'active');
  res.json({ code: 200, data: { id } });
});

router.delete('/schemes/:id', (req, res) => {
  db.prepare('DELETE FROM performance_items WHERE scheme_id=?').run(req.params.id);
  db.prepare('DELETE FROM performance_schemes WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

router.get('/schemes/:id/items', (req, res) => {
  const list = db.prepare('SELECT pi.*, e.name AS employee_name FROM performance_items pi JOIN employees e ON pi.employee_id=e.id WHERE pi.scheme_id=? ORDER BY e.name').all(req.params.id);
  res.json({ code: 200, data: list });
});

router.post('/schemes/:id/items', (req, res) => {
  const { employee_id, indicator, weight, target, self_score, leader_score, comment } = req.body;
  if (!employee_id || !indicator) return res.status(400).json({ code: 400, message: '参数不全' });
  const id = randomUUID();
  db.prepare('INSERT INTO performance_items (id,scheme_id,employee_id,indicator,weight,target,self_score,leader_score,comment) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.params.id, employee_id, indicator, weight || 0, target, self_score, leader_score, comment);
  res.json({ code: 200, data: { id } });
});

router.put('/items/:id', (req, res) => {
  const { self_score, leader_score, comment } = req.body;
  db.prepare('UPDATE performance_items SET self_score=?,leader_score=?,comment=? WHERE id=?')
    .run(self_score, leader_score, comment, req.params.id);
  res.json({ code: 200 });
});

router.delete('/items/:id', (req, res) => {
  db.prepare('DELETE FROM performance_items WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 汇总报表
router.get('/report', (req, res) => {
  const { scheme_id } = req.query;
  let sql = `SELECT e.id AS employee_id, e.name AS employee_name, e.department,
    COUNT(pi.id) AS kpi_count, ROUND(AVG(pi.leader_score),1) AS avg_score
    FROM performance_items pi JOIN employees e ON pi.employee_id=e.id
    WHERE pi.scheme_id=? GROUP BY e.id ORDER BY avg_score DESC`;
  res.json({ code: 200, data: db.prepare(sql).all(scheme_id || '') });
});

module.exports = router;
