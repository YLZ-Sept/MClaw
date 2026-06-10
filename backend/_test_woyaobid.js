// Full E2E test: search Yunnan bids via API → get detail → parse → insert
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('./db');

const YUNNAN_CITIES = ['昆明','曲靖','玉溪','保山','昭通','丽江','普洱','临沧','楚雄','红河','文山','版纳','大理','德宏','怒江','迪庆','云南'];
const DATA_DIR = path.resolve(__dirname, 'data/crawls');

function parseDetail(text, url, title) {
  const data = {
    bid_publish_time: null, registration_time: null, bid_time: null,
    region: '昆明', industry: null, bidder: null, bid_company: null,
    project_name: title || null, project_content: null, budget_amount: null,
    bid_method: '公开招标', bid_win_time: null, notice_time: null,
    win_company: null, win_amount: null, url
  };
  const titleMatch = text.match(/(?:项目名称|采购项目名称|招标项目)[：:]\s*(.+?)(?:\n|$)/);
  if (!data.project_name && titleMatch) data.project_name = titleMatch[1].trim().substring(0, 300);
  const budgetMatch = text.match(/(?:预算金额|项目预算|采购预算|预算)[：:]?\s*\|?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/);
  if (budgetMatch) data.budget_amount = parseFloat(budgetMatch[1]);
  const winAmountMatch = text.match(/(?:中标金额|成交金额|中标价|中标总金额)[：:]?\s*\|?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/);
  if (winAmountMatch) data.win_amount = parseFloat(winAmountMatch[1]);
  const winMatch = text.match(/(?:中标人|中标单位|成交供应商|供应商名称|中标供应商)[：:]\s*(.+?)(?:\n|$)/);
  if (winMatch) data.win_company = winMatch[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200);
  const bidderMatch = text.match(/(?:采购人|招标人|采购单位|招标单位)[：:]\s*(.+?)(?:\n|$)/);
  if (bidderMatch) data.bidder = bidderMatch[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200);
  const agencyMatch = text.match(/(?:采购代理机构|招标代理|代理机构)(?:名称)?[：:]?\s*\|?\s*(.+?)(?:\n|$)/);
  if (agencyMatch) data.bid_company = agencyMatch[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200);
  const dates = text.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/g);
  if (dates) {
    const ds = dates.map(d => d.replace(/[年月]/g, '-').replace('日', ''));
    if (ds.length >= 1) data.bid_publish_time = ds[0];
    if (ds.length >= 2) data.registration_time = ds[1];
    if (ds.length >= 3) data.bid_time = ds[2];
  }
  if (/竞争性磋商/.test(text)) data.bid_method = '竞争性磋商';
  else if (/竞争性谈判/.test(text)) data.bid_method = '竞争性谈判';
  else if (/询价/.test(text)) data.bid_method = '询价';
  else if (/单一来源/.test(text)) data.bid_method = '单一来源';
  else if (/邀请招标/.test(text)) data.bid_method = '邀请招标';
  if (/学校|学院|大学|中学|小学|幼儿园/.test(text)) data.industry = '学校';
  else if (/医院|卫生院|疾控|妇幼/.test(text)) data.industry = '医院';
  else if (/政府|局|委员会|办公室|公安|法院|检察院/.test(text)) data.industry = '政府';
  else data.industry = '企业';
  const adminAreaMatch = text.match(/行政区域[：:]?\s*\|?\s*(\S+?)(?:\s|\||$)/);
  const adminArea = adminAreaMatch ? adminAreaMatch[1].trim() : null;
  let regionFound = false;
  if (adminArea) {
    for (const city of YUNNAN_CITIES) {
      if (adminArea.includes(city)) { data.region = city === '云南' ? '昆明' : city; regionFound = true; break; }
    }
  }
  if (!regionFound) {
    for (const city of YUNNAN_CITIES) {
      if (text.includes(city)) { data.region = city === '云南' ? '昆明' : city; break; }
    }
  }
  return data;
}

async function test() {
  const { chromium } = require('playwright');
  const cookies = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'data/woyaobid-cookies.json'), 'utf-8'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto('https://qiye.qianlima.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const openid = 'oFNc6s09LT3dVymcZHsy4zxzddzc';

  // Search with keywords, Yunnan area only
  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);
  const allDetailTexts = [];
  const seen = new Set();

  for (const kw of keywords.slice(0, 3)) { // Test 3 keywords
    const searchKw = YUNNAN_CITIES.some(c => kw.includes(c)) ? kw : kw + ' 云南';
    console.log('\n=== Keyword:', searchKw, '===');

    for (let p = 1; p <= 2; p++) {
      const apiUrl = `/new_qd_yfbsite/api/subZhaobiao/queryZBInfo?pageSize=10&pageNum=${p}&pageFrom=zhaobiao&keyword=${encodeURIComponent(kw)}&viewMonitor=false&openid=${openid}&areaIds=29`;
      const resp = await page.evaluate(async (url) => {
        const res = await fetch(url);
        return res.json();
      }, apiUrl);

      if (!resp.data?.resultList?.length) {
        console.log('  Page', p, ': no results');
        break;
      }

      const items = resp.data.resultList;
      console.log('  Page', p, ':', items.length, 'results');

      for (const item of items) {
        const title = item.title?.replace(/<[^>]+>/g, '') || '';
        if (seen.has(title)) continue;
        seen.add(title);

        console.log('    ', item.areaName, '|', title.substring(0, 80));

        // Crawl detail page if available
        const detailUrl = item.url || (item.contentId ? `https://qiye.qianlima.com/new_qd_yfbsite/#/infoCenter/biddingDatabaseDetail?id=${item.contentId}` : null);
        if (detailUrl && !detailUrl.startsWith('http')) continue;
        if (detailUrl && detailUrl.includes('#')) {
          // SPA detail page - use content field directly
          const content = item.content || '';
          allDetailTexts.push(`\n---\nTitle: ${title}\nContentID: ${item.contentId}\nArea: ${item.areaName}\n\n${content}`);
        }
      }

      await new Promise(r => setTimeout(r, 1000)); // rate limit
    }
  }

  // Save TXT
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const dateStr = new Date().toISOString().slice(0, 10);
  const txtFile = path.join(DATA_DIR, `woyaobid_${dateStr}.txt`);
  const fullText = allDetailTexts.join('\n');
  fs.writeFileSync(txtFile, fullText, 'utf-8');
  console.log('\nTXT saved:', txtFile, '(' + fullText.length + ' chars)');

  // Parse and insert
  let inserted = 0;
  const insert = db.prepare('INSERT OR IGNORE INTO bid_statistics (id,bid_publish_time,registration_time,bid_time,region,industry,bidder,bid_company,project_name,project_content,budget_amount,url,bid_method,bid_win_time,notice_time,win_company,win_amount,remark,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

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
      insert.run(randomUUID(),
        parsed.bid_publish_time||null, parsed.registration_time||null, parsed.bid_time||null,
        parsed.region||'昆明', parsed.industry||null, parsed.bidder||null, parsed.bid_company||null,
        parsed.project_name||title, parsed.project_content||null, parsed.budget_amount||null,
        parsed.url||null, parsed.bid_method||'公开招标', parsed.bid_win_time||null, parsed.notice_time||null,
        parsed.win_company||null, parsed.win_amount||null, null, 'woyaobid');
      inserted++;
      console.log('INSERTED:', title.substring(0, 60));
    } catch (e) {
      console.log('Insert error:', e.message);
    }
  }

  console.log('\n===', allDetailTexts.length, 'details,', inserted, 'inserted ===');
  const count = db.prepare("SELECT count(*) as c FROM bid_statistics WHERE source='woyaobid'").get();
  console.log('DB woyaobid total:', count.c);

  await browser.close();
  console.log('DONE');
  process.exit(0);
}

test().catch(e => { console.error('ERR:', e.message); process.exit(1); });
