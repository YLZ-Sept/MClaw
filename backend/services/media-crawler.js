// MediaCrawler Node.js wrapper — calls Python crawler for multi-platform extraction
const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const MC_DIR = path.join(__dirname, '..', 'media-crawler');
const CONFIG_FILE = path.join(MC_DIR, 'config', 'base_config.py');
const DATA_DIR = path.join(MC_DIR, 'data');

// Platform mapping: frontend name → MediaCrawler internal name
const PLATFORM_MAP = {
  xiaohongshu: 'xhs',
  douyin: 'dy',
  bilibili: 'bili',
  kuaishou: 'ks',
  weibo: 'wb',
  zhihu: 'zhihu',
  tieba: 'tieba',
  xhs: 'xhs',
  dy: 'dy',
};

async function extract({ platform, keyword, limit = 10, loginType = 'qrcode' }) {
  const mcPlatform = PLATFORM_MAP[platform] || platform;
  if (!mcPlatform) throw new Error(`不支持的平台: ${platform}`);

  // 1. Patch config — only override specific keys, keep the rest intact
  const backupPath = CONFIG_FILE + '.bak';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(CONFIG_FILE, backupPath);
  }
  let configContent = fs.readFileSync(CONFIG_FILE, 'utf8');

  const patches = {
    PLATFORM: `"${mcPlatform}"`,
    KEYWORDS: `"${keyword}"`,
    LOGIN_TYPE: `"${loginType}"`,
    COOKIES: '""',
    SORT_TYPE: `"popularity_descending"`,
    PUBLISH_TIME_TYPE: '0',
    CRAWLER_TYPE: `"search"`,
    ENABLE_IP_PROXY: 'False',
    CRAWLER_MAX_NOTES_COUNT: String(limit),
    ENABLE_GET_COMMENTS: 'True',
    ENABLE_GET_SUB_COMMENTS: 'False',
    CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES: '10',
    SAVE_DATA_OPTION: `"json"`,
    SAVE_LOGIN_STATE: 'False',
    HEADLESS: 'False',
  };

  for (const [key, val] of Object.entries(patches)) {
    // Skip CRAWLER_TYPE — it's multi-line with parens in comment, default is already "search"
    if (key === 'CRAWLER_TYPE') continue;
    const re = new RegExp(`^(${key}\\s*=\\s*).*`, 'm');
    if (re.test(configContent)) {
      configContent = configContent.replace(re, `$1${val}`);
    } else {
      configContent += `\n${key} = ${val}`;
    }
  }

  fs.writeFileSync(CONFIG_FILE, configContent, 'utf8');

  try {
    // 2. Run MediaCrawler
    const dataPath = path.join(DATA_DIR, mcPlatform);
    // Clear old data
    if (fs.existsSync(dataPath)) {
      for (const f of fs.readdirSync(dataPath)) {
        if (f.endsWith('.json') || f.endsWith('.csv')) fs.unlinkSync(path.join(dataPath, f));
      }
    }

    const result = await new Promise((resolve, reject) => {
      const python = process.platform === 'win32' ? 'python' : 'python3';
      const child = execFile(python, ['main.py'], {
        cwd: MC_DIR,
        timeout: 300000,
        windowsHide: false,
        maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        if (err && err.killed) {
          reject(new Error('爬取超时（5分钟），浏览器窗口是否已弹出？请确认已扫码登录'));
          return;
        }
        if (err) {
          // MediaCrawler sometimes exits non-zero even on success
          const output = stdout + stderr;
          if (output.includes('Error') && !output.includes('success')) {
            reject(new Error(stderr?.slice(-500) || err.message));
            return;
          }
        }
        resolve(stdout + stderr);
      });
    });

    // 3. Parse output data
    const results = [];
    if (fs.existsSync(dataPath)) {
      for (const f of fs.readdirSync(dataPath)) {
        if (f.endsWith('.json')) {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(dataPath, f), 'utf8'));
            if (Array.isArray(content)) {
              for (const item of content) {
                results.push(normalizeItem(item, mcPlatform));
              }
            } else if (content && typeof content === 'object') {
              results.push(normalizeItem(content, mcPlatform));
            }
          } catch {}
        }
      }
    }

    return { platform: mcPlatform, keyword, results, raw_output: result.slice(-500) };
  } finally {
    // Restore original config (keep backup for next run)
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, CONFIG_FILE);
    }
  }
}

// Normalize different platform output to unified format
function normalizeItem(item, platform) {
  switch (platform) {
    case 'xhs':
      return {
        title: item.title || item.note_title || '',
        body: item.desc || item.content || '',
        tags: (item.tag_list || []).map(t => typeof t === 'string' ? t : t.name).join(','),
        author: item.user?.nickname || item.author || '',
        likes: item.liked_count || item.likes || 0,
        comments_count: item.comment_count || item.comments || 0,
        source_url: item.share_link || item.note_url || '',
        platform: 'xiaohongshu',
      };
    case 'dy':
      return {
        title: item.desc || item.title || '',
        body: item.desc || '',
        tags: item.hashtag_names || '',
        author: item.author?.nickname || item.nickname || '',
        likes: item.digg_count || 0,
        comments_count: item.comment_count || 0,
        source_url: item.share_url || '',
        platform: 'douyin',
      };
    case 'bili':
      return {
        title: item.title || '',
        body: item.desc || item.description || '',
        tags: (item.tags || []).join(','),
        author: item.owner?.name || item.author || '',
        likes: item.stat?.like || 0,
        comments_count: item.stat?.reply || 0,
        source_url: item.short_link || '',
        platform: 'bilibili',
      };
    case 'wb':
      return {
        title: (item.text || '').slice(0, 60),
        body: item.text || '',
        tags: '',
        author: item.user?.screen_name || '',
        likes: item.attitudes_count || 0,
        comments_count: item.comments_count || 0,
        source_url: item.scheme || '',
        platform: 'weibo',
      };
    case 'zhihu':
      return {
        title: item.title || '',
        body: item.content || item.excerpt || '',
        tags: (item.tags || []).map(t => t.name || t).join(','),
        author: item.author?.name || '',
        likes: item.voteup_count || 0,
        comments_count: item.comment_count || 0,
        source_url: item.url || '',
        platform: 'zhihu',
      };
    default:
      return {
        title: item.title || item.desc || '',
        body: item.content || item.desc || item.body || '',
        tags: '',
        author: item.author || item.user?.nickname || '',
        source_url: item.url || item.share_url || '',
        platform,
      };
  }
}

// Quick extract from a single URL using platform-specific detail crawlers
async function extractFromUrl(url, platform) {
  // Extract content ID from URL patterns
  let contentId = '';
  switch (platform) {
    case 'xiaohongshu': case 'xhs':
      contentId = url.match(/explore\/([a-zA-Z0-9]+)/)?.[1] || url.match(/note[-_]id[=:](\w+)/)?.[1] || '';
      break;
    case 'douyin': case 'dy':
      contentId = url.match(/video\/(\d+)/)?.[1] || url.match(/note[=:](\d+)/)?.[1] || '';
      break;
    case 'bilibili': case 'bili':
      contentId = url.match(/video\/(BV\w+)/)?.[1] || url.match(/BV(\w+)/)?.[1] || '';
      break;
  }
  if (!contentId) throw new Error(`无法从 URL 中提取内容 ID: ${url}`);

  // For now, use search with the content ID as keyword (detail extraction requires config setup)
  const title = contentId;
  return extract({ platform, keyword: title, limit: 1, loginType: 'qrcode' });
}

module.exports = { extract, extractFromUrl, PLATFORM_MAP };
