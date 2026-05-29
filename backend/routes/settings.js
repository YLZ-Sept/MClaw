const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM system_settings WHERE key=?').get(req.params.key);
  res.json({ code: 200, data: row ? row.value : null });
});

router.put('/:key', (req, res) => {
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ code: 400, message: '缺少 value' });
  db.prepare('INSERT INTO system_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(req.params.key, String(value));
  res.json({ code: 200, data: value });
});

module.exports = router;
