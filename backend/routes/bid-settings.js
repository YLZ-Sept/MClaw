// bid-agent settings API — collection routes, sources, classified results, woyaobid cookie
const { Router } = require('express');
const { randomUUID } = require('crypto');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const router = Router();
const TXT_DIR = path.join(__dirname, '..', 'data', 'bid-txt');
const COOKIE_FILE = path.join(__dirname, '..', 'data', 'woyaobid-cookies.json');
const INTERVAL_FILE = path.join(__dirname, '..', 'data', 'bid-route-intervals.json');

function readIntervals() {
  try { return JSON.parse(fs.readFileSync(INTERVAL_FILE, 'utf-8')); } catch { return { crawl4ai: 6, scrapling: 12, woyaobid: 24 }; }
}
function writeIntervals(data) {
  const dir = path.dirname(INTERVAL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(INTERVAL_FILE, JSON.stringify(data, null, 2));
}

// Keywords for classification
const WIN_KW = ['中标', '成交', '结果'];

function classify(title) {
  for (const kw of WIN_KW) if (title.includes(kw)) return 'zhongbiao';
  return 'caiyou';
}

router.get('/settings', (req, res) => {
  const intervals = readIntervals();
  const { timeRange } = req.query; // 7d | 30d | 90d | 365d | all

  // Collection routes info
  const routes = [
    { engine: 'crawl4ai', label: 'Crawl4AI', desc: 'MCP 协议 + Playwright 浏览器 + LLM 结构化提取', status: 'active', interval_hours: intervals.crawl4ai || 6 },
    { engine: 'scrapling', label: 'Scrapling', desc: 'Python 子进程 + DynamicFetcher (Playwright) + Regex 提取', status: 'active', interval_hours: intervals.scrapling || 12 },
    { engine: 'woyaobid', label: '乙方宝(千里马)', desc: 'API 逆向 + Cookie 认证，采集企业招标信息', status: 'active', interval_hours: intervals.woyaobid || 24 }
  ];

  // Collection sources
  const sources = db.prepare('SELECT * FROM bid_sources ORDER BY name').all();

  // Latest txt files
  let latestTxts = [];
  try {
    if (fs.existsSync(TXT_DIR)) {
      latestTxts = fs.readdirSync(TXT_DIR)
        .filter(f => f.endsWith('.txt'))
        .map(f => {
          const stat = fs.statSync(path.join(TXT_DIR, f));
          return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime))
        .slice(0, 10);
    }
  } catch {}

  // Time filter
  const days = parseInt(timeRange) || 0;
  let timeFilter = '';
  let timeParams = [];
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    timeFilter = ' WHERE bi.created_at >= ?';
    timeParams = [since];
  }

  // Stats
  let totalItems, newItems, recentCollected;
  if (days > 0) {
    const since = timeParams[0];
    totalItems = db.prepare('SELECT COUNT(*) AS cnt FROM bid_items WHERE created_at >= ?').get(since)?.cnt || 0;
    newItems = db.prepare("SELECT COUNT(*) AS cnt FROM bid_items WHERE status='new' AND created_at >= ?").get(since)?.cnt || 0;
    recentCollected = db.prepare('SELECT COUNT(*) AS cnt FROM bid_items WHERE created_at >= ?').get(since)?.cnt || 0;
  } else {
    totalItems = db.prepare('SELECT COUNT(*) AS cnt FROM bid_items').get()?.cnt || 0;
    newItems = db.prepare("SELECT COUNT(*) AS cnt FROM bid_items WHERE status='new'").get()?.cnt || 0;
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    recentCollected = db.prepare('SELECT COUNT(*) AS cnt FROM bid_items WHERE created_at >= ?').get(weekAgo)?.cnt || 0;
  }

  // Classified items for frontend tables
  const recentItems = db.prepare(
    `SELECT bi.title, bi.url, bi.bid_type, bi.amount, bi.win_amount, bi.doc_deadline, bi.bid_time, bi.purchase_requirements, bi.created_at, bi.notice_time, bi.bidder, bi.win_company, bi.region, bi.industry, bs.name AS source_name FROM bid_items bi LEFT JOIN bid_sources bs ON bi.source_id=bs.id${timeFilter} ORDER BY bi.created_at DESC LIMIT 200`
  ).all(...timeParams);

  const zhongbiao_items = [];
  const caiyou_items = [];
  for (const item of recentItems) {
    if (classify(item.title) === 'zhongbiao') {
      if (zhongbiao_items.length < 50) zhongbiao_items.push({
        bid_time: item.bid_time || item.notice_time || '',
        doc_deadline: item.doc_deadline || '',
        source_name: item.source_name || '',
        bidder: item.bidder || '',
        win_company: item.win_company || '',
        title: item.title || '',
        purchase_requirements: item.purchase_requirements || '',
        amount: item.amount || '',
        win_amount: item.win_amount || '',
        url: item.url || '',
        bid_type: item.bid_type || '',
        region: item.region || '',
        industry: item.industry || ''
      });
    } else {
      if (caiyou_items.length < 50) caiyou_items.push({
        source_name: item.source_name || '',
        bidder: item.bidder || '',
        title: item.title || '',
        amount: item.amount || '',
        purchase_requirements: item.purchase_requirements || '',
        doc_deadline: item.doc_deadline || '',
        notice_time: item.notice_time || item.created_at || '',
        url: item.url || '',
        bid_type: item.bid_type || '',
        region: item.region || '',
        industry: item.industry || ''
      });
    }
  }

  const summary = {
    total_items: totalItems, new_items: newItems, recent_7d: recentCollected,
    zhongbiao_items, caiyou_items, txt_files: latestTxts
  };

  res.json({ code: 200, data: { routes, sources, summary } });
});

// 采集网址 CRUD（复用 bid_sources 表）
router.post('/sources', (req, res) => {
  const { name, url, source_type, interval_minutes, collect_range } = req.body;
  if (!name || !url) return res.status(400).json({ code: 400, message: '名称和URL必填' });
  const id = randomUUID();
  db.prepare('INSERT INTO bid_sources (id,name,url,source_type,interval_minutes,collect_range,enabled) VALUES (?,?,?,?,?,?,1)')
    .run(id, name, url, source_type || 'web', interval_minutes || 360, collect_range || '30d');
  res.json({ code: 200, data: { id } });
});
router.put('/sources/:id', (req, res) => {
  const { name, url, source_type, interval_minutes, collect_range, enabled } = req.body;
  const en = enabled != null ? (enabled ? 1 : 0) : null;
  db.prepare('UPDATE bid_sources SET name=COALESCE(?,name), url=COALESCE(?,url), source_type=COALESCE(?,source_type), interval_minutes=COALESCE(?,interval_minutes), collect_range=COALESCE(?,collect_range), enabled=COALESCE(?,enabled) WHERE id=?')
    .run(name, url, source_type, interval_minutes, collect_range, en, req.params.id);
  res.json({ code: 200 });
});
router.delete('/sources/:id', (req, res) => {
  db.prepare('DELETE FROM bid_items WHERE source_id=?').run(req.params.id);
  db.prepare('DELETE FROM bid_sources WHERE id=?').run(req.params.id);
  res.json({ code: 200 });
});

// 采集线路间隔配置
router.get('/route-intervals', (req, res) => {
  res.json({ code: 200, data: readIntervals() });
});

router.put('/route-intervals', (req, res) => {
  const { engine, interval_hours } = req.body;
  if (!engine || interval_hours == null) return res.status(400).json({ code: 400, message: 'engine 和 interval_hours 必填' });
  const intervals = readIntervals();
  intervals[engine] = interval_hours;
  writeIntervals(intervals);
  res.json({ code: 200, data: intervals });
});

// ── 乙方宝登录管理（Playwright persistent context）──

router.get('/woyaobid-status', (req, res) => {
  const loggedIn = require('../services/ztb-sjcj-bridge').checkLoginState();
  res.json({ code: 200, data: { logged_in: loggedIn } });
});

// 获取已保存的 Cookie
router.get('/woyaobid-cookies', (req, res) => {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      const raw = fs.readFileSync(COOKIE_FILE, 'utf-8');
      const cookies = JSON.parse(raw);
      const stat = fs.statSync(COOKIE_FILE);
      res.json({ code: 200, data: { has_cookies: true, count: cookies.length, updated_at: stat.mtime.toISOString() } });
    } else {
      res.json({ code: 200, data: { has_cookies: false, count: 0, updated_at: null } });
    }
  } catch (e) {
    res.json({ code: 200, data: { has_cookies: false, count: 0, updated_at: null } });
  }
});

// 保存 Cookie（前端粘贴 JSON）
router.post('/woyaobid-cookies', (req, res) => {
  try {
    const { cookies } = req.body;
    let parsed;
    if (typeof cookies === 'string') {
      parsed = JSON.parse(cookies);
    } else if (Array.isArray(cookies)) {
      parsed = cookies;
    } else {
      return res.status(400).json({ code: 400, message: 'Cookie 格式无效，需要 JSON 数组' });
    }
    const dir = path.dirname(COOKIE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(COOKIE_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    res.json({ code: 200, data: { count: parsed.length } });
  } catch (e) {
    res.status(400).json({ code: 400, message: '保存失败: ' + e.message });
  }
});

// 打开浏览器让用户扫码登录
router.post('/woyaobid-login', async (req, res) => {
  try {
    const bridge = require('../services/ztb-sjcj-bridge');
    const result = await bridge.login();
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(500).json({ code: 500, message: '登录失败: ' + e.message });
  }
});

module.exports = router;
