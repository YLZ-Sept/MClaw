// 浏览器自动化采集 — 有头 Playwright 搜索 + 详情页提取 + LLM 结构化解析
const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const path = require('path');
const db = require('../db');
const { chat } = require('./llm');

const USER_DATA_DIR = path.join(__dirname, '..', 'browser-profile');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

const MAX_DETAIL_PER_KEYWORD = 20; // 每个关键词最多点开20个详情页

let state = 'idle';
let stateMessage = '';
let browser = null;
let page = null;
let collectedCount = 0;

function setState(s, msg) {
  state = s;
  stateMessage = msg || '';
  console.log(`[browser] ${s}: ${msg || ''}`);
}

// ═══════════════════════════════════════════
// 启动浏览器
// ═══════════════════════════════════════════
async function start(url) {
  if (state !== 'idle' && state !== 'done' && state !== 'error') {
    throw new Error(`浏览器正在运行中 (${state})`);
  }
  setState('launching', '正在启动浏览器...');
  collectedCount = 0;

  try {
    browser = await chromium.launchPersistentContext(USER_DATA_DIR, {
      headless: false,
      channel: 'msedge',
      userAgent: UA,
      viewport: { width: 1366, height: 900 },
      locale: 'zh-CN',
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const pages = browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    setState('launching', `正在打开 ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);

    setState('waiting_login', '请在浏览器中扫码登录，完成后点击"我已登录"');
    return { state, message: stateMessage };
  } catch (err) {
    setState('error', `启动失败: ${err.message}`);
    await cleanup();
    throw err;
  }
}

// ═══════════════════════════════════════════
// 确认登录 → 搜索 → 详情提取 → LLM解析
// ═══════════════════════════════════════════
async function confirmLoginAndSearch() {
  if (state !== 'waiting_login') throw new Error(`当前状态不允许 (${state})`);

  setState('searching', '正在按关键词搜索...');

  try {
    const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);
    if (keywords.length === 0) {
      setState('done', '无关键词可搜索');
      return { state, message: stateMessage, collected: 0 };
    }
    console.log(`[browser] ${keywords.length} 个关键词: ${keywords.join(', ')}`);

    for (const kw of keywords) {
      setState('searching', `搜索: ${kw} → 获取链接列表`);
      let links;
      try {
        links = await searchAndGetLinks(kw);
      } catch (e) {
        console.log(`[browser] "${kw}" 搜索失败: ${e.message}`);
        continue;
      }

      if (!links.length) {
        console.log(`[browser] "${kw}" 无结果`);
        continue;
      }
      console.log(`[browser] "${kw}" 搜索结果: ${links.length} 条`);

      // 逐个打开详情页提取
      const limit = Math.min(links.length, MAX_DETAIL_PER_KEYWORD);
      for (let i = 0; i < limit; i++) {
        setState('searching', `[${kw}] 详情 ${i+1}/${limit}: ${links[i].title.slice(0, 30)}`);
        try {
          const detailText = await openDetailAndExtract(links[i].url);
          if (!detailText || detailText.length < 50) {
            console.log(`[browser] 跳过空白页: ${links[i].url}`);
            continue;
          }
          const parsed = await parseDetailWithLLM(detailText, links[i].url);
          if (parsed && parsed.title) {
            saveBidItem({ ...links[i], ...parsed, url: links[i].url });
          }
        } catch (e) {
          console.log(`[browser] 详情提取失败: ${e.message}`);
        }
      }
    }

    setState('done', `采集完成，共新增 ${collectedCount} 条`);
    return { state, message: stateMessage, collected: collectedCount };
  } catch (err) {
    setState('error', `搜索失败: ${err.message}`);
    throw err;
  }
}

// ═══════════════════════════════════════════
// 搜索 → 滚动加载 → 获取链接列表
// ═══════════════════════════════════════════
async function searchAndGetLinks(keyword) {
  // 找到搜索框
  const input = await findSearchInput();
  if (!input) throw new Error('未找到搜索框');

  await input.click();
  await input.fill('');
  await page.waitForTimeout(200);
  await input.type(keyword, { delay: 60 });
  await page.waitForTimeout(500);

  // 搜索
  const btn = await findSearchButton();
  if (btn) {
    await btn.click();
    console.log(`[browser] 点击搜索: ${keyword}`);
  } else {
    await input.press('Enter');
    console.log(`[browser] 回车搜索: ${keyword}`);
  }

  await page.waitForTimeout(3000);

  // 滚动加载全部内容 + 翻页
  await scrollAndPaginate();

  // 提取结果链接
  const links = await extractResultLinks();
  console.log(`[browser] "${keyword}" 提取到 ${links.length} 个链接`);
  return links;
}

// ═══════════════════════════════════════════
// 滚动 + 翻页
// ═══════════════════════════════════════════
async function scrollAndPaginate() {
  let sameCount = 0;
  for (let i = 0; i < 80; i++) {
    const prevH = await page.evaluate(() => document.body.scrollHeight);
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(600);
    const newH = await page.evaluate(() => document.body.scrollHeight);

    if (newH === prevH) {
      sameCount++;
      if (sameCount >= 3) {
        // 尝试翻页
        const clicked = await clickNextPage();
        if (clicked) {
          sameCount = 0;
          await page.waitForTimeout(2000);
          continue;
        }
        break;
      }
    } else {
      sameCount = 0;
    }
  }
}

async function clickNextPage() {
  const sels = [
    'a:has-text("下一页")', 'button:has-text("下一页")', 'li:has-text("下一页")',
    '.next-page', '.btn-next', '.pagination .next', '.el-pagination button:last-child',
    '.ant-pagination-next', 'li.next',
  ];
  for (const sel of sels) {
    try {
      const el = page.locator(sel).first();
      if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
        await el.click();
        console.log(`[browser] 翻页: ${sel}`);
        return true;
      }
    } catch {}
  }
  return false;
}

// ═══════════════════════════════════════════
// 提取搜索结果页的链接
// ═══════════════════════════════════════════
async function extractResultLinks() {
  return page.evaluate(() => {
    const results = [], seen = new Set();

    function add(title, href) {
      if (!href || !href.startsWith('http')) return;
      const t = (title || '').trim().replace(/\s+/g, ' ');
      if (t.length < 6 || t.length > 300) return;
      if (seen.has(href)) return;
      seen.add(href);
      results.push({ title: t, url: href });
    }

    // 优先从搜索结果容器里抓
    const containers = document.querySelectorAll(
      'ul.result-list li, ul.search-list li, ul.res-list li,' +
      'div.result-item, div.search-item, div.bid-item,' +
      '[class*="result-item"], [class*="search-item"], [class*="bid-list"] li,' +
      '.list-content li, .listBox li, ul.list li, table.list-table tr'
    );
    for (const el of containers) {
      for (const a of el.querySelectorAll('a[href]')) {
        add(a.textContent, a.href);
      }
    }
    if (results.length > 0) return results;

    // Fallback: 表格
    for (const tr of document.querySelectorAll('table tr')) {
      for (const a of tr.querySelectorAll('a[href]')) {
        add(a.textContent, a.href);
      }
    }
    if (results.length > 0) return results;

    // Fallback: 所有带 href 的 a 标签
    for (const a of document.querySelectorAll('a[href]')) {
      add(a.textContent, a.href);
    }

    return results;
  });
}

// ═══════════════════════════════════════════
// 打开详情页 → 提取全文
// ═══════════════════════════════════════════
async function openDetailAndExtract(url) {
  let detailPage;
  try {
    detailPage = await browser.newPage();
    await detailPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await detailPage.waitForTimeout(2000);

    // 抓取页面全部文字
    const fullText = await detailPage.evaluate(() => {
      // 优先提取主内容区域
      const main = document.querySelector('main, article, .content, .detail, .article, .main-content, #content, #detail, .detail-content');
      if (main) return (main.textContent || '').trim().replace(/\s{3,}/g, '\n').slice(0, 6000);

      // Fallback: body 中可见文字
      const body = document.body;
      // 去掉 script/style/nav/footer/header
      for (const tag of body.querySelectorAll('script, style, nav, footer, header, .nav, .footer, .header, .sidebar, .menu')) {
        tag.remove();
      }
      return (body.textContent || '').trim().replace(/\s{3,}/g, '\n').slice(0, 6000);
    });

    await detailPage.close().catch(() => {});
    return fullText;
  } catch (err) {
    try { await detailPage.close().catch(() => {}); } catch {}
    throw err;
  }
}

// ═══════════════════════════════════════════
// LLM 解析详情页文本 → 结构化字段
// ═══════════════════════════════════════════
async function parseDetailWithLLM(pageText, sourceUrl) {
  const prompt = `从以下招标公告页面文本中提取关键信息，返回 JSON：

{
  "title": "项目名称/招标项目名称",
  "project_no": "项目编号/招标编号",
  "amount": "预算金额/项目预算，只保留数字和单位，如'380万'",
  "bid_type": "招标方式，如 公开招标/邀请招标/竞争性谈判/询价/单一来源",
  "doc_deadline": "报名截止时间/文件获取截止时间，格式 YYYY-MM-DD",
  "bid_time": "投标截止时间/开标时间，格式 YYYY-MM-DD 或 YYYY-MM-DD HH:mm",
  "purchase_requirements": "采购需求/招标内容/项目概况，摘取核心描述（不超过200字）",
  "evaluation": "评标办法，如 综合评分法/最低评标价法"
}

如果某个字段在原文中没有出现，写空字符串。
只返回 JSON，不要加任何解释或前缀。

页面文本：
${pageText.slice(0, 5000)}`;

  try {
    const response = await chat([{ role: 'user', content: prompt }], 0.1);
    // 去掉可能的 markdown 代码块标记
    let json = response.trim();
    if (json.startsWith('```')) {
      json = json.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
    }
    const parsed = JSON.parse(json);
    return parsed;
  } catch (e) {
    console.log(`[browser] LLM解析失败: ${e.message}, 返回原文前200字`);
    return null;
  }
}

// ═══════════════════════════════════════════
// 写入数据库
// ═══════════════════════════════════════════
function saveBidItem(item) {
  try {
    const exists = db.prepare('SELECT id FROM bid_items WHERE url=?').get(item.url);
    if (exists) return;

    // amount: LLM 可能返回 "380万" → 提取数字
    let amountNum = null;
    if (item.amount) {
      const m = String(item.amount).match(/([\d.]+)\s*万?/);
      if (m) amountNum = parseFloat(m[1]);
    }

    const id = randomUUID();
    db.prepare(`INSERT INTO bid_items
      (id, title, project_no, bid_type, doc_deadline, bid_time, amount, purchase_requirements, evaluation, url, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,'new')`)
      .run(id,
        (item.title || '').slice(0, 300),
        item.project_no || null,
        item.bid_type || '公开招标',
        item.doc_deadline || null,
        item.bid_time || null,
        amountNum,
        (item.purchase_requirements || '').slice(0, 1000),
        item.evaluation || null,
        item.url
      );
    collectedCount++;
    console.log(`[browser] 保存: ${(item.title || '').slice(0, 50)} | 预算=${amountNum}万 | 截止=${item.doc_deadline}`);
  } catch (e) {
    console.log(`[browser] 保存失败: ${e.message}`);
  }
}

// ═══════════════════════════════════════════
// 查找搜索框 / 搜索按钮
// ═══════════════════════════════════════════
async function findSearchInput() {
  const sels = [
    'input[placeholder*="搜索"]', 'input[placeholder*="关键词"]',
    'input[placeholder*="请输入"]', 'input[placeholder*="招标"]',
    'input[name="keyword"]', 'input[name="search"]', 'input[name="query"]',
    'input[name="key"]', 'input[name="kw"]',
    'input[class*="search"]', 'input[class*="Search"]',
  ];
  for (const sel of sels) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
      console.log(`[browser] 搜索框: ${sel}`);
      return el;
    }
  }
  // 调试
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input[type="text"], input:not([type])')).map(i => ({
      p: i.placeholder?.slice(0, 40), n: i.name?.slice(0, 40), c: i.className?.slice(0, 60)
    }))
  );
  console.log('[browser] 所有文本输入框:', JSON.stringify(inputs));
  return null;
}

async function findSearchButton() {
  const sels = [
    'button:has-text("搜索")', 'button:has-text("查询")', 'button:has-text("搜")',
    '.search-btn', '.searchBtn', 'input[type="submit"]', 'button[type="submit"]',
  ];
  for (const sel of sels) {
    const el = page.locator(sel).first();
    if (await el.count() > 0 && await el.isVisible().catch(() => false)) {
      console.log(`[browser] 搜索按钮: ${sel}`);
      return el;
    }
  }
  return null;
}

// ═══════════════════════════════════════════
// API
// ═══════════════════════════════════════════
function getStatus() {
  return { state, message: stateMessage, collected: collectedCount };
}

async function stop() {
  setState('idle', '已停止');
  await cleanup();
  return { state, message: stateMessage };
}

async function cleanup() {
  try { if (page) await page.close().catch(() => {}); } catch {}
  try { if (browser) await browser.close().catch(() => {}); } catch {}
  page = null;
  browser = null;
}

module.exports = { start, confirmLoginAndSearch, getStatus, stop };
