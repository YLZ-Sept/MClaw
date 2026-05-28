// Content extraction from platform URLs — Node.js port of content_extractor.py
const cheerio = require('cheerio');

const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/121.0.2277.107 Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function detectPlatform(url) {
  if (/douyin\.com|v\.douyin\.com|iesdouyin\.com/.test(url)) return 'douyin';
  if (/xiaohongshu\.com|xhslink\.com/.test(url)) return 'xiaohongshu';
  if (/mp\.weixin\.qq\.com|weixin\.qq\.com/.test(url)) return 'weixin';
  return 'other';
}

async function extractDouyin(url) {
  // Follow share link redirect to get video_id
  const resp = await fetch(url, { headers: { 'User-Agent': MOBILE_UA }, redirect: 'follow' });
  const finalUrl = resp.url;
  const videoId = finalUrl.split('?')[0].replace(/\/+$/, '').split('/').pop();

  // Fetch share page SSR
  const shareUrl = `https://www.iesdouyin.com/share/video/${videoId}`;
  const page = await fetch(shareUrl, { headers: { 'User-Agent': MOBILE_UA } });
  const html = await page.text();

  // Extract window._ROUTER_DATA JSON
  const match = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/s);
  if (!match) throw new Error('无法解析抖音分享页数据');

  const data = JSON.parse(match[1].trim());
  const loader = data.loaderData || {};

  let item;
  const videoKey = 'video_(id)/page';
  const noteKey = 'note_(id)/page';
  if (loader[videoKey]) {
    item = loader[videoKey].videoInfoRes.item_list[0];
  } else if (loader[noteKey]) {
    item = loader[noteKey].videoInfoRes.item_list[0];
  } else {
    throw new Error('无法从抖音数据中解析视频信息');
  }

  const desc = (item.desc || '').trim();
  const hashtags = desc.match(/#(\w+)/g);
  const tags = hashtags ? hashtags.slice(0, 5).map(t => t.slice(1)).join(',') : '';

  return {
    title: desc.slice(0, 100) || '（无标题）',
    body: desc.slice(0, 500),
    tags,
    source_url: url,
    platform: 'douyin'
  };
}

async function extractViaJina(url) {
  const resp = await fetch(`https://r.jina.ai/${url}`, {
    headers: { 'Accept': 'text/markdown' },
    signal: AbortSignal.timeout(10000)
  });
  if (resp.status !== 200) throw new Error('Jina 提取失败');
  return parseMarkdown(await resp.text(), url);
}

function parseMarkdown(md, url) {
  const lines = md.trim().split('\n');
  let title = '';
  let bodyLines = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;
    if (!title && stripped.startsWith('#')) {
      title = stripped.replace(/^#+\s*/, '').trim();
    } else if (title || bodyLines.length) {
      bodyLines.push(stripped);
    } else if (bodyLines.length === 0) {
      title = stripped.slice(0, 80);
    }
  }

  const body = bodyLines.join('\n').slice(0, 500);
  const hashtags = md.match(/#(\w+)/g);
  const tags = hashtags ? hashtags.slice(0, 5).map(t => t.slice(1)).join(',') : '';

  return {
    title: title.trim().slice(0, 100) || '（无标题）',
    body: body || md.slice(0, 500),
    tags,
    source_url: url,
    platform: detectPlatform(url)
  };
}

function parseHTML(html, url) {
  const $ = cheerio.load(html);
  let title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
  let body = $('meta[property="og:description"]').attr('content') || '';
  if (!body) {
    body = $('article, main, [class*="content"], [class*="article"], [class*="text"], [class*="desc"]')
      .first().text().slice(0, 500) || $('body').text().slice(0, 500);
  }
  const tags = $('meta[name="keywords"]').attr('content') || '';

  return {
    title: title.trim().slice(0, 100) || '（无标题）',
    body: body.trim().slice(0, 500),
    tags,
    source_url: url,
    platform: detectPlatform(url)
  };
}

async function extractFromUrl(rawInput) {
  const urls = rawInput.match(/https?:\/\/[^\s]+/g);
  if (!urls || urls.length === 0) throw new Error('未在输入中找到有效链接，请确认已复制完整分享内容');
  const url = urls[0];
  const platform = detectPlatform(url);

  // Strategy 1: Douyin SSR JSON
  if (platform === 'douyin') {
    try { return await extractDouyin(url); } catch (e) { /* fall through */ }
  }

  // Strategy 2: Jina AI
  try { return await extractViaJina(url); } catch (e) { /* fall through */ }

  // Strategy 3: Direct HTTP + HTML parse
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': DESKTOP_UA }, redirect: 'follow' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return parseHTML(await resp.text(), url);
  } catch (e) {
    throw new Error(`提取失败：${e.message}`);
  }
}

module.exports = { extractFromUrl, detectPlatform };
