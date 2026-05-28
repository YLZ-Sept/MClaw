// 爆款视频 — 产品配置 CRUD
const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM hot_products ORDER BY created_at DESC').all();
  res.json({ code: 200, data: rows });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM hot_products WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ code: 404, message: '产品不存在' });
  res.json({ code: 200, data: row });
});

router.post('/', (req, res) => {
  const { brand_name, description, selling_points, contact_info, target_audience, industry_tags } = req.body;
  if (!brand_name) return res.status(400).json({ code: 400, message: 'brand_name 必填' });
  const id = randomUUID();
  db.prepare(`INSERT INTO hot_products (id,brand_name,description,selling_points,contact_info,target_audience,industry_tags)
    VALUES (?,?,?,?,?,?,?)`).run(id, brand_name, description || '', selling_points || '[]', contact_info || '', target_audience || '', industry_tags || '');
  const row = db.prepare('SELECT * FROM hot_products WHERE id=?').get(id);
  res.json({ code: 200, data: row });
});

router.put('/:id', (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_products WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ code: 404, message: '产品不存在' });
  const { brand_name, description, selling_points, contact_info, target_audience, industry_tags } = req.body;
  db.prepare(`UPDATE hot_products SET brand_name=?,description=?,selling_points=?,contact_info=?,target_audience=?,industry_tags=?,updated_at=datetime('now','localtime') WHERE id=?`)
    .run(brand_name ?? cur.brand_name, description ?? cur.description, selling_points ?? cur.selling_points,
      contact_info ?? cur.contact_info, target_audience ?? cur.target_audience, industry_tags ?? cur.industry_tags, req.params.id);
  const row = db.prepare('SELECT * FROM hot_products WHERE id=?').get(req.params.id);
  res.json({ code: 200, data: row });
});

module.exports = router;
