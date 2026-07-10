// Woyaobid (乙方宝) crawler — Playwright + API direct calls
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const { saveToTxt } = require('./bid-excel-writer');

const DATA_DIR = path.resolve(__dirname, '../data/crawls');
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

// Extract amount value from budget string like "9.00万元"
function parseAmount(str) {
  if (!str) return null;
  const m = String(str).match(/([\d,]+\.?\d*)\s*万/);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  const m2 = String(str).match(/([\d,]+\.?\d*)\s*元/);
  if (m2) return parseFloat((parseFloat(m2[1].replace(/,/g, '')) / 10000).toFixed(2));
  const m3 = String(str).match(/([\d,]+\.?\d*)/);
  if (m3) {
    const v = parseFloat(m3[1].replace(/,/g, ''));
    return v > 10000 ? parseFloat((v / 10000).toFixed(2)) : v;
  }
  return null;
}

// Map biddingType/bidding_type to standardized labels
function mapBidType(rawType, itemType) {
  if (!rawType && !itemType) return '公开招标';
  const t = (rawType || itemType || '').replace(/[｜|]/g, '');
  if (/询价/.test(t)) return '询价';
  if (/竞谈|竞磋|竞争性谈判/.test(t)) return '竞争性谈判';
  if (/竞争性磋商/.test(t)) return '竞争性磋商';
  if (/单一来源/.test(t)) return '单一来源';
  if (/邀请招标/.test(t)) return '邀请招标';
  if (/比选/.test(t)) return '比选';
  if (/中标|成交/.test(t)) return '公开招标';
  return '公开招标';
}

// Build purchase_requirements from content snippet + structured metadata
function buildPurchaseDesc(item) {
  const rawContent = (item.content || '').replace(/<[^>]+>/g, '').trim();
  const meta = [];
  if (item.noticeTypes) meta.push(item.noticeTypes);
  if (item.biddingType) meta.push(item.biddingType);
  if (item.extractBudget) meta.push('金额' + item.extractBudget);
  if (item.tenderEndTime) meta.push('截止' + item.tenderEndTime);
  if (item.registrationDeadline) meta.push('报名截止' + item.registrationDeadline);
  const prefix = meta.length > 0 ? '【' + meta.join(' | ') + '】' : '';
  if (prefix && rawContent) return prefix + ' ' + rawContent;
  return prefix + rawContent;
}

// Classify industry from title
function classifyIndustry(title) {
  const t = (title || '');
  if (/学校|学院|大学|中学|小学|幼儿园|教育/.test(t)) return '学校';
  if (/医院|卫生院|疾控|妇幼|医疗|药/.test(t)) return '医院';
  if (/政府|局|委员会|办公室|公安|法院|检察院|行政/.test(t)) return '政府';
  return '企业';
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

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // 加载关键词用于二次筛选
  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);

  console.log(`[woyaobid] 开始采集（订阅消息模式）, ${keywords.length} 个关键词`);
  const ctx = await getBrowser(cookies);
  const page = await ctx.context.newPage();

  await page.goto('https://qiye.qianlima.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const allCookies = await ctx.context.cookies();
  const openidCookie = allCookies.find(c => c.name === 'openid' || c.name === 'yfb_openid');
  const openid = openidCookie ? openidCookie.value : 'oFNc6s09LT3dVymcZHsy4zxzddzc';

  // Step 1: 获取云南订阅消息列表 (type=1, areaId=29)
  const msgResp = await page.evaluate(async (url) => {
    const res = await fetch(url);
    return res.json();
  }, `/new_qd_yfbsite/api/yfbMessage/getMessageList?pageNum=1&pageSize=20&messageType=1&openid=${openid}`);

  const ynMessages = (msgResp.data?.list || []).filter(m => m.reservedTwo === '29');
  console.log(`[woyaobid] 找到 ${ynMessages.length} 条云南订阅消息`);

  // Step 2: 逐条消息获取完整招标数据
  const allItems = [];
  const seen = new Set();

  for (const msg of ynMessages) {
    // Skip if all items in this message already processed
    const msgId = msg.id;
    console.log(`[woyaobid] 处理消息 ${msgId}: ${msg.messageTitle?.substring(0, 60)} (${msg.updateCount}条)`);

    for (let p = 1; p <= Math.ceil(msg.updateCount / 20); p++) {
      const itemsResp = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.json();
      }, `/new_qd_yfbsite/api/subZhaobiao/queryZBInfoMessage?pageNum=${p}&pageSize=20&pageFrom=zhaobiao&messageId=${msgId}&openid=${openid}`);

      const items = itemsResp.data?.resultList || [];
      if (items.length === 0) break;

      for (const item of items) {
        let title = (item.title || '').replace(/<[^>]+>/g, '').trim();
        // 清理"已更新即将删除"后缀，避免同项目重复入库
        title = title.replace(/\(该信息已更新即将删除\)$/, '').trim();
        if (!title || seen.has(title)) continue;

        // 关键词 + 行业二次筛选
        const content = (item.content || '').replace(/<[^>]+>/g, '');
        const searchText = title + content;
        const matchedKw = keywords.filter(kw => searchText.includes(kw));
        if (matchedKw.length === 0) continue;

        // 网络安全/IT 行业确认：标题或内容需包含行业特征词，排除"等保险→等保"类误匹配
        const cyberTerms = [
          '网络安全', '信息安全', '数据安全', '终端安全', '系统集成',
          '等级保护', '等保测评', '安全审计', '安全运维', '安全防护',
          '应急响应', '态势感知', '渗透测试', '漏洞扫描', '入侵检测',
          '身份认证', '服务器', '交换机', '路由器', '防火墙', '堡垒机',
          '加密机', '信息系统', '数据库', '网络设备', '硬件采购',
          '软件采购', '信息化设备', '信息化平台', '信息化系统',
          '信息化建设', '全光纤', '智慧安防', '安防系统',
          '机房建设', '数据中心', '云平台', 'IT运维',
          '网络安全建设', '网络安全设备', '智慧校园', '智慧医院',
          '智慧监管', '智慧监所', '智慧园区', '智慧工厂',
          '智慧体育', '智慧种植', '通信网', '虚拟专网',
          '信息发布系统', '科技管控', '调度系统',
          '办公自动化', '运维服务',
        ];
        const isCyber = cyberTerms.some(t => searchText.includes(t));
        if (!isCyber) continue;

        seen.add(title);

        // Skip if already in bid_items
        const dupCheck = db.prepare('SELECT id FROM bid_items WHERE title=?').get(title);
        if (dupCheck) continue;

        const contentId = item.contentId || '';
        const url = contentId ? `https://qiye.qianlima.com/new_qd_yfbsite/#/infoCenter/biddingDatabase?id=${contentId}` : null;
        const region = (item.areaName || '昆明').replace(/^云南-/, '');
        const amountStr = item.extractBudget || '';
        const amount = parseAmount(amountStr);

        allItems.push({
          title,
          url,
          contentId,
          source_name: '乙方宝',
          region,
          industry: classifyIndustry(title),
          bid_type: mapBidType(item.biddingType, item.noticeSegmentType || item.type),
          amount,
          win_amount: item.zhongBiaoUnit ? amount : null,
          bidder: item.zhaoBiaoUnit || null,
          win_company: item.zhongBiaoUnit || null,
          agent: item.agentUnitComplete || null,
          bid_time: item.tenderEndTime || null,
          doc_deadline: item.registrationDeadline || null,
          notice_time: item.updateDate || null,
          purchase_requirements: buildPurchaseDesc(item) || null,
          notice_type: item.noticeTypes || null,
          msgId,
        });
      }

      await new Promise(r => setTimeout(r, 500));
    }
  }

  await page.close();
  await closeBrowser();

  // Save raw txt
  const dateStr = new Date().toISOString().slice(0, 10);
  const txtFile = path.join(DATA_DIR, `woyaobid_${dateStr}.txt`);
  const rawText = allItems.map(it =>
    `Title: ${it.title}\nRegion: ${it.region}\nAmount: ${it.amount || '-'}万\nBidder: ${it.bidder || '-'}\nBidTime: ${it.bid_time || '-'}\nType: ${it.bid_type}\nIndustry: ${it.industry}\nContent: ${it.purchase_requirements || ''}\n`
  ).join('\n---\n');
  fs.writeFileSync(txtFile, rawText, 'utf-8');
  console.log(`[woyaobid] 保存文本: ${txtFile} (${rawText.length} 字符)`);

  // Look up woyaobid source for bid_items
  const woyaobidSource = db.prepare("SELECT id FROM bid_sources WHERE source_type='woyaobid' LIMIT 1").get();
  const sourceId = woyaobidSource ? woyaobidSource.id : null;

  // Insert into bid_items
  let bidItemsInserted = 0;
  for (const item of allItems) {
    if (!sourceId) break;
    try {
      const existsInItems = db.prepare('SELECT id FROM bid_items WHERE url=?').get(item.url);
      if (existsInItems) continue;

      const itemId = randomUUID();
      db.prepare(`INSERT INTO bid_items (id,source_id,title,url,status,bid_type,amount,win_amount,doc_deadline,bid_time,bidder,win_company,region,industry,notice_time,purchase_requirements)
        VALUES (?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?)`).run(
        itemId, sourceId, item.title, item.url,
        item.bid_type, item.amount, item.win_amount,
        item.doc_deadline, item.bid_time,
        item.bidder, item.win_company,
        item.region, item.industry, item.notice_time,
        item.purchase_requirements
      );
      bidItemsInserted++;
      console.log(`[woyaobid] INSERTED: ${item.title.substring(0, 60)} (${item.amount || '?'}万)`);
    } catch (e) {
      console.log(`[woyaobid] insert error: ${e.message}`);
    }
  }

  // Save to bid-txt for frontend display
  if (allItems.length > 0) {
    saveToTxt('woyaobid', allItems);
  }

  console.log(`[woyaobid] 共采集 ${allItems.length} 条, 新增 ${bidItemsInserted}`);
  return { found: allItems.length, inserted: bidItemsInserted, txtFile };
}

module.exports = { runCollect, saveCookies, loadCookies };
