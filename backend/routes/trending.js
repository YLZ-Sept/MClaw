const { Router } = require('express');
const db = require('../db');
const router = Router();

db.exec(`CREATE TABLE IF NOT EXISTS trending_products (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  total_sold REAL DEFAULT 0,
  trend_score REAL DEFAULT 0,
  status TEXT DEFAULT 'tracking',
  note TEXT,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
)`);

try { db.exec('ALTER TABLE trending_products ADD COLUMN note TEXT'); } catch {}

// 获取爆款列表（基于销售数据自动计算）
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT
      p.id AS product_id, p.name AS product_name, p.sku, p.sale_price,
      COALESCE(SUM(soi.quantity), 0) AS total_sold,
      COALESCE(SUM(soi.total), 0) AS total_revenue,
      COUNT(DISTINCT soi.sales_order_id) AS order_count
    FROM products p
    LEFT JOIN sales_order_items soi ON soi.product_id = p.id
    LEFT JOIN sales_orders so ON so.id = soi.sales_order_id
    GROUP BY p.id
    ORDER BY total_sold DESC, total_revenue DESC
    LIMIT 50
  `).all();

  // 合并手动追踪状态
  const tracked = db.prepare('SELECT * FROM trending_products').all();
  const trackedMap = {};
  tracked.forEach(t => { trackedMap[t.product_id] = t; });

  const data = rows.map(r => ({
    ...r,
    tracked: !!trackedMap[r.product_id],
    trend_status: trackedMap[r.product_id]?.status || null,
    trend_note: trackedMap[r.product_id]?.note || '',
    trend_id: trackedMap[r.product_id]?.id || null
  }));

  res.json({ code: 200, data });
});

// 手动标记/取消追爆款
router.post('/:productId/toggle', (req, res) => {
  const { productId } = req.params;
  const { note } = req.body || {};
  const existing = db.prepare('SELECT * FROM trending_products WHERE product_id=?').get(productId);
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);

  if (existing) {
    db.prepare('DELETE FROM trending_products WHERE product_id=?').run(productId);
    res.json({ code: 200, data: { tracked: false } });
  } else {
    const { randomUUID } = require('crypto');
    db.prepare('INSERT INTO trending_products (id,product_id,product_name,status,note) VALUES (?,?,?,?,?)')
      .run(randomUUID(), productId, product?.name || '', 'tracking', note || '');
    res.json({ code: 200, data: { tracked: true } });
  }
});

// 更新备注
router.put('/:productId', (req, res) => {
  const { note, status } = req.body;
  db.prepare('UPDATE trending_products SET note=COALESCE(?,note), status=COALESCE(?,status), updated_at=datetime(\'now\',\'localtime\') WHERE product_id=?')
    .run(note, status, req.params.productId);
  res.json({ code: 200 });
});

module.exports = router;
