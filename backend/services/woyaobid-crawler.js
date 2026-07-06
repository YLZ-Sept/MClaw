// Woyaobid (乙方宝) crawler — Playwright + API direct calls
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const { saveToTxt } = require('./bid-excel-writer');

const DATA_DIR = path.resolve(__dirname, '../data/crawls');
const YUNNAN_CITIES = ['昆明','曲靖','玉溪','保山','昭通','丽江','普洱','临沧','楚雄','红河','文山','版纳','大理','德宏','怒江','迪庆','云南'];
const COOKIE_FILE = path.resolve(__dirname, '../data/woyaobid-cookies.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let browserCtx = null;

function loadCookies() {
  if (!fs.existsSync(COOKIE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8')); } catch { return null; }
}

function saveCookies(cookies) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const obj = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(obj, null, 2));
}

function openBrowser() {
  const url = 'https://qiye.qianlima.com';
  const platform = process.platform;
  const cmd = platform === 'win32'
    ? `start "" "${url}"`
    : platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  require('child_process').exec(cmd);
  console.log(`[woyaobid] 已打开浏览器: ${url}`);
}

async function getBrowser(cookies) {
  if (browserCtx) return browserCtx;

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: UA });
  if (cookies && cookies.length > 0) {
    await context.addCookies(cookies);
    console.log(`[woyaobid] 已注入 ${cookies.length} 个 Cookie`);
  }
  browserCtx = { browser, context };
  return browserCtx;
}

async function closeBrowser() {
  if (browserCtx) {
    try { await browserCtx.context.close(); } catch {}
    try { await browserCtx.browser.close(); } catch {}
    browserCtx = null;
  }
}

// Parse bid detail from API snippet text
function parseDetail(text, url, title) {
  const data = {
    bid_publish_time: null, registration_time: null, bid_time: null,
    region: '昆明', industry: null, bidder: null, bid_company: null,
    project_name: title || null, project_content: null, budget_amount: null,
    bid_method: '公开招标', bid_win_time: null, notice_time: null,
    win_company: null, win_amount: null, url
  };

  // 剥离 HTML 标签
  const clean = text.replace(/<[^>]+>/g, '');

  // ── 区域：从 Area 头部提取 ──
  const areaMatch = text.match(/^Area:\s*(.+)$/m);
  if (areaMatch) {
    const parts = areaMatch[1].split('-');
    if (parts.length >= 2) {
      const city = parts[1].trim();
      if (YUNNAN_CITIES.some(c => city.includes(c))) data.region = city;
    }
  }
  // 从正文匹配行政区域
  if (data.region === '昆明') {
    const admMatch = clean.match(/行政区域[：:]\s*(\S+?)(?:\s|、|$)/);
    if (admMatch) {
      for (const city of YUNNAN_CITIES) {
        if (admMatch[1].includes(city)) { data.region = city === '云南' ? '昆明' : city; break; }
      }
    }
  }

  // ── 招标类型：从 API Type 头部 ──
  const typeMatch = text.match(/^Type:\s*(.+)$/m);
  const apiType = typeMatch ? typeMatch[1] : '';
  if (apiType.includes('中标') || apiType.includes('成交')) data.bid_method = '公开招标';

  // ── 采购人/招标方 ──
  const bidderPatterns = [
    /(?:采购人|招标人|采购单位|招标单位|购买主体|业主单位|建设单位)[名称]*[：:]\s*(.+?)(?:[。；\n]|$)/,
    /单位名称[：:]\s*(.+?)(?:[。；\n]|$)/,
    /采购人名称[：:]\s*(.+?)(?:[。；\n]|$)/,
  ];
  for (const pat of bidderPatterns) {
    const m = clean.match(pat);
    if (m) { data.bidder = m[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200); break; }
  }

  // ── 代理机构 ──
  const agentMatch = clean.match(/(?:采购代理机构|招标代理|代理机构)(?:名称)?[：:]?\s*(.+?)(?:[。；\n]|$)/);
  if (agentMatch) data.bid_company = agentMatch[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200);

  // ── 金额（多种模式） ──
  const amountPatterns = [
    /(?:预算金额|项目预算|采购预算|预算|项目金额|合同金额|采购金额|投资金额|总投资)[：:]?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万|元)/,
    /(?:金额|预算)(?:不低于|不少于|约|为)?[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/,
    /[¥￥]\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/,
    /(\d+(?:\.\d+)?)\s*万元/,
  ];
  for (const pat of amountPatterns) {
    const m = clean.match(pat);
    if (m) {
      const amt = parseFloat(m[1]);
      const matched = m[0];
      data.budget_amount = /元[^元]*$/.test(matched) && !/万元|万/.test(matched) ? amt / 10000 : amt;
      break;
    }
  }

  // ── 中标金额 ──
  const winAmtMatch = clean.match(/(?:中标金额|成交金额|中标价|中标总金额|成交价)[：:]?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/);
  if (winAmtMatch) data.win_amount = parseFloat(winAmtMatch[1]);

  // ── 中标单位 ──
  const winMatch = clean.match(/(?:中标人|中标单位|成交供应商|供应商名称|中标供应商|中标单位名称)[：:]\s*(.+?)(?:[。；\n]|$)/);
  if (winMatch) data.win_company = winMatch[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200);

  // ── 采购需求/项目概况 ──
  const prPatterns = [
    /(?:采购需求|项目需求|招标范围|采购内容|采购范围|项目概况|招标内容|建设内容|服务内容)[：:]\s*(.+?)(?:\n[一二三四五六七八九十]|$)/,
    /(?:采购需求|项目概况|项目内容)[：:]?\s*(.+?)(?:[。；]?\s*(?:二|三|四|五|六|七|八|九|十)[、．]|\n[一二三四五六七八九十]|$)/,
  ];
  for (const pat of prPatterns) {
    const m = clean.match(pat);
    if (m && m[1].trim().length > 5) { data.project_content = m[1].trim().substring(0, 500); break; }
  }
  // 如果没有采购需求标签，尝试提取项目基本情况后的文本
  if (!data.project_content) {
    const basicMatch = clean.match(/项目基本情况[：:]?\s*(.+?)(?:\n|$)/);
    if (basicMatch && basicMatch[1].trim().length > 5) {
      data.project_content = basicMatch[1].trim().substring(0, 300);
    }
  }

  // ── 时间字段 ──
  const pubMatch = clean.match(/(?:发布时间|公告时间|发布日期)[：:]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
  if (pubMatch) data.notice_time = pubMatch[1].replace(/[年月]/g, '-').replace('日', '');

  // 报名截止/文件获取截止
  const regMatch = clean.match(/(?:报名截止|文件获取截止|采购文件获取截止|招标文件获取截止)(?:时间)?[：:]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
  if (regMatch) data.registration_time = regMatch[1].replace(/[年月]/g, '-').replace('日', '');

  // 开标/投标截止
  const bidTimeMatch = clean.match(/(?:开标时间|投标截止|投标文件递交截止|响应文件提交截止)(?:时间)?[：:]?\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
  if (bidTimeMatch) data.bid_time = bidTimeMatch[1].replace(/[年月]/g, '-').replace('日', '');

  // 通用日期提取
  const dates = clean.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/g);
  if (dates) {
    const ds = dates.map(d => d.replace(/[年月]/g, '-').replace('日', ''));
    if (!data.notice_time && ds.length >= 1) data.notice_time = ds[0];
    if (ds.length >= 1 && !data.bid_publish_time) data.bid_publish_time = ds[0];
  }

  // ── 招标方式 ──
  if (/竞争性磋商/.test(clean)) data.bid_method = '竞争性磋商';
  else if (/竞争性谈判/.test(clean)) data.bid_method = '竞争性谈判';
  else if (/询价|询比/.test(clean)) data.bid_method = '询价';
  else if (/单一来源/.test(clean)) data.bid_method = '单一来源';
  else if (/邀请招标/.test(clean)) data.bid_method = '邀请招标';
  else if (/公开招标/.test(clean)) data.bid_method = '公开招标';
  else if (/比选/.test(clean)) data.bid_method = '比选';

  // ── 行业 ──
  if (/学校|学院|大学|中学|小学|幼儿园|教育/.test(clean)) data.industry = '学校';
  else if (/医院|卫生院|疾控|妇幼|医疗|药/.test(clean)) data.industry = '医院';
  else if (/政府|局|委员会|办公室|公安|法院|检察院|行政/.test(clean)) data.industry = '政府';
  else data.industry = '企业';

  return data;
}

async function runCollect(opts = {}) {
  let cookies = null;

  if (opts.cookies) {
    saveCookies(opts.cookies);
    cookies = typeof opts.cookies === 'string' ? JSON.parse(opts.cookies) : opts.cookies;
  } else {
    cookies = loadCookies();
  }

  if (!cookies || !cookies.length) {
    openBrowser();
    throw new Error('请在浏览器中扫码登录乙方宝，登录完成后再次点击采集');
  }

  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);
  if (keywords.length === 0) {
    console.log('[woyaobid] 无关键词');
    return { found: 0, inserted: 0 };
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log(`[woyaobid] 开始采集, ${keywords.length} 个关键词`);
  const ctx = await getBrowser(cookies);
  const page = await ctx.context.newPage();

  // Navigate to establish session
  await page.goto('https://qiye.qianlima.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Extract openid from cookies
  const allCookies = await ctx.context.cookies();
  const openidCookie = allCookies.find(c => c.name === 'openid' || c.name === 'yfb_openid');
  const openid = openidCookie ? openidCookie.value : 'oFNc6s09LT3dVymcZHsy4zxzddzc';

  // 去重收集 + 直接从 API 摘要文本提取字段
  const allDetailTexts = [];
  const seen = new Set();

  try {
    for (const kw of keywords.slice(0, 5)) {
      console.log(`[woyaobid] 关键词: ${kw}`);

      for (let p = 1; p <= 2; p++) {
        const apiUrl = `/new_qd_yfbsite/api/subZhaobiao/queryZBInfo?pageSize=10&pageNum=${p}&pageFrom=zhaobiao&keyword=${encodeURIComponent(kw)}&viewMonitor=false&openid=${openid}&areaIds=29`;

        const resp = await page.evaluate(async (url) => {
          const res = await fetch(url);
          return res.json();
        }, apiUrl);

        if (!resp.data?.resultList?.length) {
          console.log(`[woyaobid]   第${p}页: 无结果`);
          break;
        }

        const items = resp.data.resultList;
        console.log(`[woyaobid]   第${p}页: ${items.length} 条`);

        for (const item of items) {
          const title = item.title?.replace(/<[^>]+>/g, '') || '';
          if (seen.has(title)) continue;
          seen.add(title);

          // 检查 bid_items 是否已有
          const dupCheck = db.prepare('SELECT id FROM bid_items WHERE title=?').get(title);
          if (dupCheck) continue;

          const contentId = item.contentId || '';
          const areaName = item.areaName || '';
          const apiType = item.type || '';
          const detailUrl = contentId ? `https://qiye.qianlima.com/new_qd_yfbsite/#/infoCenter/biddingDatabaseDetail?id=${contentId}` : null;

          // 用 API 返回的所有文本拼接进行解析
          const fullText = [
            'Title: ' + title,
            'ContentID: ' + contentId,
            'Area: ' + areaName,
            'Type: ' + apiType,
            'URL: ' + (detailUrl || ''),
            '',
            item.content || ''
          ].join('\n');

          allDetailTexts.push('\n---\n' + fullText);
        }

        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } finally {
    await page.close();
    await closeBrowser();
  }

  // Save raw txt
  const dateStr = new Date().toISOString().slice(0, 10);
  const txtFile = path.join(DATA_DIR, `woyaobid_${dateStr}.txt`);
  const fullText = allDetailTexts.join('\n');
  fs.writeFileSync(txtFile, fullText, 'utf-8');
  console.log(`[woyaobid] 保存文本: ${txtFile} (${fullText.length} 字符)`);

  // Look up woyaobid source for bid_items
  const woyaobidSource = db.prepare("SELECT id FROM bid_sources WHERE source_type='woyaobid' LIMIT 1").get();
  const sourceId = woyaobidSource ? woyaobidSource.id : null;

  // Parse and insert into both bid_statistics and bid_items
  let inserted = 0;
  let bidItemsInserted = 0;
  const allBidItems = [];
  const insertStats = db.prepare(`INSERT OR IGNORE INTO bid_statistics (id,bid_publish_time,registration_time,bid_time,region,industry,bidder,bid_company,project_name,project_content,budget_amount,url,bid_method,bid_win_time,notice_time,win_company,win_amount,remark,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (const text of allDetailTexts) {
    const titleMatch = text.match(/^Title: (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;
    if (!title) continue;

    const existing = db.prepare('SELECT id FROM bid_statistics WHERE project_name=? AND source=?').get(title, 'woyaobid');
    if (existing) continue;

    const cidMatch = text.match(/^ContentID: (\d+)$/m);
    const contentId = cidMatch ? cidMatch[1] : null;
    const url = contentId ? `https://qiye.qianlima.com/new_qd_yfbsite/#/infoCenter/biddingDatabaseDetail?id=${contentId}` : null;

    const parsed = parseDetail(text, url, title);
    try {
      insertStats.run(randomUUID(),
        parsed.bid_publish_time||null, parsed.registration_time||null, parsed.bid_time||null,
        parsed.region||'昆明', parsed.industry||null, parsed.bidder||null, parsed.bid_company||null,
        parsed.project_name||title, parsed.project_content||null, parsed.budget_amount||null,
        parsed.url||null, parsed.bid_method||'公开招标', parsed.bid_win_time||null, parsed.notice_time||null,
        parsed.win_company||null, parsed.win_amount||null, null, 'woyaobid');
      inserted++;
      console.log(`[woyaobid] INSERTED stats: ${title.substring(0, 60)}`);
    } catch (e) {
      console.log(`[woyaobid] insert stats error: ${e.message}`);
    }

    // Also insert into bid_items for frontend display
    if (sourceId) {
      const bidItem = {
        source_id: sourceId, source_name: '乙方宝',
        title: parsed.project_name || title, url: parsed.url,
        bid_type: parsed.bid_method || '公开招标',
        amount: parsed.budget_amount, win_amount: parsed.win_amount,
        doc_deadline: parsed.registration_time, bid_time: parsed.bid_time,
        bidder: parsed.bidder, win_company: parsed.win_company,
        region: parsed.region || '昆明', industry: parsed.industry,
        notice_time: parsed.notice_time || parsed.bid_publish_time,
        purchase_requirements: parsed.project_content
      };
      allBidItems.push(bidItem);

      try {
        const existsInItems = db.prepare('SELECT id FROM bid_items WHERE url=?').get(bidItem.url);
        if (!existsInItems) {
          const itemId = randomUUID();
          db.prepare(`INSERT INTO bid_items (id,source_id,title,url,status,bid_type,amount,win_amount,doc_deadline,bid_time,bidder,win_company,region,industry,notice_time,purchase_requirements)
            VALUES (?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?)`).run(
            itemId, bidItem.source_id, bidItem.title, bidItem.url,
            bidItem.bid_type, bidItem.amount, bidItem.win_amount,
            bidItem.doc_deadline, bidItem.bid_time,
            bidItem.bidder, bidItem.win_company,
            bidItem.region, bidItem.industry, bidItem.notice_time,
            bidItem.purchase_requirements
          );
          bidItemsInserted++;
        }
      } catch (e) {
        console.log(`[woyaobid] insert bid_items error: ${e.message}`);
      }
    }
  }

  // Save to bid-txt for frontend display
  if (allBidItems.length > 0) {
    saveToTxt('woyaobid', allBidItems);
  }

  console.log(`[woyaobid] 共采集 ${allDetailTexts.length} 条, 统计新增 ${inserted}, bid_items新增 ${bidItemsInserted}`);
  return { found: allDetailTexts.length, inserted: bidItemsInserted, txtFile };
}

module.exports = { runCollect, saveCookies, loadCookies };
