const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const router = Router();

// ─── CRUD ───

router.get('/', (req, res) => {
  const { keyword, region, industry, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM bid_statistics WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND (project_name LIKE ? OR bidder LIKE ? OR win_company LIKE ? OR project_content LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }
  if (region) { sql += ' AND region=?'; params.push(region); }
  if (industry) { sql += ' AND industry=?'; params.push(industry); }
  sql += ' ORDER BY created_at DESC';
  const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) AS cnt')).get(...params)?.cnt || 0;
  const offset = (Number(page) - 1) * Number(pageSize);
  const rows = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  res.json({ code: 200, data: { rows, total, page: Number(page), pageSize: Number(pageSize) } });
});

const ALL_FIELDS = ['bid_publish_time','registration_time','bid_time','region','industry','bidder','bid_company',
  'project_name','project_content','budget_amount','url','bid_method','bid_win_time','notice_time','win_company','win_amount','remark','source'];

router.post('/', (req, res) => {
  const fields = ALL_FIELDS;
  const vals = fields.map(f => req.body[f] ?? null);
  if (!req.body.project_name) return res.status(400).json({ code: 400, message: '项目名称必填' });
  const id = randomUUID();
  const sql = `INSERT INTO bid_statistics (id,${fields.join(',')}) VALUES (?,${fields.map(()=>'?').join(',')})`;
  db.prepare(sql).run(id, ...vals);
  res.json({ code: 200, data: { id } });
});

router.put('/:id', (req, res) => {
  const fields = ALL_FIELDS;
  const sets = fields.map(f => `${f}=COALESCE(?,${f})`).join(',');
  const vals = fields.map(f => req.body[f] ?? null);
  db.prepare(`UPDATE bid_statistics SET ${sets} WHERE id=?`).run(...vals, req.params.id);
  res.json({ code: 200 });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bid_statistics WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 批量导入（采集结果写入）
router.post('/batch', (req, res) => {
  const { items } = req.body;
  if (!items || !items.length) return res.status(400).json({ code: 400, message: '无数据' });
  const insert = db.prepare(`INSERT OR IGNORE INTO bid_statistics (id,${ALL_FIELDS.join(',')}) VALUES (?,${ALL_FIELDS.map(()=>'?').join(',')})`);
  const tx = db.transaction(() => {
    let count = 0;
    for (const item of items) {
      if (!item.project_name) continue;
      const r = insert.run(randomUUID(),
        item.bid_publish_time||null, item.registration_time||null, item.bid_time||null,
        item.region||'昆明', item.industry||null, item.bidder||null, item.bid_company||null,
        item.project_name, item.project_content||null, item.budget_amount||null,
        item.url||null, item.bid_method||'公开招标', item.bid_win_time||null, item.notice_time||null,
        item.win_company||null, item.win_amount||null, item.remark||null, item.source||'crawl4ai');
      count += r.changes;
    }
    return count;
  });
  const count = tx();
  res.json({ code: 200, data: { inserted: count } });
});

// ─── 采集触发 ───

router.post('/collect', async (req, res) => {
  try {
    const { method } = req.body;
    let result;
    if (method === 'woyaobid') {
      result = await require('../services/ztb-sjcj-bridge').scrape(req.body);
    } else {
      // default: web crawler from bid_sources
      result = await require('../services/web-bid-crawler').runCollect(req.body);
    }
    res.json({ code: 200, data: result });
  } catch (err) {
    if (err.needsLogin || (err.message && err.message.includes('未登录'))) {
      return res.json({ code: 200, data: { needsLogin: true, message: err.message } });
    }
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
