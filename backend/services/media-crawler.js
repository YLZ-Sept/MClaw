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

// MediaCrawler short code → Python store directory name
const PLATFORM_DIR_MAP = {
  xhs: 'xhs',
  dy: 'douyin',
  bili: 'bilibili',
  ks: 'kuaishou',
  wb: 'weibo',
  zhihu: 'zhihu',
  tieba: 'tieba',
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
    ENABLE_GET_SUB_COMMENTS: 'True',
    CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES: '30',
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
    const platformDir = PLATFORM_DIR_MAP[mcPlatform] || mcPlatform;
    const dataPath = path.join(DATA_DIR, platformDir, 'json');
    // Clear old data (top-level data/dir too for safety)
    const topDataPath = path.join(DATA_DIR, platformDir);
    if (fs.existsSync(topDataPath)) {
      for (const f of fs.readdirSync(topDataPath)) {
        if (f.endsWith('.json') || f.endsWith('.csv')) fs.unlinkSync(path.join(topDataPath, f));
      }
      if (fs.existsSync(dataPath)) {
        for (const f of fs.readdirSync(dataPath)) {
          if (f.endsWith('.json') || f.endsWith('.csv')) fs.unlinkSync(path.join(dataPath, f));
        }
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

    // 3. Parse output data (JSON files under data/<platform>/json/)
    const results = [];
    const scanDirs = [dataPath, topDataPath];
    for (const scanDir of scanDirs) {
      if (!fs.existsSync(scanDir)) continue;
      for (const f of fs.readdirSync(scanDir)) {
        if (f.endsWith('.json')) {
          try {
            const content = JSON.parse(fs.readFileSync(path.join(scanDir, f), 'utf8'));
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

// 解析短链接，跟随重定向获取真实 URL
async function resolveShortUrl(shortUrl) {
  try {
    const http = require('http');
    const https = require('https');
    const u = new URL(shortUrl);
    const mod = u.protocol === 'https:' ? https : http;
    return await new Promise((resolve) => {
      mod.get(shortUrl, { timeout: 10000 }, (res) => {
        // 短链接通常返回 301/302 重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(res.headers.location);
        } else {
          resolve(shortUrl); // 无法解析则返回原 URL
        }
        res.resume();
      }).on('error', () => resolve(shortUrl)).on('timeout', () => { resolve(shortUrl); });
    });
  } catch { return shortUrl; }
}

// Detail extract — crawl a specific post by URL and get comments
async function detailExtractFromUrl({ url, platform, loginType = 'qrcode' }) {
  const mcPlatform = PLATFORM_MAP[platform] || platform;
  if (!mcPlatform) throw new Error(`不支持的平台: ${platform}`);

  // 解析短链接
  let resolvedUrl = url;
  if (url.includes('v.douyin.com') || url.includes('xhslink.com') || url.includes('v.kuaishou.com')) {
    console.log('[detailExtract] 检测到短链接，正在解析...');
    resolvedUrl = await resolveShortUrl(url);
    console.log('[detailExtract] 解析后 URL:', resolvedUrl);
  }

  // Extract post ID from URL
  let postId = '';
  switch (mcPlatform) {
    case 'xhs':
      postId = resolvedUrl.match(/explore\/([a-zA-Z0-9]+)/)?.[1] || '';
      break;
    case 'dy':
      postId = resolvedUrl.match(/video\/(\d+)/)?.[1] || resolvedUrl.match(/note[=:](\d+)/)?.[1] || '';
      break;
    case 'ks':
      postId = resolvedUrl.match(/short-video\/(\w+)/)?.[1] || resolvedUrl.match(/photo\/(\w+)/)?.[1] || '';
      break;
    case 'bili':
      postId = resolvedUrl.match(/video\/(BV\w+)/)?.[1] || resolvedUrl.match(/BV(\w+)/)?.[1] || '';
      break;
    case 'wb':
      postId = resolvedUrl.match(/\/(\d{16})/)?.[1] || '';
      break;
    case 'zhihu':
      postId = resolvedUrl; // 知乎直接用 URL
      break;
    case 'tieba':
      postId = resolvedUrl.match(/p\/(\d+)/)?.[1] || '';
      break;
  }
  if (!postId && mcPlatform !== 'zhihu') throw new Error(`无法从 URL 中提取内容 ID: ${resolvedUrl}`);
  console.log('[detailExtract] platform:', mcPlatform, 'postId:', postId);

  // Patch config for detail crawl
  const backupPath = CONFIG_FILE + '.bak';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(CONFIG_FILE, backupPath);
  }
  let configContent = fs.readFileSync(CONFIG_FILE, 'utf8');

  // Set CRAWLER_TYPE to "detail" — 原为多行格式含行内注释，需匹配到行尾的 )
  configContent = configContent.replace(
    /^CRAWLER_TYPE\s*=\s*\([\s\S]*?\n\s*\)/m,
    'CRAWLER_TYPE = "detail"'
  );

  const patches = {
    PLATFORM: `"${mcPlatform}"`,
    KEYWORDS: '""',
    LOGIN_TYPE: `"${loginType}"`,
    COOKIES: '""',
    ENABLE_GET_COMMENTS: 'True',
    CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES: '30',
    ENABLE_GET_SUB_COMMENTS: 'False',
    SAVE_DATA_OPTION: '"json"',
    SAVE_LOGIN_STATE: 'True',
    HEADLESS: 'False',
    ENABLE_IP_PROXY: 'False',
  };

  for (const [key, val] of Object.entries(patches)) {
    if (key === 'CRAWLER_TYPE') continue;
    const re = new RegExp(`^(${key}\\s*=\\s*).*`, 'm');
    if (re.test(configContent)) {
      configContent = configContent.replace(re, `$1${val}`);
    } else {
      configContent += `\n${key} = ${val}`;
    }
  }

  // Set platform-specific ID list
  const listMap = {
    xhs: 'XHS_SPECIFIED_NOTE_URL_LIST',
    dy: 'DY_SPECIFIED_ID_LIST',
    ks: 'KS_SPECIFIED_ID_LIST',
    bili: 'BILI_SPECIFIED_ID_LIST',
    wb: 'WEIBO_SPECIFIED_ID_LIST',
    tieba: 'TIEBA_SPECIFIED_ID_LIST',
    zhihu: 'ZHIHU_SPECIFIED_ID_LIST',
  };
  const listKey = listMap[mcPlatform];
  if (listKey) {
    const value = mcPlatform === 'zhihu' ? `"${url}"` : `"${postId}"`;
    const re = new RegExp(`^(${listKey}\\s*=\\s*\\[)[^\\]]*\\]`, 'm');
    if (re.test(configContent)) {
      configContent = configContent.replace(re, `$1${value}]`);
    } else {
      configContent += `\n${listKey} = [${value}]`;
    }
  }

  fs.writeFileSync(CONFIG_FILE, configContent, 'utf8');

  try {
    const platformDir = PLATFORM_DIR_MAP[mcPlatform] || mcPlatform;
    const dataPath = path.join(DATA_DIR, platformDir, 'json');
    const topDataPath = path.join(DATA_DIR, platformDir);

    // 清除旧爬取数据
    for (const dir of [topDataPath, dataPath]) {
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir)) {
          if (f.endsWith('.json') || f.endsWith('.csv')) fs.unlinkSync(path.join(dir, f));
        }
      }
    }

    let pythonOutput = '';
    await new Promise((resolve, reject) => {
      const python = process.platform === 'win32' ? 'python' : 'python3';
      const child = execFile(python, ['main.py'], {
        cwd: MC_DIR,
        timeout: 300000,
        windowsHide: false,
        maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        pythonOutput = (stdout || '') + '\n' + (stderr || '');
        console.log('[detailExtract] Python exit, err.code:', err?.code, 'stdout_len:', stdout?.length || 0, 'stderr_len:', stderr?.length || 0);
        if (stderr) console.log('[detailExtract] Python stderr:', stderr.slice(-600));
        if (stdout) console.log('[detailExtract] Python stdout:', stdout.slice(-600));
        if (err && err.killed) {
          reject(new Error('爬取超时（5分钟）'));
          return;
        }
        if (err) {
          const output = (stdout || '') + (stderr || '');
          if (output.includes('Error') && !output.includes('success')) {
            reject(new Error((stderr || err.message).slice(-500)));
            return;
          }
        }
        resolve(stdout + stderr);
      });
    });

    // Parse output data — MediaCrawler stores posts and comments in separate files
    const results = [];
    const scanDirs = [dataPath, topDataPath];
    const allRaw = [];

    for (const scanDir of scanDirs) {
      console.log('[detailExtract] 扫描:', scanDir, 'exists:', fs.existsSync(scanDir));
      if (!fs.existsSync(scanDir)) continue;
      const files = fs.readdirSync(scanDir);
      console.log('[detailExtract] 文件列表:', files);
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        try {
          const filePath = path.join(scanDir, f);
          const raw = fs.readFileSync(filePath, 'utf8');
          console.log('[detailExtract] 读取文件:', f, 'size:', raw.length, 'preview:', raw.slice(0, 200));
          const content = JSON.parse(raw);
          const items = Array.isArray(content) ? content : [content];
          console.log('[detailExtract] items count:', items.length);
          for (const item of items) {
            allRaw.push({ item, fileName: f });
          }
        } catch (e) { console.error('[detailExtract] parse error:', f, e.message); }
      }
    }

    // Separate posts (contents files) from comments (comments files)
    const postMap = new Map();
    for (const { item, fileName } of allRaw) {
      const isCommentsFile = fileName.includes('_comments_');
      const isContentsFile = fileName.includes('_contents_');
      const pid = item.aweme_id || item.note_id || '';

      if (isCommentsFile) {
        // Collect under matching post later
        item._is_comment_item = true;
        item._aweme_id = pid;
        // Temporary storage
        if (!postMap.has('__comments_bucket__')) postMap.set('__comments_bucket__', []);
        postMap.get('__comments_bucket__').push(item);
      } else if (isContentsFile || pid) {
        const n = normalizeItem(item, mcPlatform);
        n._raw_comments = [];
        n._raw_comment_count = 0;
        if (pid) {
          postMap.set(pid, n);
          n._post_id = pid;
        }
        results.push(n);
      } else {
        // Legacy: single-file model with nested comments
        const n = normalizeItem(item, mcPlatform);
        n._raw_comments = item.comments || [];
        n._raw_comment_count = (item.comments || []).length;
        results.push(n);
      }
    }

    // Match comments to posts
    const orphanComments = postMap.get('__comments_bucket__') || [];
    postMap.delete('__comments_bucket__');
    for (const c of orphanComments) {
      const pid = c._aweme_id;
      if (pid && postMap.has(pid)) {
        postMap.get(pid)._raw_comments.push(c);
        postMap.get(pid)._raw_comment_count++;
      } else {
        // Orphan comment: create synthetic result
        const n = normalizeItem(c, mcPlatform);
        n._raw_comments = [c];
        n._raw_comment_count = 1;
        results.push(n);
      }
    }

    console.log('[detailExtract] 最终 results:', results.length, '第一条评论数:', results[0]?._raw_comment_count);
    return { platform: mcPlatform, results };
  } finally {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, CONFIG_FILE);
    }
  }
}

// 发布评论到抖音（需要已登录的 browser_data）
async function postDouyinComment(awemeId, content, loginType = 'qrcode') {
  // Patch config for dy platform
  const backupPath = CONFIG_FILE + '.bak';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(CONFIG_FILE, backupPath);
  }
  let configContent = fs.readFileSync(CONFIG_FILE, 'utf8');

  // Set CRAWLER_TYPE to avoid any conflict (not used by post_comment.py)
  configContent = configContent.replace(
    /^CRAWLER_TYPE\s*=\s*\([\s\S]*?\n\s*\)/m,
    'CRAWLER_TYPE = "detail"'
  );

  const patches = {
    PLATFORM: '"dy"',
    LOGIN_TYPE: `"${loginType}"`,
    COOKIES: '""',
    SAVE_LOGIN_STATE: 'True',
    HEADLESS: 'False',
    ENABLE_IP_PROXY: 'False',
    ENABLE_CDP_MODE: 'False',
  };
  for (const [key, val] of Object.entries(patches)) {
    const re = new RegExp(`^(${key}\\s*=\\s*).*`, 'm');
    if (re.test(configContent)) {
      configContent = configContent.replace(re, `$1${val}`);
    } else {
      configContent += `\n${key} = ${val}`;
    }
  }
  fs.writeFileSync(CONFIG_FILE, configContent, 'utf8');

  try {
    const result = await new Promise((resolve, reject) => {
      const python = process.platform === 'win32' ? 'python' : 'python3';
      const child = execFile(python, ['post_comment.py', awemeId, content], {
        cwd: MC_DIR,
        timeout: 300000,
        windowsHide: false,
        maxBuffer: 1024 * 1024
      }, (err, stdout, stderr) => {
        console.log('[postDouyinComment] stdout:', (stdout || '').slice(-500));
        if (stderr) console.log('[postDouyinComment] stderr:', stderr.slice(-600));
        if (err && err.killed) {
          reject(new Error('发布超时（5分钟）'));
          return;
        }
        if (err) {
          reject(new Error((stderr || err.message).slice(-500)));
          return;
        }
        // Parse result from stdout
        const match = (stdout || '').match(/POST_COMMENT_RESULT:\s*(.+)/);
        if (match) {
          try { resolve(JSON.parse(match[1])); } catch { resolve(match[1]); }
        } else {
          resolve({ raw: stdout });
        }
      });
    });
    return result;
  } finally {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, CONFIG_FILE);
    }
  }
}

module.exports = { extract, extractFromUrl, detailExtractFromUrl, postDouyinComment, PLATFORM_MAP, PLATFORM_DIR_MAP };
