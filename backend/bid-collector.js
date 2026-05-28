const axios = require('axios');
const { randomUUID } = require('crypto');
const db = require('./db');

const SHOWAPI_APPKEY = process.env.SHOWAPI_APPKEY || 'e0670e015635409B922De744Bd28Ca4A';
const SHOWAPI_BASE = 'https://route.showapi.com';

async function searchBidsPage({ start, end, page = 1 }) {
  const body = { page, pageSize: 100 };
  if (start) body.startDate = start;
  if (end) body.endDate = end;

  const res = await axios.post(
    `${SHOWAPI_BASE}/3307-10?appKey=${SHOWAPI_APPKEY}`,
    body,
    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
  );
  const d = res.data;
  if (d.code !== 0 && d.code !== 200) throw new Error(`API ${d.code}: ${d.msg || d.subMsg}`);
  return d.data?.data || [];
}

async function searchBidsAll({ start, end }) {
  const allItems = [];
  let page = 1;
  while (page <= 5) {
    const items = await searchBidsPage({ start, end, page });
    if (!items.length) break;
    allItems.push(...items);
    console.log(`[collector] 第${page}页 ${items.length} 条`);
    if (items.length < 100) break;
    page++;
  }
  return allItems;
}

async function runCollect(opts = {}) {
  if (SHOWAPI_APPKEY === '你的AppKey') {
    console.log('[collector] 未配置 AppKey，使用模拟数据');
    return mockCollect(opts);
  }

  // 读取启用的 API 类型采集源
  const sources = db.prepare("SELECT * FROM bid_sources WHERE enabled=1 AND source_type='api'").all();
  if (sources.length === 0) {
    console.log('[collector] 无启用的 API 采集源');
    return { found: 0, inserted: 0 };
  }

  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);
  if (keywords.length === 0) {
    console.log('[collector] 无关键词');
    return { found: 0, inserted: 0 };
  }

  const range = opts.start ? `${opts.start} ~ ${opts.end || '至今'}` : '全部';
  console.log(`[collector] ${sources.length} 个采集源, 关键词: ${keywords.join(', ')}, ${range}`);

  let totalFound = 0, totalInserted = 0;
  const defaultSourceId = sources[0].id;

  // 默认采集最近1天
  const end = opts.end || new Date().toISOString().slice(0, 10);
  const start = opts.start || new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // 翻页拉取全部数据（最多5页/500条）
  const items = await searchBidsAll({ start, end });
  console.log(`[collector] API 共返回 ${items.length} 条，开始关键词过滤`);

  for (const item of items) {
    const title = item.title || item.projectName || '';
    const matched = keywords.find(kw => title.includes(kw));
    if (!matched) continue;

    const url = `https://www.woyaobid.cn/detail/${item.id}`;
    const existing = db.prepare('SELECT id FROM bid_items WHERE url=?').get(url);
    if (existing) continue;

    totalFound++;
    const id = randomUUID();
    db.prepare(`INSERT INTO bid_items (id,source_id,title,bid_type,bid_time,url,status)
      VALUES (?,?,?,?,?,?,'new')`).run(
      id, defaultSourceId, title, item.projectClass || '公开招标', item.publishTime || null, url
    );
    totalInserted++;
  }

  console.log(`[collector] 命中 ${totalFound}, 新增 ${totalInserted}`);
  return { found: totalFound, inserted: totalInserted };
}

function mockCollect() {
  const items = [
    { url: 'https://www.woyaobid.cn/mock/001', title: '云南省政府采购网-2026年网络安全设备采购项目', projectClass: '公开招标' },
    { url: 'https://www.woyaobid.cn/mock/002', title: '昆明市政务云平台等保测评服务招标公告', projectClass: '竞争性磋商' },
    { url: 'https://www.woyaobid.cn/mock/003', title: '大理州教育系统信息化安全防护项目', projectClass: '公开招标' },
  ];
  let inserted = 0;
  for (const item of items) {
    const ex = db.prepare('SELECT id FROM bid_items WHERE url=?').get(item.url);
    if (!ex) {
      db.prepare(`INSERT INTO bid_items (id,title,bid_type,submit_type,url,status)
        VALUES (?,?,?,?,?,?,'new')`).run(randomUUID(), item.title, item.projectClass, '线上', item.url);
      inserted++;
    }
  }
  console.log(`[collector] 模拟: ${inserted} 条`);
  return { found: items.length, inserted };
}

let cronJob = null;
function startScheduler(intervalMs) {
  if (cronJob) return;
  console.log(`[collector] 定时器 ${intervalMs / 60000} 分钟`);
  setTimeout(() => runCollect(), 5000);
  cronJob = setInterval(() => runCollect(), intervalMs);
}

module.exports = { runCollect, startScheduler };
