// bid-agent settings API — collection routes, sources, classified results, woyaobid cookie
const { Router } = require('express');
const db = require('../db');
const fs = require('fs');
const path = require('path');

const router = Router();
const TXT_DIR = path.join(__dirname, '..', 'data', 'bid-txt');
const COOKIE_FILE = path.join(__dirname, '..', 'data', 'woyaobid-cookies.json');

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

// ── 乙方宝 Cookie 管理 ──

router.get('/woyaobid-cookies', (req, res) => {
  if (!fs.existsSync(COOKIE_FILE)) {
    return res.json({ code: 200, data: { has_cookies: false, count: 0, updated_at: null } });
  }
  try {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8'));
    const stat = fs.statSync(COOKIE_FILE);
    res.json({ code: 200, data: {
      has_cookies: Array.isArray(cookies) && cookies.length > 0,
      count: Array.isArray(cookies) ? cookies.length : 0,
      updated_at: stat.mtime.toISOString()
    }});
  } catch {
    res.json({ code: 200, data: { has_cookies: false, count: 0, updated_at: null } });
  }
});

router.post('/woyaobid-cookies', (req, res) => {
  const { cookies } = req.body;
  if (!cookies) return res.status(400).json({ code: 400, message: '缺少 cookies 字段' });

  let parsed = cookies;
  if (typeof cookies === 'string') {
    try { parsed = JSON.parse(cookies); } catch {
      return res.status(400).json({ code: 400, message: 'Cookie JSON 格式无效' });
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return res.status(400).json({ code: 400, message: 'Cookie 应为非空数组' });
  }

  const dir = path.dirname(COOKIE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(parsed, null, 2));
  console.log(`[bid-settings] 乙方宝 Cookie 已保存: ${parsed.length} 条`);
  res.json({ code: 200, data: { count: parsed.length, message: 'Cookie 保存成功' } });
});

// 自动登录：打开可见浏览器，用户扫码登录后自动捕获 Cookie
router.post('/woyaobid-login', async (req, res) => {
  let browser = null;
  let context = null;

  try {
    const { chromium } = require('playwright');

    // 确保 cookie 目录存在
    const dir = path.dirname(COOKIE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 尝试加载已有 cookie
    let existingCookies = [];
    if (fs.existsSync(COOKIE_FILE)) {
      try { existingCookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8')); } catch {}
    }

    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ userAgent: UA });

    if (existingCookies.length > 0) {
      await context.addCookies(existingCookies);
    }

    const page = await context.newPage();
    await page.goto('https://qiye.qianlima.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('[bid-settings] 浏览器已打开，等待用户登录乙方宝...');

    // 等待用户登录（最多 3 分钟），检测页面出现用户相关元素或 cookie 变化
    const startTime = Date.now();
    const timeout = 3 * 60 * 1000;
    let cookies = [];

    while (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, 2000));
      cookies = await context.cookies();

      // 检查是否有登录态 cookie（yfbSite.session.id 或其他 session cookie）
      const hasSession = cookies.some(c =>
        c.name && (c.name.includes('session') || c.name.includes('token') || c.name.includes('openid') || c.name.includes('yfb'))
      );
      const enoughCookies = cookies.length >= 3;

      if (hasSession && enoughCookies) {
        // 再等 3 秒确保 cookie 稳定
        await new Promise(r => setTimeout(r, 3000));
        cookies = await context.cookies();
        break;
      }
    }

    // 检查是否成功获取到足够的 cookie
    if (cookies.length < 3) {
      await page.close();
      await context.close();
      await browser.close();
      return res.json({ code: 400, message: '登录超时或未检测到有效 Cookie，请确保已在浏览器中完成扫码登录' });
    }

    // 保存为简化格式（name, value, domain, path）
    const simplified = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/'
    }));

    fs.writeFileSync(COOKIE_FILE, JSON.stringify(simplified, null, 2));

    await page.close();
    await context.close();
    await browser.close();

    console.log(`[bid-settings] 乙方宝 自动登录成功，捕获 ${simplified.length} 条 Cookie`);
    res.json({ code: 200, data: { count: simplified.length, message: '登录成功，Cookie 已自动保存' } });
  } catch (e) {
    console.error('[bid-settings] 自动登录失败:', e.message);
    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
    res.status(500).json({ code: 500, message: '自动登录失败: ' + e.message });
  }
});

module.exports = router;
