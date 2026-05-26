const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const { runCollect } = require('../bid-collector');
const router = Router();

// 招投标来源
router.get('/sources', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM bid_sources ORDER BY name').all() });
});
router.post('/sources', (req, res) => {
  const { name, url, parser_rule, interval_minutes } = req.body;
  if (!name || !url) return res.status(400).json({ code: 400, message: '名称和URL必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO bid_sources (id,name,url,parser_rule,interval_minutes) VALUES (?,?,?,?,?)')
    .run(id, name, url, parser_rule, interval_minutes || 360);
  res.json({ code: 200, data: { id } });
});
router.put('/sources/:id', (req, res) => {
  const { name, url, interval_minutes, enabled } = req.body;
  db.prepare('UPDATE bid_sources SET name=COALESCE(?,name), url=COALESCE(?,url), interval_minutes=COALESCE(?,interval_minutes), enabled=COALESCE(?,enabled) WHERE id=?')
    .run(name, url, interval_minutes, enabled, req.params.id);
  res.json({ code: 200 });
});
router.delete('/sources/:id', (req, res) => {
  db.prepare('DELETE FROM bid_items WHERE source_id=?').run(req.params.id);
  db.prepare('DELETE FROM bid_sources WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 关键词
router.get('/keywords', (req, res) => {
  res.json({ code: 200, data: db.prepare('SELECT * FROM bid_keywords ORDER BY keyword').all() });
});
router.post('/keywords', (req, res) => {
  const { keyword } = req.body;
  if (!keyword) return res.status(400).json({ code: 400, message: '关键词必填' });
  const id = randomUUID();
  try {
    db.prepare('INSERT INTO bid_keywords (id,keyword) VALUES (?,?)').run(id, keyword);
    res.json({ code: 200, data: { id } });
  } catch { res.status(400).json({ code: 400, message: '关键词已存在' }); }
});
router.delete('/keywords/:id', (req, res) => {
  db.prepare('DELETE FROM bid_keywords WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 招标条目
router.get('/items', (req, res) => {
  const { status, keyword } = req.query;
  let sql = 'SELECT bi.*, bs.name AS source_name FROM bid_items bi LEFT JOIN bid_sources bs ON bi.source_id=bs.id WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND bi.status=?'; params.push(status); }
  if (keyword) { sql += ' AND (bi.title LIKE ?)'; params.push(`%${keyword}%`); }
  sql += ' ORDER BY bi.created_at DESC LIMIT 200';
  res.json({ code: 200, data: db.prepare(sql).all(...params) });
});
router.put('/items/:id', (req, res) => {
  const { status, is_notified, bid_type, fetch_time, doc_deadline, bid_time, submit_type, amount, evaluation, collect_time } = req.body;
  db.prepare(`UPDATE bid_items SET
    status=COALESCE(?,status), is_notified=COALESCE(?,is_notified),
    bid_type=COALESCE(?,bid_type), fetch_time=COALESCE(?,fetch_time),
    doc_deadline=COALESCE(?,doc_deadline), bid_time=COALESCE(?,bid_time),
    submit_type=COALESCE(?,submit_type), amount=COALESCE(?,amount),
    evaluation=COALESCE(?,evaluation), collect_time=COALESCE(?,collect_time)
    WHERE id=?`).run(status, is_notified, bid_type, fetch_time, doc_deadline, bid_time, submit_type, amount, evaluation, collect_time, req.params.id);
  res.json({ code: 200 });
});
router.delete('/items/:id', (req, res) => {
  db.prepare('DELETE FROM bid_items WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 手动触发采集
router.post('/collect', async (req, res) => {
  try {
    const { start, end } = req.body;
    const result = await runCollect({ start, end });
    res.json({ code: 200, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
