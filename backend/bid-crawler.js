const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const db = require('./db');

// 用系统 Edge 而非下载 Chromium
async function getBrowser() {
  return chromium.launch({ channel: 'msedge', headless: true });
}

async function crawlSource(source, keywords, opts = {}) {
  const results = [];
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 获取页面所有链接
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      return Array.from(anchors)
        .map(a => ({ title: a.textContent.trim(), url: a.href }))
        .filter(l => l.title.length > 8 && l.title.length < 300 && l.url.startsWith('http'));
    });

    // 按日期范围过滤（如果提供）
    let filtered = links;
    if (opts.start) {
      // 尝试从标题或页面上下文中提取日期
      filtered = links.filter(l => {
        const dateMatch = l.title.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
        if (!dateMatch) return true; // 无法解析日期的保留
        const d = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
        return d >= opts.start && (!opts.end || d <= opts.end);
      });
    }

    // 关键词匹配
    for (const link of filtered) {
      for (const kw of keywords) {
        if (link.title.includes(kw)) {
          results.push({
            source_id: source.id,
            title: link.title.substring(0, 300),
            region: extractRegion(link.title),
            url: link.url
          });
          break;
        }
      }
    }

    await browser.close();
  } catch (err) {
    console.log(`[crawler] ${source.name} 失败: ${err.message}`);
    if (browser) await browser.close().catch(() => {});
  }
  return results;
}

function extractRegion(text) {
  const regions = ['云南','昆明','大理','丽江','曲靖','玉溪','红河','文山','楚雄','保山','昭通','普洱','临沧','德宏','怒江','迪庆','西双版纳'];
  for (const r of regions) {
    if (text.includes(r)) return r + (r === '昆明' ? '市' : '');
  }
  return '全国';
}

async function runCollect(opts = {}) {
  const sources = db.prepare('SELECT * FROM bid_sources WHERE enabled=1').all();
  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);

  if (sources.length === 0 || keywords.length === 0) {
    console.log('[crawler] 无来源或关键词');
    return { found: 0, inserted: 0 };
  }

  const range = opts.start ? `${opts.start} ~ ${opts.end || '至今'}` : '全部时间';
  console.log(`[crawler] ${sources.length} 个来源, ${keywords.length} 个关键词, ${range}`);

  let totalFound = 0, totalInserted = 0;
  for (const source of sources) {
    const results = await crawlSource(source, keywords, opts);
    totalFound += results.length;

    for (const item of results) {
      try {
        const existing = db.prepare('SELECT id FROM bid_items WHERE url=?').get(item.url);
        if (!existing) {
          const id = randomUUID();
          db.prepare(`INSERT INTO bid_items (id,source_id,title,url,status,bid_type,submit_type)
            VALUES (?,?,?,?,'new','公开招标','线上')`).run(
            id, item.source_id, item.title, item.url
          );
          totalInserted++;
        }
      } catch(e) { /* skip duplicate or db error */ }
    }
    console.log(`[crawler] ${source.name}: 发现 ${results.length} 条`);
  }

  console.log(`[crawler] 共发现 ${totalFound}, 新增 ${totalInserted}`);
  return { found: totalFound, inserted: totalInserted };
}

let cronJob = null;
function startScheduler(intervalMs) {
  if (cronJob) return;
  console.log(`[crawler] 定时器 ${intervalMs/60000} 分钟`);
  setTimeout(() => runCollect(), 5000);
  cronJob = setInterval(() => runCollect(), intervalMs);
}

module.exports = { runCollect, startScheduler };
