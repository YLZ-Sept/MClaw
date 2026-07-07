// bid-agent settings API — collection routes, sources, classified results, woyaobid cookie
const { Router } = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const router = Router();
const TXT_DIR = path.join(__dirname, '..', 'data', 'bid-txt');

// Keywords for classification
const WIN_KW = ['中标', '成交', '结果'];
const INTENT_KW = ['采购', '招标', '磋商', '谈判', '询价'];

function classify(title) {
  for (const kw of WIN_KW) if (title.includes(kw)) return 'zhongbiao';
  return 'caiyou';
}

router.get('/settings', (req, res) => {
  // Collection routes info
  const routes = [
    { engine: 'crawl4ai', label: 'Crawl4AI', desc: 'MCP 协议 + Playwright 浏览器 + LLM 结构化提取', status: 'active' },
    { engine: 'scrapling', label: 'Scrapling', desc: 'Python 子进程 + DynamicFetcher (Playwright) + Regex 提取', status: 'active' }
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

  // Stats
  const totalItems = db.prepare('SELECT COUNT(*) AS cnt FROM bid_items').get()?.cnt || 0;
  const newItems = db.prepare("SELECT COUNT(*) AS cnt FROM bid_items WHERE status='new'").get()?.cnt || 0;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
  const recentCollected = db.prepare('SELECT COUNT(*) AS cnt FROM bid_items WHERE created_at >= ?').get(weekAgo)?.cnt || 0;

  // Classified items for frontend tables (recent 50 each)
  const recentItems = db.prepare(
    'SELECT bi.title, bi.url, bi.bid_type, bi.amount, bi.win_amount, bi.doc_deadline, bi.bid_time, bi.purchase_requirements, bi.created_at, bi.notice_time, bi.bidder, bi.win_company, bi.region, bi.industry, bs.name AS source_name FROM bid_items bi LEFT JOIN bid_sources bs ON bi.source_id=bs.id ORDER BY bi.created_at DESC LIMIT 200'
  ).all();

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

// ── 乙方宝登录管理（Playwright persistent context）──

const COOKIE_FILE = path.join(__dirname, '..', 'data', 'woyaobid-cookies.json');

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
