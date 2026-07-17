// Scrapling collector — parallel to crawl4ai-collector.js
// Calls scrapling_crawler.py via child_process for each source
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { saveToTxt } = require('./bid-excel-writer');

const REGION_FILE = path.join(__dirname, '..', 'data', 'bid-region-filter.json');

function loadRegionFilter() {
  try {
    if (fs.existsSync(REGION_FILE)) {
      return JSON.parse(fs.readFileSync(REGION_FILE, 'utf-8'));
    }
  } catch {}
  return ['昆明','曲靖','玉溪','保山','昭通','丽江','普洱','临沧','楚雄','红河','文山','版纳','大理','德宏','怒江','迪庆','云南'];
}

function isTargetRegion(region) {
  const cities = loadRegionFilter();
  if (!cities || cities.length === 0) return true;
  if (!region) return false;
  for (const city of cities) {
    if (region.includes(city)) return true;
  }
  return false;
}

const PYTHON_SCRIPT = path.join(__dirname, 'scrapling_crawler.py');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay() {
  return 5000 + Math.floor(Math.random() * 10000); // 5-15s
}

async function crawlSource(url, keywords) {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const proc = spawn(pythonCmd, [PYTHON_SCRIPT, url, keywords.join(',')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', chunk => stdout += chunk.toString('utf-8'));
    proc.stderr.on('data', chunk => {
      const line = chunk.toString('utf-8');
      stderr += line;
      process.stderr.write(line);
    });

    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Python exited code=${code}: ${stderr.slice(-200)}`));
      }
      try {
        const results = JSON.parse(stdout);
        resolve(results);
      } catch (e) {
        reject(new Error(`JSON parse error: ${stdout.slice(0, 300)}`));
      }
    });

    proc.on('error', err => reject(err));
  });
}

function isWithinRange(dateStr, collectRange) {
  if (!dateStr || collectRange === 'all' || !collectRange) return true;
  const days = parseInt(collectRange) || 0;
  if (days <= 0) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d >= cutoff;
}

async function runCollect(opts = {}) {
  const startTime = Date.now();
  const sources = db.prepare(
    "SELECT * FROM bid_sources WHERE enabled=1 AND source_type='scrapling'"
  ).all();
  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);

  if (sources.length === 0) {
    console.log('[scrapling-collector] 无启用的采集源');
    return { engine: 'scrapling', found: 0, inserted: 0 };
  }
  if (keywords.length === 0) {
    console.log('[scrapling-collector] 无关键词，跳过');
    return { engine: 'scrapling', found: 0, inserted: 0 };
  }

  console.log(`[scrapling-collector] ${sources.length} 个源, ${keywords.length} 个关键词`);

  let totalFound = 0, totalInserted = 0;
  const allItems = [];

  for (const source of sources) {
    console.log(`[scrapling-collector] 采集源: ${source.name} (${source.url})`);

    try {
      const items = await crawlSource(source.url, keywords);
      const range = source.collect_range || '30d';
      const filtered = items.filter(item =>
        isWithinRange(item.doc_deadline, range) || isWithinRange(item.bid_time, range) || isWithinRange(item.notice_time, range)
      );
      if (filtered.length < items.length) {
        console.log(`[scrapling-collector] 采集范围 ${range}，过滤掉 ${items.length - filtered.length} 条过期数据`);
      }
      totalFound += filtered.length;
      console.log(`[scrapling-collector] ${source.name}: 命中 ${filtered.length} 条`);

      for (const item of filtered) {
        // 云南地区过滤
        const isYNSource = source.url && (source.url.includes('yngp') || source.url.includes('ggzy.yn'));
        if (item.region && !isTargetRegion(item.region)) {
          console.log('[scrapling-collector] 跳过非云南: ' + (item.title || '').substring(0, 40) + ' (' + item.region + ')');
          continue;
        }
        if (!item.region && !isYNSource) {
          console.log('[scrapling-collector] 跳过无地区: ' + (item.title || '').substring(0, 40));
          continue;
        }

        // Add source_name for txt/excel
        item.source_name = source.name;
        allItems.push(item);

        try {
          const existing = db.prepare('SELECT id FROM bid_items WHERE url=?').get(item.url);
          if (existing) continue;

          const id = randomUUID();
          db.prepare(`INSERT INTO bid_items (id,source_id,title,url,status,bid_type,project_no,amount,doc_deadline,bid_time,submit_type,purchase_requirements,evaluation,win_amount,bidder,win_company,region,industry,notice_time)
            VALUES (?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            id, source.id, item.title, item.url,
            item.bid_type || '公开招标', item.project_no || null, item.amount || null,
            item.doc_deadline || null, item.bid_time || null, item.submit_type || null,
            item.purchase_requirements || null, item.evaluation || null,
            item.win_amount || null, item.bidder || null, item.win_company || null,
            item.region || null, item.industry || null, item.notice_time || null
          );
          totalInserted++;
        } catch (e) {
          console.log(`[scrapling-collector] insert error for ${item.url?.slice(0, 80)}: ${e.message}`);
        }
      }
    } catch (e) {
      console.log(`[scrapling-collector] ${source.name} 采集失败: ${e.message}`);
    }

    // Delay between sources
    if (source !== sources[sources.length - 1]) {
      await sleep(randomDelay() * 2);
    }
  }

  // Save to txt
  if (allItems.length > 0) {
    saveToTxt('scrapling', allItems);
  }

  // 记录采集日志
  try {
    db.prepare(`INSERT INTO bid_collect_logs (id, engine, source_name, found, inserted, status, duration_ms)
      VALUES (?, 'scrapling', ?, ?, ?, 'success', ?)`).run(
      randomUUID(), sources.map(s => s.name).join(',') || null, totalFound, totalInserted,
      Date.now() - startTime
    );
  } catch {}

  console.log(`[scrapling-collector] 共发现 ${totalFound}, 新增 ${totalInserted}`);
  return { engine: 'scrapling', found: totalFound, inserted: totalInserted };
}

let scraplingCronJob = null;
function logCollectError(engine, error) {
  try {
    db.prepare(`INSERT INTO bid_collect_logs (id, engine, status, error_detail, duration_ms)
      VALUES (?, ?, 'error', ?, ?)`).run(randomUUID(), engine, error.message?.slice(0, 500) || String(error).slice(0, 500), 0);
  } catch {}
}
function startScheduler(intervalMs) {
  if (scraplingCronJob) return;
  console.log(`[scrapling] 定时器 ${Math.round(intervalMs / 60000)} 分钟`);
  setTimeout(() => runCollect().catch(e => { console.error('[scrapling] 初始化采集失败:', e.message); logCollectError('scrapling', e); }), 60000);
  scraplingCronJob = setInterval(() => runCollect().catch(e => { console.error('[scrapling] 采集失败:', e.message); logCollectError('scrapling', e); }), intervalMs);
}
function stopScheduler() {
  if (scraplingCronJob) { clearInterval(scraplingCronJob); scraplingCronJob = null; }
}

module.exports = { runCollect, startScheduler, stopScheduler };
