const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');

const router = Router();

// 迁移：新字段
try { db.exec('ALTER TABLE employees ADD COLUMN gender TEXT DEFAULT \'\''); } catch {}
try { db.exec('ALTER TABLE employees ADD COLUMN hire_date TEXT DEFAULT \'\''); } catch {}
try { db.exec('ALTER TABLE employees ADD COLUMN contract_end TEXT DEFAULT \'\''); } catch {}

// 种子：导入员工档案 Excel（仅当表为空时）
try {
  const cnt = db.prepare('SELECT COUNT(*) AS c FROM employees').get().c;
  if (cnt === 0) {
    const path = require('path');
    const XLSX = require('xlsx');
    const fp = 'G:/桌面/人力资源管理模块/员工档案.xlsx';
    const wb = XLSX.readFile(fp);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const insert = db.prepare('INSERT INTO employees (id,name,gender,department,role,phone,hire_date,contract_end,email) VALUES (?,?,?,?,?,?,?,?,?)');
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      insert.run(randomUUID(), r[0]||'', r[1]||'', r[2]||'', r[3]||'', String(r[4]||''), String(r[5]||''), String(r[6]||''), r[7]||'');
    }
    console.log(`[employees] 已导入 ${rows.length - 1} 条员工档案`);
  }
} catch (e) { console.log('[employees] 种子导入跳过:', e.message); }

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM employees ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { name, gender, department, role, phone, hire_date, contract_end, email } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '姓名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO employees (id,name,gender,department,role,phone,hire_date,contract_end,email) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, name, gender||'', department||'', role||'', phone||'', hire_date||'', contract_end||'', email||'');
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, gender, department, role, phone, hire_date, contract_end, email } = req.body;
  db.prepare('UPDATE employees SET name=?,gender=?,department=?,role=?,phone=?,hire_date=?,contract_end=?,email=? WHERE id=?')
    .run(name, gender||'', department||'', role||'', phone||'', hire_date||'', contract_end||'', email||'', req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM leave_requests WHERE employee_id=?').run(req.params.id);
  db.prepare('DELETE FROM employees WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
