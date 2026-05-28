const { chromium } = require('playwright');
const { randomUUID } = require('crypto');
const crypto = require('crypto');
const db = require('./db');

function hash(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 16);
}

async function getBrowser() {
  return chromium.launch({ channel: 'msedge', headless: true });
}

async function crawlSource(source, keywords, opts = {}) {
  const results = [];
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.goto(source.url, { waitUntil: 'networkidle', timeout: 30000 });

    // 提取所有链接文本，不依赖 href（很多政府网站用 javascript:void(0)）
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a');
      return Array.from(anchors)
        .map(a => ({
          title: (a.textContent || '').trim().replace(/\s+/g, ' '),
          href: (a.href || '').trim()
        }))
        .filter(l => {
          // 过滤明显非招标链接
          if (l.title.length < 8 || l.title.length > 300) return false;
          if (/^(首页|上一页|下一页|末页|返回|更多|详情|查看|附件|下载|登录|注册|注销|English|中文)$/.test(l.title)) return false;
          if (/^(首页|网站|关于|联系|版权|隐私|网站地图|无障碍|适老化|长者|RSS|订阅)$/.test(l.title)) return false;
          return true;
        });
    });

    // 日期范围过滤
    let filtered = links;
    if (opts.start) {
      filtered = links.filter(l => {
        const dateMatch = l.title.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
        if (!dateMatch) return true;
        const d = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
        return d >= opts.start && (!opts.end || d <= opts.end);
      });
    }

    // 关键词匹配
    for (const link of filtered) {
      for (const kw of keywords) {
        if (link.title.includes(kw)) {
          // 有效 URL 直接用，否则用 source_id + title hash 构造唯一标识
          const url = link.href.startsWith('http')
            ? link.href
            : `${source.url}#${hash(source.id + link.title)}`;
          results.push({
            source_id: source.id,
            title: link.title.substring(0, 300),
            url
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

async function runCollect(opts = {}) {
  const sources = db.prepare("SELECT * FROM bid_sources WHERE enabled=1 AND source_type='web'").all();
  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);

  if (sources.length === 0) {
    console.log('[crawler] 无启用的网页采集源');
    return { found: 0, inserted: 0 };
  }
  if (keywords.length === 0) {
    console.log('[crawler] 无关键词');
    return { found: 0, inserted: 0 };
  }

  const range = opts.start ? `${opts.start} ~ ${opts.end || '至今'}` : '全部时间';
  console.log(`[crawler] ${sources.length} 个网页源, ${keywords.length} 个关键词, ${range}`);

  let totalFound = 0, totalInserted = 0;
  for (const source of sources) {
    const items = await crawlSource(source, keywords, opts);
    totalFound += items.length;

    for (const item of items) {
      try {
        const existing = db.prepare('SELECT id FROM bid_items WHERE url=?').get(item.url);
        if (existing) continue;

        const id = randomUUID();
        db.prepare(`INSERT INTO bid_items (id,source_id,title,url,status,bid_type)
          VALUES (?,?,?,?,'new','公开招标')`).run(
          id, item.source_id, item.title, item.url
        );
        totalInserted++;
      } catch(e) { /* 跳过重复或DB错误 */ }
    }
    console.log(`[crawler] ${source.name}: ${items.length} 条`);
  }

  console.log(`[crawler] 共发现 ${totalFound}, 新增 ${totalInserted}`);
  return { found: totalFound, inserted: totalInserted };
}

let cronJob = null;
function startScheduler(intervalMs) {
  if (cronJob) return;
  console.log(`[crawler] 定时器 ${Math.round(intervalMs/60000)} 分钟`);
  setTimeout(() => runCollect(), 5000);
  cronJob = setInterval(() => runCollect(), intervalMs);
}

module.exports = { runCollect, startScheduler };
