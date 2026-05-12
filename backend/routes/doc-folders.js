const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM document_folders ORDER BY name').all() });
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ code: 400, message: '分类名必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO document_folders (id,name) VALUES (?,?)').run(id, name);
  res.json({ code: 200, data: { id } });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM document_folders WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
