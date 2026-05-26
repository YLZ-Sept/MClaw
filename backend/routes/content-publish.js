const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM content_publish ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

router.post('/', (req, res) => {
  const { platform, content_type, content, scheduled_at } = req.body || {};
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO content_publish (id, platform, content_type, content, scheduled_at) VALUES (?,?,?,?,?)`)
    .run(id, platform, content_type, content, scheduled_at);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const { platform, content_type, content, scheduled_at, status } = req.body || {};
  db.prepare(`UPDATE content_publish SET platform=COALESCE(?,platform), content_type=COALESCE(?,content_type), content=COALESCE(?,content), scheduled_at=COALESCE(?,scheduled_at), status=COALESCE(?,status) WHERE id=?`)
    .run(platform, content_type, content, scheduled_at, status, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM content_publish WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

module.exports = router;
