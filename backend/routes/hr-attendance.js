const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

// 考勤规则
router.get('/rules', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM attendance_rules ORDER BY name').all() });
});

router.post('/rules', (req, res) => {
  const { name, check_in_time, check_out_time, late_threshold, work_days } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '规则名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO attendance_rules (id,name,check_in_time,check_out_time,late_threshold,work_days) VALUES (?,?,?,?,?,?)')
    .run(id, name, check_in_time, check_out_time, late_threshold, work_days || '1,2,3,4,5');
  res.json({ code: 200, data: { id } });
});

router.put('/rules/:id', (req, res) => {
  const { name, check_in_time, check_out_time, late_threshold, work_days } = req.body;
  db.prepare('UPDATE attendance_rules SET name=?,check_in_time=?,check_out_time=?,late_threshold=?,work_days=? WHERE id=?')
    .run(name, check_in_time, check_out_time, late_threshold, work_days, req.params.id);
  res.json({ code: 200 });
});

router.delete('/rules/:id', (req, res) => {
  db.prepare('DELETE FROM attendance_rules WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 打卡
router.post('/clock-in', (req, res) => {
  const { employee_id, source } = req.body;
  if (!employee_id) return res.status(400).json({ code: 400, message: '员工ID必填' });
  const id = randomUUID();
  db.prepare("INSERT INTO clock_records (id,employee_id,clock_type,clock_time,source) VALUES (?,?,'in',datetime('now','localtime'),?)")
    .run(id, employee_id, source || 'manual');
  res.json({ code: 200, data: { id } });
});

router.post('/clock-out', (req, res) => {
  const { employee_id, source } = req.body;
  if (!employee_id) return res.status(400).json({ code: 400, message: '员工ID必填' });
  const id = randomUUID();
  db.prepare("INSERT INTO clock_records (id,employee_id,clock_type,clock_time,source) VALUES (?,?,'out',datetime('now','localtime'),?)")
    .run(id, employee_id, source || 'manual');
  res.json({ code: 200, data: { id } });
});

router.get('/records', (req, res) => {
  const { employee_id, date } = req.query;
  let sql = 'SELECT cr.*, e.name AS employee_name FROM clock_records cr JOIN employees e ON cr.employee_id=e.id WHERE 1=1';
  const params = [];
  if (employee_id) { sql += ' AND cr.employee_id=?'; params.push(employee_id); }
  if (date) { sql += " AND date(cr.clock_time)=?"; params.push(date); }
  sql += ' ORDER BY cr.clock_time DESC LIMIT 100';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

// 考勤报表
router.get('/report/monthly', (req, res) => {
  const { year, month, employee_id } = req.query;
  const y = year || new Date().getFullYear();
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const dateFilter = `${y}-${m}%`;
  let sql = `SELECT e.id AS employee_id, e.name AS employee_name,
    SUM(CASE WHEN cr.clock_type='in' THEN 1 ELSE 0 END) AS check_ins,
    SUM(CASE WHEN cr.clock_type='out' THEN 1 ELSE 0 END) AS check_outs
    FROM employees e LEFT JOIN clock_records cr ON e.id=cr.employee_id AND cr.clock_time LIKE ?
    WHERE 1=1`;
  const params = [dateFilter];
  if (employee_id) { sql += ' AND e.id=?'; params.push(employee_id); }
  sql += ' GROUP BY e.id ORDER BY e.name';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});

module.exports = router;
