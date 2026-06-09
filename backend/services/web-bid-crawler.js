// Web bid crawler — Crawl4AI MCP → bid_sources + keywords → TXT → LLM → bid_statistics
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const { McpClient } = require('./mcp-client');

const DATA_DIR = path.resolve(__dirname, '../data/crawls');
const YUNNAN_CITIES = ['昆明','曲靖','玉溪','保山','昭通','丽江','普洱','临沧','楚雄','红河','文山','版纳','大理','德宏','怒江','迪庆','云南'];

let mcpClient = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getClient() {
  if (mcpClient && mcpClient.ready) return mcpClient;
  if (mcpClient) { try { await mcpClient.close(); } catch {} }
  const mcpEnv = {};
  try {
    const activeModel = db.prepare('SELECT provider, model, api_key, api_base FROM model_configs WHERE is_active=1 LIMIT 1').get();
    if (activeModel && activeModel.api_key) {
      const providerMap = { deepseek: 'deepseek/deepseek-chat', xiaomi: 'openai/mimo-v2.5-pro', qwen: 'openai/qwen-max', anthropic: 'anthropic/claude-sonnet-4-6', zhipu: 'openai/glm-4', kimi: 'openai/moonshot-v1-8k', doubao: 'openai/doubao-pro-32k' };
      mcpEnv.CRAWL4AI_LLM_PROVIDER = providerMap[activeModel.provider] || `openai/${activeModel.model}`;
      mcpEnv.CRAWL4AI_LLM_API_KEY = activeModel.api_key;
      if (activeModel.api_base) mcpEnv.CRAWL4AI_LLM_API_BASE = activeModel.api_base;
    }
  } catch {}
  mcpClient = new McpClient({ command: 'python', args: ['services/crawl4ai_mcp_server.py'], cwd: path.resolve(__dirname, '..'), env: mcpEnv });
  await mcpClient.initialize();
  await mcpClient.listTools();
  return mcpClient;
}

// Extract all valid markdown links from crawled page, with region detection from surrounding text.
// Many gov sites put region info outside the link (e.g. "地域：云南"), so we check ~200 chars after each link.
function extractAllLinks(markdown) {
  const linkPattern = /(?<!!)\[([^\]]+)\]\(((?:https?:)?\/\/[^)]+)\)/g;
  const links = [];
  let m;
  while ((m = linkPattern.exec(markdown)) !== null) {
    const title = m[1].trim().replace(/\s+/g, ' ');
    let href = m[2].trim();
    // Strip markdown title attribute: "url \"title\"" → "url"
    const quoteIdx = href.indexOf('"');
    if (quoteIdx > 0) href = href.substring(0, quoteIdx).trim();
    if (href.startsWith('//')) href = 'https:' + href;
    if (!href.startsWith('http')) continue;
    if (title.length < 8 || title.length > 300) continue;
    // Skip image URLs and non-HTML resources
    if (/\.(png|jpg|jpeg|gif|svg|ico|css|js|pdf|zip|rar|doc|xls)(\?|$)/i.test(href)) continue;
    const skip = ['首页','上一页','下一页','末页','返回','更多','详情','查看','附件','下载','登录','注册','注销','English','中文','无障碍','适老化','网站地图','关于','联系','版权','隐私','RSS','订阅'];
    if (skip.includes(title)) continue;

    // Check surrounding text for region marker (e.g. "地域：云南")
    const afterLink = markdown.substring(m.index, m.index + 400);
    const regionMatch = afterLink.match(/地域[：:]\s*_?\s*(\S+?)(?:\s|_|$)/);
    const contextRegion = regionMatch ? regionMatch[1].replace(/_/g, '').trim() : null;

    links.push({ title, href, contextRegion });
  }
  return links;
}

// Crawl listing page (paginated)
async function crawlListingPage(client, sourceUrl, pageNum = 1) {
  // Build page URL — most gov sites use index.html for page 1, index_1.html for page 2+
  let pageUrl = sourceUrl;
  if (pageNum > 1) {
    if (sourceUrl.endsWith('/')) {
      pageUrl = sourceUrl + `index_${pageNum - 1}.html`;
    } else if (sourceUrl.includes('?')) {
      pageUrl = sourceUrl + `&page=${pageNum}`;
    } else {
      pageUrl = sourceUrl + `?page=${pageNum}`;
    }
  }

  console.log(`[web-crawler] 列表页: ${pageUrl}`);
  const result = await client.callTool('crawl_page', { url: pageUrl, wait_for: 'networkidle', timeout: 30000 });
  const text = result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
  return text;
}

// Crawl detail page
async function crawlDetailPage(client, url) {
  console.log(`[web-crawler] 详情: ${url}`);
  const result = await client.callTool('crawl_page', { url, wait_for: 'networkidle', timeout: 20000 });
  return result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n') || '';
}

// Parse detail markdown → bid_statistics fields via LLM (or regex fallback)
async function parseDetail(client, markdown, url, title) {
  // Regex extraction for common patterns
  const data = {
    bid_publish_time: null, registration_time: null, bid_time: null,
    region: '昆明', industry: null, bidder: null, bid_company: null,
    project_name: title || null, project_content: null, budget_amount: null,
    bid_method: '公开招标', bid_win_time: null, notice_time: null,
    win_company: null, win_amount: null, url
  };

  const titleMatch = markdown.match(/^\s*#+\s*(.+?)(?:\n|$)/m) || markdown.match(/(?:项目名称|采购项目名称|招标项目)[：:]\s*(.+?)(?:\n|$)/);
  if (!data.project_name && titleMatch) data.project_name = titleMatch[1].trim().substring(0, 300);

  const budgetMatch = markdown.match(/(?:预算金额|项目预算|采购预算|预算)[：:]?\s*\|?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/);
  if (budgetMatch) data.budget_amount = parseFloat(budgetMatch[1]);

  const winAmountMatch = markdown.match(/(?:中标金额|成交金额|中标价|中标总金额)[：:]?\s*\|?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:万元|万)/);
  if (winAmountMatch) data.win_amount = parseFloat(winAmountMatch[1]);

  const winMatch = markdown.match(/(?:中标人|中标单位|成交供应商|供应商名称|中标供应商)[：:]?\s*(.+?)(?:\n|$)/);
  if (winMatch) data.win_company = winMatch[1].trim().substring(0, 200);

  const bidderMatch = markdown.match(/(?:采购人|招标人|采购单位|招标单位)[：:]?\s*(.+?)(?:\n|$)/);
  if (bidderMatch) data.bidder = bidderMatch[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200);

  const agencyMatch = markdown.match(/(?:采购代理机构|招标代理|代理机构)(?:名称)?[：:]?\s*\|?\s*(.+?)(?:\n|$)/);
  if (agencyMatch) data.bid_company = agencyMatch[1].trim().replace(/^\|\s*|\s*\|$/g, '').substring(0, 200);

  const dateMatch = markdown.match(/(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/g);
  if (dateMatch) {
    const dates = dateMatch.map(d => d.replace(/[年月]/g, '-').replace('日', ''));
    if (dates.length >= 1) data.bid_publish_time = dates[0];
    if (dates.length >= 2) data.registration_time = dates[1];
    if (dates.length >= 3) data.bid_time = dates[2];
  }

  if (markdown.includes('竞争性磋商')) data.bid_method = '竞争性磋商';
  else if (markdown.includes('竞争性谈判')) data.bid_method = '竞争性谈判';
  else if (markdown.includes('询价')) data.bid_method = '询价';
  else if (markdown.includes('单一来源')) data.bid_method = '单一来源';
  else if (markdown.includes('邀请招标')) data.bid_method = '邀请招标';

  // Industry detection
  if (/学校|学院|大学|中学|小学|幼儿园/.test(markdown)) data.industry = '学校';
  else if (/医院|卫生院|疾控|妇幼/.test(markdown)) data.industry = '医院';
  else if (/政府|局|委员会|办公室|公安|法院|检察院/.test(markdown)) data.industry = '政府';
  else data.industry = '企业';

  // Region detection — check "行政区域" field first to avoid false matches (e.g. agency address in 昆明 for a 德宏 project)
  const adminAreaMatch = markdown.match(/行政区域[：:]?\s*\|?\s*(\S+?)(?:\s|\||$)/);
  const adminArea = adminAreaMatch ? adminAreaMatch[1].trim() : null;
  let regionFound = false;
  if (adminArea) {
    for (const city of YUNNAN_CITIES) {
      if (adminArea.includes(city)) { data.region = city === '云南' ? '昆明' : city; regionFound = true; break; }
    }
  }
  if (!regionFound) {
    for (const city of YUNNAN_CITIES) {
      if (markdown.includes(city)) { data.region = city === '云南' ? '昆明' : city; break; }
    }
  }

  return data;
}

async function runCollect(opts = {}) {
  const sources = db.prepare("SELECT * FROM bid_sources WHERE enabled=1 AND (source_type='web' OR source_type='crawl4ai') AND url NOT LIKE '%qiye.qianlima.com%'").all();
  if (sources.length === 0) throw new Error('无启用的网页采集源');

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  console.log(`[web-crawler] ${sources.length} 个源`);
  const client = await getClient();

  const allDetailTexts = [];
  const urlSet = new Set();

  for (const source of sources) {
    console.log(`[web-crawler] 采集源: ${source.name} (${source.url})`);
    let sourceHits = 0;

    // Crawl up to 3 listing pages per source
    for (let page = 1; page <= 3; page++) {
      const listingMd = await crawlListingPage(client, source.url, page);
      if (!listingMd || listingMd.length < 100) break;

      // Extract ALL links, filter by Yunnan region (in title OR context "地域：云南")
      const allLinks = extractAllLinks(listingMd);
      const yunnanLinks = allLinks.filter(l => {
        if (YUNNAN_CITIES.some(c => l.title.includes(c))) return true;
        if (l.contextRegion && YUNNAN_CITIES.some(c => l.contextRegion.includes(c))) return true;
        return false;
      });
      console.log(`[web-crawler] ${source.name} 第${page}页: ${allLinks.length} 条链接, ${yunnanLinks.length} 条云南`);
      if (allLinks.length === 0) break;

      for (const link of yunnanLinks) {
        if (urlSet.has(link.href)) continue;
        urlSet.add(link.href);
        await sleep(3000 + Math.random() * 5000);
        const detailMd = await crawlDetailPage(client, link.href);
        if (detailMd) {
          allDetailTexts.push(`\n---\nURL: ${link.href}\nTitle: ${link.title}\n\n${detailMd}`);
          sourceHits++;
        }
      }
    }
    console.log(`[web-crawler] ${source.name}: 共采集 ${sourceHits} 条详情`);
    // Delay between sources
    if (source !== sources[sources.length - 1]) await sleep(8000 + Math.random() * 8000);
  }

  // Save TXT
  const dateStr = new Date().toISOString().slice(0, 10);
  const txtFile = path.join(DATA_DIR, `web_bids_${dateStr}.txt`);
  const fullText = allDetailTexts.join('\n');
  fs.writeFileSync(txtFile, fullText, 'utf-8');
  console.log(`[web-crawler] 保存文本: ${txtFile} (${fullText.length} 字符)`);

  // Parse and insert into bid_statistics
  let inserted = 0;
  const insert = db.prepare(`INSERT OR IGNORE INTO bid_statistics (id,bid_publish_time,registration_time,bid_time,region,industry,bidder,bid_company,project_name,project_content,budget_amount,url,bid_method,bid_win_time,notice_time,win_company,win_amount,remark,source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  for (const text of allDetailTexts) {
    const urlMatch = text.match(/^URL: (.+)$/m);
    const url = urlMatch ? urlMatch[1].trim() : null;
    const titleMatch = text.match(/^Title: (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : null;
    if (!url) continue;

    const existing = db.prepare('SELECT id FROM bid_statistics WHERE url=?').get(url);
    if (existing) continue;

    const parsed = await parseDetail(client, text, url, title);
    if (!parsed) continue;

    try {
      insert.run(randomUUID(),
        parsed.bid_publish_time||null, parsed.registration_time||null, parsed.bid_time||null,
        parsed.region||'昆明', parsed.industry||null, parsed.bidder||null, parsed.bid_company||null,
        parsed.project_name||title||'未知项目', parsed.project_content||null, parsed.budget_amount||null,
        parsed.url, parsed.bid_method||'公开招标', parsed.bid_win_time||null, parsed.notice_time||null,
        parsed.win_company||null, parsed.win_amount||null, null, 'crawl4ai');
      inserted++;
    } catch (e) {
      console.log(`[web-crawler] insert error: ${e.message}`);
    }
  }

  console.log(`[web-crawler] 共采集 ${allDetailTexts.length} 条, 新增 ${inserted}`);
  return { found: allDetailTexts.length, inserted, txtFile };
}

module.exports = { runCollect };
