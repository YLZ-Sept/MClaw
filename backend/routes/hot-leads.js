// 爆款视频 — 线索列表
const { Router } = require('express');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM hot_leads ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

module.exports = router;
