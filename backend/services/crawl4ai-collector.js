// Crawl4AI-based bid collector — replaces Playwright/Edge headless crawler
// Connects to Crawl4AI MCP server, uses built-in stealth + structured extraction
const { randomUUID } = require('crypto');
const crypto = require('crypto');
const db = require('../db');
const { McpClient } = require('./mcp-client');
const { saveToTxt } = require('./bid-excel-writer');

// 云南地区城市列表（只采集云南地区数据）
const YN_CITIES = ['昆明','曲靖','玉溪','保山','昭通','丽江','普洱','临沧','楚雄','红河','文山','版纳','大理','德宏','怒江','迪庆','云南'];

function isYunnan(region) {
  if (!region) return false;
  for (const city of YN_CITIES) {
    if (region.includes(city)) return true;
  }
  return false;
}

const CONFIG = {
  // Crawl4AI MCP server command
  mcpCommand: process.env.CRAWL4AI_MCP_CMD || 'python',
  mcpArgs: (process.env.CRAWL4AI_MCP_ARGS || 'services/crawl4ai_mcp_server.py').split(/\s+/).filter(Boolean),
  mcpCwd: process.env.CRAWL4AI_MCP_CWD || require('path').resolve(__dirname, '..'),
  // Session isolation: one MCP session per source domain
  pageTimeout: 30000,
  maxConcurrentPages: 3,
  // Delay between requests to same domain (ms)
  interRequestDelay: [5000, 15000], // random 5-15s
};

let mcpClient = null;

function randomDelay() {
  const [min, max] = CONFIG.interRequestDelay;
  return min + Math.floor(Math.random() * (max - min));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hash(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 16);
}

async function getClient() {
  if (mcpClient && mcpClient.ready) return mcpClient;

  if (mcpClient) {
    try { await mcpClient.close(); } catch {}
  }

  // Pass active model credentials to MCP server for structured_extract
  const mcpEnv = {};
  try {
    const activeModel = db.prepare('SELECT provider, model, api_key, api_base FROM model_configs WHERE is_active=1 LIMIT 1').get();
    if (activeModel && activeModel.api_key) {
      // Map MClaw provider names to litellm provider strings
      const providerMap = {
        deepseek: 'deepseek/deepseek-chat',
        xiaomi: 'openai/mimo-v2.5-pro',  // MiMo uses OpenAI-compatible API
        qwen: 'openai/qwen-max',          // Qwen uses OpenAI-compatible API
        anthropic: 'anthropic/claude-sonnet-4-6',
        zhipu: 'openai/glm-4',
        kimi: 'openai/moonshot-v1-8k',
        doubao: 'openai/doubao-pro-32k',
      };
      mcpEnv.CRAWL4AI_LLM_PROVIDER = providerMap[activeModel.provider] || `openai/${activeModel.model}`;
      mcpEnv.CRAWL4AI_LLM_API_KEY = activeModel.api_key;
      if (activeModel.api_base) mcpEnv.CRAWL4AI_LLM_API_BASE = activeModel.api_base;
    }
  } catch {}

  mcpClient = new McpClient({
    command: CONFIG.mcpCommand,
    args: CONFIG.mcpArgs,
    cwd: CONFIG.mcpCwd,
    env: mcpEnv
  });

  await mcpClient.initialize();
  await mcpClient.listTools();
  return mcpClient;
}

// Try different tool name conventions (Crawl4AI MCP tools may vary)
async function findTool(client, candidates) {
  const tools = await client.listTools();
  for (const name of candidates) {
    if (tools.find(t => t.name === name)) return name;
  }
  return null;
}

// Crawl a single page, extract links matching keywords
async function crawlListingPage(client, source, keywords) {
  const crawlTool = await findTool(client, ['crawl_page', 'crawl', 'crawl_web', 'fetch_page', 'fetch']);
  if (!crawlTool) throw new Error('No crawl tool found in Crawl4AI MCP server');

  const result = await client.callTool(crawlTool, {
    url: source.url,
    wait_for: '',  // page event → None in Python (no CSS selector wait)
    timeout: CONFIG.pageTimeout,
    output_format: 'markdown'
  });

  // result.content contains the MCP content items (text, resource, etc.)
  const contentItems = result.content || [];
  const textContent = contentItems
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');

  // Find links in crawled content
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/\S+?)(?:\s+"[^"]*")?\)/g;
  const links = [];
  let match;
  while ((match = linkPattern.exec(textContent)) !== null) {
    const title = match[1].trim().replace(/\s+/g, ' ');
    const href = match[2].trim();
    if (title.length < 8 || title.length > 300) continue;
    if (/^(首页|上一页|下一页|末页|返回|更多|详情|查看|附件|下载|登录|注册|注销)$/.test(title)) continue;
    links.push({ title, href });
  }

  // Filter by keywords
  const matched = [];
  for (const link of links) {
    for (const kw of keywords) {
      if (link.title.includes(kw)) {
        matched.push({ ...link, source_id: source.id });
        break;
      }
    }
  }

  return matched;
}

// Crawl detail page and extract structured bid data
async function extractBidDetail(client, url) {
  const crawlTool = await findTool(client, ['crawl_page', 'crawl', 'crawl_web']);
  const extractTool = await findTool(client, ['structured_extract', 'extract', 'extract_structured']);

  if (extractTool) {
    // Crawl4AI supports structured extraction via LLM or schema
    const extractSchema = {
      type: 'object',
      properties: {
        title: { type: 'string', description: '招标项目名称' },
        project_no: { type: 'string', description: '项目编号' },
        bid_type: { type: 'string', description: '招标方式，如公开招标/竞争性磋商/询价/单一来源' },
        amount: { type: 'string', description: '预算金额或项目金额（万元）' },
        win_amount: { type: 'string', description: '中标金额或成交金额（万元）' },
        doc_deadline: { type: 'string', description: '文件获取截止时间或报名截止时间' },
        bid_time: { type: 'string', description: '开标时间或投标截止时间' },
        submit_type: { type: 'string', description: '投标方式或提交方式' },
        purchase_requirements: { type: 'string', description: '采购需求或项目需求描述' },
        evaluation: { type: 'string', description: '评标方法' },
        bidder: { type: 'string', description: '采购人或招标人名称' },
        win_company: { type: 'string', description: '中标人或中标单位名称' },
        region: { type: 'string', description: '行政区域或省份地区' },
        industry: { type: 'string', description: '行业分类，如学校/医院/政府/企业' },
        notice_time: { type: 'string', description: '公告发布时间' },
        contact: { type: 'string', description: '联系方式' }
      }
    };

    try {
      const result = await client.callTool(extractTool, {
        url,
        schema: extractSchema,
        wait_for: '',
        timeout: CONFIG.pageTimeout
      });

      const content = result.content || [];
      const extracted = content.find(c => c.type === 'text');
      if (extracted) {
        try {
          const parsed = JSON.parse(extracted.text);
          if (parsed && parsed.title) return parsed;
        } catch {}
      }
    } catch (e) {
      console.log(`[crawl4ai] extract detail failed for ${url}: ${e.message}`);
    }
  }

  // Fallback: crawl detail page and return raw markdown for downstream parsing
  if (crawlTool) {
    try {
      const result = await client.callTool(crawlTool, {
        url,
        wait_for: '',
        timeout: CONFIG.pageTimeout,
        output_format: 'markdown'
      });
      const content = result.content || [];
      const text = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      return { title: null, raw: text.slice(0, 6000) };
    } catch (e) {
      console.log(`[crawl4ai] crawl detail failed for ${url}: ${e.message}`);
    }
  }

  return null;
}

// 根据 collect_range 判断日期是否在范围内
function isWithinRange(dateStr, collectRange) {
  if (!dateStr || collectRange === 'all' || !collectRange) return true;
  const days = parseInt(collectRange) || 0;
  if (days <= 0) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true; // 无法解析的日期不过滤
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d >= cutoff;
}

async function collectFromSource(client, source, keywords) {
  console.log(`[crawl4ai] 采集源: ${source.name} (${source.url})`);
  const results = [];

  try {
    const listingItems = await crawlListingPage(client, source, keywords);
    console.log(`[crawl4ai] ${source.name}: 列表命中 ${listingItems.length} 条`);

    for (const item of listingItems) {
      await sleep(randomDelay());
      const detail = await extractBidDetail(client, item.href);
      // 云南地区过滤
      const region = detail?.region || null;
      const isYNSource = source.url && (source.url.includes('yngp') || source.url.includes('ggzy.yn'));
      if (region && !isYunnan(region)) {
        console.log(`[crawl4ai] 跳过非云南: ${(detail?.title || item.title).substring(0, 40)} (${region})`);
        continue;
      }
      if (!region && !isYNSource) {
        console.log(`[crawl4ai] 跳过无地区: ${(detail?.title || item.title).substring(0, 40)}`);
        continue;
      }
      results.push({
        source_id: item.source_id,
        source_name: source.name,
        title: (detail?.title || item.title).substring(0, 300),
        url: item.href,
        ...(detail ? {
          project_no: detail.project_no || null,
          bid_type: detail.bid_type || '公开招标',
          amount: detail.amount ? parseFloat(detail.amount) : null,
          win_amount: detail.win_amount ? parseFloat(detail.win_amount) : null,
          doc_deadline: detail.doc_deadline || null,
          bid_time: detail.bid_time || null,
          submit_type: detail.submit_type || null,
          purchase_requirements: detail.purchase_requirements || null,
          evaluation: detail.evaluation || null,
          bidder: detail.bidder || null,
          win_company: detail.win_company || null,
          region: detail.region || null,
          industry: detail.industry || null,
          notice_time: detail.notice_time || null,
        } : { bid_type: '公开招标' })
      });
    }
  } catch (e) {
    console.log(`[crawl4ai] ${source.name} 采集失败: ${e.message}`);
  }

  return results;
}

async function runCollect(opts = {}) {
  const sources = db.prepare("SELECT * FROM bid_sources WHERE enabled=1 AND (source_type='web' OR source_type='crawl4ai') AND source_type!='woyaobid'").all();
  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);

  if (sources.length === 0) {
    console.log('[crawl4ai] 无启用的网页采集源（source_type=web/crawl4ai）');
    return { found: 0, inserted: 0 };
  }
  if (keywords.length === 0) {
    console.log('[crawl4ai] 无关键词，跳过');
    return { found: 0, inserted: 0 };
  }

  console.log(`[crawl4ai] ${sources.length} 个源, ${keywords.length} 个关键词`);

  const client = await getClient();
  let totalFound = 0, totalInserted = 0;
  const allItems = [];

  for (const source of sources) {
    const items = await collectFromSource(client, source, keywords);
    const range = source.collect_range || '30d';
    const filtered = items.filter(item =>
      isWithinRange(item.doc_deadline, range) || isWithinRange(item.bid_time, range) || isWithinRange(item.notice_time, range)
    );
    if (filtered.length < items.length) {
      console.log(`[crawl4ai] 采集范围 ${range}，过滤掉 ${items.length - filtered.length} 条过期数据`);
    }
    totalFound += filtered.length;

    for (const item of filtered) {
      allItems.push(item);
      try {
        const existing = db.prepare('SELECT id FROM bid_items WHERE url=?').get(item.url);
        if (existing) continue;

        const id = randomUUID();
        db.prepare(`INSERT INTO bid_items (id,source_id,title,url,status,bid_type,project_no,amount,doc_deadline,bid_time,submit_type,purchase_requirements,evaluation,win_amount,bidder,win_company,region,industry,notice_time)
          VALUES (?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          id, item.source_id, item.title, item.url,
          item.bid_type, item.project_no, item.amount,
          item.doc_deadline, item.bid_time, item.submit_type,
          item.purchase_requirements, item.evaluation,
          item.win_amount, item.bidder, item.win_company,
          item.region, item.industry, item.notice_time
        );
        totalInserted++;
      } catch (e) {
        console.log(`[crawl4ai] insert error for ${item.url?.slice(0, 80)}: ${e.message}`);
      }
    }

    // Delay between sources
    if (source !== sources[sources.length - 1]) {
      await sleep(randomDelay() * 2);
    }
  }

  // Save to txt
  if (allItems.length > 0) {
    saveToTxt('crawl4ai', allItems);
  }

  console.log(`[crawl4ai] 共发现 ${totalFound}, 新增 ${totalInserted}`);
  return { found: totalFound, inserted: totalInserted };
}

let cronJob = null;
function startScheduler(intervalMs) {
  if (cronJob) return;
  console.log(`[crawl4ai] 定时器 ${Math.round(intervalMs / 60000)} 分钟`);
  setTimeout(() => runCollect().catch(e => console.error('[crawl4ai] 初始化采集失败:', e.message)), 30000);
  cronJob = setInterval(() => runCollect().catch(e => console.error('[crawl4ai] 采集失败:', e.message)), intervalMs);
}

function stopScheduler() {
  if (cronJob) { clearInterval(cronJob); cronJob = null; }
}

async function close() {
  stopScheduler();
  if (mcpClient) { try { await mcpClient.close(); } catch {}; mcpClient = null; }
}

module.exports = { runCollect, startScheduler, stopScheduler, close };
