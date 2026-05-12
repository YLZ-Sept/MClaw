const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM marketing_campaigns ORDER BY created_at DESC').all() });
});

router.post('/', (req, res) => {
  const { name, type, status, budget, start_date, end_date, description } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '活动名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO marketing_campaigns (id,name,type,status,budget,start_date,end_date,description) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, name, type, status || 'draft', budget, start_date, end_date, description);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { name, type, status, budget, start_date, end_date, description } = req.body;
  db.prepare('UPDATE marketing_campaigns SET name=?,type=?,status=?,budget=?,start_date=?,end_date=?,description=? WHERE id=?')
    .run(name, type, status, budget, start_date, end_date, description, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM marketing_campaigns WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
