// Web Search Plugin — DuckDuckGo Instant Answer API
const https = require('https');

const manifest = {
  name: 'web-search',
  version: '0.2.0',
  description: '网络搜索工具，基于 DuckDuckGo Instant Answer',
  tools: [
    {
      name: 'web_search',
      description: '搜索网络获取最新信息。返回标题、摘要和链接',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
          max_results: { type: 'number', description: '最多返回结果数，默认 5' }
        },
        required: ['query']
      },
      handler: async (args) => {
        const query = encodeURIComponent(args.query || '');
        const maxResults = args.max_results || 5;

        return new Promise((resolve) => {
          const url = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;
          const req = https.get(url, (res) => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
              try {
                const data = JSON.parse(body);
                const results = [];
                if (data.AbstractText) {
                  results.push({
                    title: data.Heading || data.AbstractSource || 'result',
                    snippet: data.AbstractText.slice(0, 500),
                    url: data.AbstractURL || ''
                  });
                }
                if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                  for (const topic of data.RelatedTopics.slice(0, maxResults - results.length)) {
                    if (topic.Text && topic.FirstURL) {
                      results.push({
                        title: topic.Text.split(' - ')[0]?.slice(0, 100) || topic.Text.slice(0, 100),
                        snippet: topic.Text.slice(0, 300),
                        url: topic.FirstURL
                      });
                    }
                  }
                }
                resolve({
                  success: true,
                  query: args.query,
                  total: results.length,
                  results
                });
              } catch (e) {
                resolve({ error: 'parse error: ' + e.message });
              }
            });
          });
          req.setTimeout(15000, () => { req.destroy(); resolve({ error: 'search timeout' }); });
          req.on('error', (e) => { resolve({ error: 'request failed: ' + e.message }); });
        });
      }
    },
    {
      name: 'fetch_webpage',
      description: '获取网页纯文本内容（用于深入阅读搜索结果）',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '网页 URL' }
        },
        required: ['url']
      },
      handler: async (args) => {
        const url = args.url;
        if (!url || !url.startsWith('http')) return { error: '无效 URL' };

        return new Promise((resolve) => {
          const mod = url.startsWith('https') ? https : require('http');
          mod.get(url, { timeout: 15000, headers: { 'User-Agent': 'MClaw/1.0' } }, (res) => {
            // 检查重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              const newUrl = new URL(res.headers.location, url).href;
              return resolve(handler({ ...args, url: newUrl }));
            }
            if (res.statusCode !== 200) {
              return resolve({ error: `HTTP ${res.statusCode}` });
            }

            const contentType = res.headers['content-type'] || '';
            if (!contentType.includes('text/html')) {
              return resolve({ error: `不支持的内容类型: ${contentType}` });
            }

            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
              try {
                // 简单 HTML → 文本提取
                let text = body
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<')
                  .replace(/&gt;/g, '>')
                  .replace(/&quot;/g, '"')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 8000);

                const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
                resolve({
                  success: true,
                  url,
                  title: titleMatch?.[1]?.trim() || '无标题',
                  text
                });
              } catch (e) {
                resolve({ error: '解析失败: ' + e.message });
              }
            });
          }).on('error', (e) => {
            resolve({ error: '请求失败: ' + e.message });
          });
        });
      }
    }
  ]
};

function onLoad() {
  console.log('[web-search] onLoad: DuckDuckGo 搜索插件初始化');
}

module.exports = { manifest, onLoad };
