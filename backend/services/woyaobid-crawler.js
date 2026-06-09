// Woyaobid.cn (乙方宝) crawler
// Uses Crawl4AI MCP with cookie injection to crawl woyaobid search results,
// saves raw pages as txt, then parses with LLM into bid_statistics.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const { McpClient } = require('./mcp-client');

const DATA_DIR = path.resolve(__dirname, '../data/crawls');
const COOKIE_FILE = path.resolve(__dirname, '../data/woyaobid-cookies.json');
const WOYAOBID_SEARCH = 'https://www.woyaobid.cn/search';

let mcpClient = null;

async function getClient() {
  if (mcpClient && mcpClient.ready) return mcpClient;
  if (mcpClient) { try { await mcpClient.close(); } catch {} }

  // Pass active model credentials for structured_extract
  const mcpEnv = {};
  try {
    const activeModel = db.prepare('SELECT provider, model, api_key, api_base FROM model_configs WHERE is_active=1 LIMIT 1').get();
    if (activeModel && activeModel.api_key) {
      const providerMap = {
        deepseek: 'deepseek/deepseek-chat', xiaomi: 'openai/mimo-v2.5-pro',
        qwen: 'openai/qwen-max', anthropic: 'anthropic/claude-sonnet-4-6',
        zhipu: 'openai/glm-4', kimi: 'openai/moonshot-v1-8k', doubao: 'openai/doubao-pro-32k',
      };
      mcpEnv.CRAWL4AI_LLM_PROVIDER = providerMap[activeModel.provider] || `openai/${activeModel.model}`;
      mcpEnv.CRAWL4AI_LLM_API_KEY = activeModel.api_key;
      if (activeModel.api_base) mcpEnv.CRAWL4AI_LLM_API_BASE = activeModel.api_base;
    }
  } catch {}

  mcpClient = new McpClient({
    command: 'python',
    args: ['services/crawl4ai_mcp_server.py'],
    cwd: path.resolve(__dirname, '..'),
    env: mcpEnv
  });
  await mcpClient.initialize();
  await mcpClient.listTools();
  return mcpClient;
}

function loadCookies() {
  if (!fs.existsSync(COOKIE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf-8')); } catch { return null; }
}

function saveCookies(cookies) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // Accept both JSON string and object
  const obj = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(obj, null, 2));
}

async function crawlSearchPage(client, cookies, keyword, pageNum = 1) {
  const searchUrl = pageNum === 1
    ? `${WOYAOBID_SEARCH}?q=${encodeURIComponent(keyword)}`
    : `${WOYAOBID_SEARCH}?q=${encodeURIComponent(keyword)}&page=${pageNum}`;

  console.log(`[woyaobid] 搜索: ${searchUrl}`);
  const result = await client.callTool('crawl_page', {
    url: searchUrl,
    wait_for: 'networkidle',
    timeout: 30000,
    cookies
  });
  const text = result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
  return text;
}

async function crawlDetailPage(client, cookies, url) {
  console.log(`[woyaobid] 详情: ${url}`);
  const result = await client.callTool('crawl_page', {
    url,
    wait_for: 'networkidle',
    timeout: 20000,
    cookies
  });
  return result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
}

// Extract links from markdown with keyword filtering
function extractLinks(markdown, keywords) {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const links = [];
  let m;
  while ((m = linkPattern.exec(markdown)) !== null) {
    const title = m[1].trim().replace(/\s+/g, ' ');
    const href = m[2].trim();
    if (title.length < 8 || title.length > 300) continue;
    const skip = ['首页','上一页','下一页','末页','返回','详情','查看','附件','下载','登录','注册','注销'];
    if (skip.includes(title)) continue;
    for (const kw of keywords) {
      if (title.includes(kw)) { links.push({ title, href }); break; }
    }
  }
  return links;
}

// Parse bid detail markdown into structured data using LLM
async function parseDetailWithLLM(client, markdown) {
  const prompt = `从以下招标公告/中标公告的Markdown内容中提取结构化信息。返回JSON格式：
{
  "bid_win_time": "中标时间 YYYY-MM-DD",
  "notice_time": "公告发布时间 YYYY-MM-DD",
  "bid_time": "投标截止时间 YYYY-MM-DD",
  "region": "地区（如昆明、曲靖）",
  "industry": "一级行业（政府/学校/医院/企业）",
  "bidder": "招标人/采购单位",
  "bid_company": "招标代理公司",
  "project_name": "项目名称",
  "project_content": "项目产品及内容描述",
  "budget_amount": 项目预算金额数字（万元）,
  "url": "公告原始链接",
  "bid_method": "招标方式（公开招标/竞争性磋商/询价等）",
  "win_company": "中标单位",
  "win_amount": 中标金额数字（万元）
}
只返回JSON，不要其他内容。如果某个字段无法确定，设为null。

内容：
${markdown.slice(0, 8000)}`;

  try {
    // Use the active model via HTTP call to the chat API
    // For now, return basic extraction from markdown patterns
    const data = {
      project_name: null, project_content: null, budget_amount: null,
      bid_win_time: null, notice_time: null, bid_time: null,
      region: '昆明', industry: null, bidder: null, bid_company: null,
      bid_method: '公开招标', win_company: null, win_amount: null, url: null
    };

    // Simple regex extraction
    const titleMatch = markdown.match(/#+\s*(.+?)(?:\n|$)/);
    if (titleMatch) data.project_name = titleMatch[1].trim().substring(0, 300);

    const amountMatch = markdown.match(/(?:预算|项目金额|采购预算)[：:]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/);
    if (amountMatch) data.budget_amount = parseFloat(amountMatch[1]);

    const winAmountMatch = markdown.match(/(?:中标金额|成交金额|中标价)[：:]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/);
    if (winAmountMatch) data.win_amount = parseFloat(winAmountMatch[1]);

    const winMatch = markdown.match(/(?:中标人|中标单位|成交供应商|供应商名称)[：:]?\s*(.+?)(?:\n|$)/);
    if (winMatch) data.win_company = winMatch[1].trim().substring(0, 200);

    const bidderMatch = markdown.match(/(?:采购人|招标人|采购单位)[：:]?\s*(.+?)(?:\n|$)/);
    if (bidderMatch) data.bidder = bidderMatch[1].trim().substring(0, 200);

    const dateMatch = markdown.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/g);
    if (dateMatch) {
      if (dateMatch.length >= 1) data.notice_time = dateMatch[0].replace(/\//g, '-');
      if (dateMatch.length >= 2) data.bid_time = dateMatch[1].replace(/\//g, '-');
      if (dateMatch.length >= 3) data.bid_win_time = dateMatch[2].replace(/\//g, '-');
    }

    if (markdown.includes('竞争性磋商')) data.bid_method = '竞争性磋商';
    else if (markdown.includes('竞争性谈判')) data.bid_method = '竞争性谈判';
    else if (markdown.includes('询价')) data.bid_method = '询价';
    else if (markdown.includes('单一来源')) data.bid_method = '单一来源';
    else if (markdown.includes('邀请招标')) data.bid_method = '邀请招标';

    if (markdown.includes('学校') || markdown.includes('学院') || markdown.includes('大学')) data.industry = '学校';
    else if (markdown.includes('医院') || markdown.includes('卫生院')) data.industry = '医院';
    else if (markdown.includes('政府') || markdown.includes('局') || markdown.includes('委员会')) data.industry = '政府';
    else data.industry = '企业';

    return data;
  } catch (e) {
    console.log('[woyaobid] parseDetail error:', e.message);
    return null;
  }
}

async function runCollect(opts = {}) {
  let cookies = null;

  // Accept cookies from opts or load from file
  if (opts.cookies) {
    saveCookies(opts.cookies);
    cookies = typeof opts.cookies === 'string' ? JSON.parse(opts.cookies) : opts.cookies;
  } else {
    cookies = loadCookies();
  }

  // If still no cookies, they need to be provided
  if (!cookies || !cookies.length) {
    throw new Error('未配置乙方宝 cookies，请先扫码登录并粘贴 cookies');
  }

  const keywords = db.prepare('SELECT keyword FROM bid_keywords').all().map(r => r.keyword);
  if (keywords.length === 0) {
    console.log('[woyaobid] 无关键词');
    return { found: 0, inserted: 0 };
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log(`[woyaobid] 开始采集, ${keywords.length} 个关键词`);
  const client = await getClient();

  const allDetailTexts = [];
  const urlSet = new Set();

  for (const kw of keywords) {
    console.log(`[woyaobid] 关键词: ${kw}`);
    // Crawl up to 3 search pages per keyword
    for (let page = 1; page <= 3; page++) {
      const searchMd = await crawlSearchPage(client, cookies, kw, page);
      if (!searchMd || searchMd.length < 100) break;

      const links = extractLinks(searchMd, [kw]);
      console.log(`[woyaobid] ${kw} 第${page}页: ${links.length} 条匹配链接`);
      if (links.length === 0) break;

      for (const link of links) {
        if (urlSet.has(link.href)) continue;
        urlSet.add(link.href);

        await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000)); // delay 3-8s
        const detailMd = await crawlDetailPage(client, cookies, link.href);
        if (detailMd) {
          allDetailTexts.push(`\n---\nURL: ${link.href}\nTitle: ${link.title}\n\n${detailMd}`);
        }
      }
    }
  }

  // Save raw txt
  const dateStr = new Date().toISOString().slice(0, 10);
  const txtFile = path.join(DATA_DIR, `woyaobid_${dateStr}.txt`);
  const fullText = allDetailTexts.join('\n');
  fs.writeFileSync(txtFile, fullText, 'utf-8');
  console.log(`[woyaobid] 保存文本: ${txtFile} (${fullText.length} 字符)`);

  // Parse and insert
  let inserted = 0;
  const insert = db.prepare(`INSERT OR IGNORE INTO bid_statistics (id,bid_win_time,notice_time,bid_time,region,industry,bidder,bid_company,project_name,project_content,budget_amount,url,bid_method,win_company,win_amount,remark,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (const text of allDetailTexts) {
    const urlMatch = text.match(/^URL: (.+)$/m);
    const url = urlMatch ? urlMatch[1].trim() : null;
    const titleMatch = text.match(/^Title: (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;

    if (!url) continue;

    // Check duplicate
    const existing = db.prepare('SELECT id FROM bid_statistics WHERE url=?').get(url);
    if (existing) continue;

    const parsed = await parseDetailWithLLM(client, text);
    if (!parsed) continue;

    if (!parsed.project_name && title) parsed.project_name = title;
    parsed.url = url;

    try {
      insert.run(randomUUID(),
        parsed.bid_win_time||null, parsed.notice_time||null, parsed.bid_time||null,
        parsed.region||'昆明', parsed.industry||null, parsed.bidder||null, parsed.bid_company||null,
        parsed.project_name||title||'未知项目', parsed.project_content||null, parsed.budget_amount||null,
        parsed.url, parsed.bid_method||'公开招标', parsed.win_company||null,
        parsed.win_amount||null, null, 'crawl4ai');
      inserted++;
    } catch (e) {
      console.log(`[woyaobid] insert error: ${e.message}`);
    }
  }

  console.log(`[woyaobid] 共采集 ${allDetailTexts.length} 条, 新增 ${inserted}`);
  return { found: allDetailTexts.length, inserted, txtFile };
}

module.exports = { runCollect, saveCookies, loadCookies };
