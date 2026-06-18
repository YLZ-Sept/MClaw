const { Router } = require('express');
const db = require('../db');
const router = Router();

const CATEGORIES = [
  { key: 'productivity', name: '办公效率', icon: 'Briefcase' },
  { key: 'content', name: '内容创作运营', icon: 'EditPen' },
  { key: 'finance', name: '财税法务商业', icon: 'Coin' },
  { key: 'devops', name: '开发运维技术', icon: 'Monitor' },
  { key: 'hr-service', name: '人力资源与客户服务', icon: 'Avatar' }
];

// GET /api/expert-agents?category=business&q=搜索词
router.get('/', (req, res) => {
  const { category, q } = req.query;
  let sql = 'SELECT * FROM agent_apps WHERE is_expert=1 AND status=\'active\'';
  const params = [];

  if (category) {
    sql += ' AND category=?';
    params.push(category);
  }
  if (q && q.trim()) {
    sql += ' AND (name LIKE ? OR desc LIKE ?)';
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }
  sql += ' ORDER BY category, name';

  const rows = db.prepare(sql).all(...params);
  res.json({ code: 200, data: rows });
});

// GET /api/expert-agents/categories
router.get('/categories', (req, res) => {
  const rows = db.prepare(
    'SELECT category, COUNT(*) as count FROM agent_apps WHERE is_expert=1 AND status=\'active\' GROUP BY category'
  ).all();

  const countMap = {};
  for (const r of rows) countMap[r.category] = r.count;

  const data = CATEGORIES.map(c => ({
    ...c,
    count: countMap[c.key] || 0
  }));

  res.json({ code: 200, data });
});

// GET /api/expert-agents/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM agent_apps WHERE id=? AND is_expert=1').get(req.params.id);
  if (!row) return res.status(404).json({ code: 404, message: '专家不存在' });
  res.json({ code: 200, data: row });
});

module.exports = router;
