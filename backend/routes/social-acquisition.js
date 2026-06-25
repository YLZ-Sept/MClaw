// 社媒拓客 — 关键词搜索 + 评论抓取 + 词云分析 + AI回复草稿
const { Router } = require('express');
const db = require('../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { wordFreq } = require('../services/wordcloud');
const { extract: mcExtract, detailExtractFromUrl } = require('../services/media-crawler');

const router = Router();

const MC_DIR = path.join(__dirname, '..', 'media-crawler');
const BROWSER_DATA_DIR = path.join(MC_DIR, 'browser_data');
const PLATFORM_DIR_MAP = {
  xiaohongshu: 'xhs_user_data_dir', xhs: 'xhs_user_data_dir',
  douyin: 'dy_user_data_dir', dy: 'dy_user_data_dir',
  kuaishou: 'ks_user_data_dir', ks: 'ks_user_data_dir',
  bilibili: 'bili_user_data_dir', bili: 'bili_user_data_dir',
  weibo: 'wb_user_data_dir', wb: 'wb_user_data_dir',
  zhihu: 'zhihu_user_data_dir',
  tieba: 'tieba_user_data_dir',
};

// 从 MediaCrawler 原始 JSON 文件中提取评论
// MediaCrawler 将帖子和评论存在分开的 JSON 文件中：
//   data/<platform>/json/<crawler_type>_contents_DATE.json — 帖子数据
//   data/<platform>/json/<crawler_type>_comments_DATE.json — 评论数据
function extractCommentsFromRaw(platform) {
  const mcPlatform = { xiaohongshu: 'xhs', douyin: 'dy', kuaishou: 'ks', bilibili: 'bili', weibo: 'wb', zhihu: 'zhihu', tieba: 'tieba' }[platform] || platform;
  const platformDir = { xhs: 'xhs', dy: 'douyin', ks: 'kuaishou', bili: 'bilibili', wb: 'weibo', zhihu: 'zhihu', tieba: 'tieba' }[mcPlatform] || mcPlatform;
  const basePath = path.join(__dirname, '..', 'media-crawler', 'data', platformDir);
  const scanDirs = [path.join(basePath, 'json'), basePath];

  const commentItems = []; // raw comment objects from comment files
  const postMap = new Map(); // aweme_id → post metadata

  for (const scanDir of scanDirs) {
    if (!fs.existsSync(scanDir)) continue;
    for (const f of fs.readdirSync(scanDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const content = JSON.parse(fs.readFileSync(path.join(scanDir, f), 'utf8'));
        const items = Array.isArray(content) ? content : [content];
        const isCommentsFile = f.includes('_comments_');
        const isContentsFile = f.includes('_contents_');

        for (const item of items) {
          if (isCommentsFile) {
            commentItems.push(item);
          } else if (isContentsFile) {
            const pid = item.aweme_id || item.note_id || '';
            if (pid) postMap.set(pid, item);
          } else {
            // Fallback: detect by fields
            if (item.comment_id) {
              commentItems.push(item);
            } else {
              const pid = item.aweme_id || item.note_id || '';
              if (pid) postMap.set(pid, item);
            }
          }
        }
      } catch {}
    }
  }

  // Build output: match comments to posts by aweme_id
  const comments = [];
  for (const c of commentItems) {
    const awemeId = c.aweme_id || '';
    const post = postMap.get(awemeId) || {};
    comments.push({
      post_title: (post.title || post.desc || post.note_title || '').slice(0, 200),
      post_url: post.share_url || post.share_link || post.short_link || post.aweme_url || post.url || '',
      post_author: (post.nickname || post.author?.nickname || post.owner?.name || post.user?.nickname || ''),
      post_body: (post.desc || post.content || post.text || '').slice(0, 500),
      post_likes: post.liked_count || post.digg_count || (post.stat?.like) || post.attitudes_count || post.voteup_count || 0,
      post_comments_count: post.comment_count || post.comments || (post.stat?.reply) || post.comments_count || 0,
      comment_content: (c.content || c.text || c.comment || '').slice(0, 1000),
      comment_author: c.nickname || c.user_name || c.author || (c.user?.nickname) || '',
      comment_likes: c.like_count || c.liked_count || c.likes || c.digg_count || 0,
      comment_time: c.create_time || c.created_at || c.time || c.created_time || '',
      raw_json: JSON.stringify(c).slice(0, 4000),
    });
  }

  // If no comments found via two-file model, try legacy single-file model (comments nested in posts)
  if (comments.length === 0) {
    for (const scanDir of scanDirs) {
      if (!fs.existsSync(scanDir)) continue;
      for (const f of fs.readdirSync(scanDir)) {
        if (!f.endsWith('.json')) continue;
        try {
          const content = JSON.parse(fs.readFileSync(path.join(scanDir, f), 'utf8'));
          const items = Array.isArray(content) ? content : [content];
          for (const item of items) {
            const postTitle = item.title || item.desc || item.note_title || '';
            const postUrl = item.share_url || item.share_link || item.short_link || item.url || item.scheme || '';
            const postAuthor = (item.user?.nickname || item.author?.nickname || item.owner?.name || item.user?.screen_name || item.author?.name || '');
            const postBody = item.desc || item.content || item.text || item.description || item.excerpt || '';
            const postLikes = item.liked_count || item.digg_count || (item.stat?.like) || item.attitudes_count || item.voteup_count || 0;
            const postCommentsCount = item.comment_count || item.comments || (item.stat?.reply) || item.comments_count || 0;
            const rawComments = item.comments || [];
            for (const c of rawComments) {
              comments.push({
                post_title: postTitle.slice(0, 200),
                post_url: postUrl,
                post_author: postAuthor,
                post_body: postBody.slice(0, 500),
                post_likes: postLikes,
                post_comments_count: postCommentsCount,
                comment_content: (c.content || c.text || c.comment || '').slice(0, 1000),
                comment_author: c.user?.nickname || c.author || c.user_name || c.nickname || '',
                comment_likes: c.liked_count || c.likes || c.like_count || c.digg_count || 0,
                comment_time: c.create_time || c.created_at || c.time || c.created_time || '',
                raw_json: JSON.stringify(c).slice(0, 4000),
              });
            }
          }
        } catch {}
      }
    }
  }

  return comments;
}

// POST /search — 创建搜索任务，异步执行
router.post('/search', async (req, res) => {
  try {
    const { platform, keyword, name, limit = 10, publish_time = '0' } = req.body;
    if (!platform || !keyword) {
      return res.status(400).json({ code: 400, message: 'platform 和 keyword 必填' });
    }
    const id = crypto.randomUUID();
    const taskName = name || `${keyword} (${platform})`;

    db.prepare(`INSERT INTO social_tasks (id, name, platform, keyword, status)
      VALUES (?,?,?,?,'running')`).run(id, taskName, platform, keyword);

    res.json({ code: 200, data: { id, name: taskName, status: 'running' } });

    // 异步执行爬取
    runCrawlTask(id, platform, keyword, limit, publish_time).catch(err => {
      console.error('[social-acquisition] task error:', err.message);
      db.prepare(`UPDATE social_tasks SET status='failed', error_msg=?, updated_at=datetime('now','localtime') WHERE id=?`)
        .run(err.message.slice(0, 500), id);
    });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

async function runCrawlTask(taskId, platform, keyword, limit, publishTime) {
  console.log('[runCrawlTask] 开始爬取 taskId:', taskId, 'platform:', platform, 'limit:', limit, 'publishTime:', publishTime);
  console.log('[runCrawlTask] keyword hex:', Buffer.from(keyword, 'utf8').toString('hex'));
  console.log('[runCrawlTask] keyword chars:', [...keyword].map(c => c.codePointAt(0).toString(16)).join(' '));
  // 执行爬取
  const result = await mcExtract({ platform, keyword, limit, loginType: 'qrcode', publishTime });
  console.log('[runCrawlTask] mcExtract 返回 results:', result?.results?.length, 'raw_output:', (result?.raw_output || '').slice(-200));

  // 提取评论
  const comments = extractCommentsFromRaw(platform);

  // 保存评论到 DB
  const insertCmt = db.prepare(`INSERT INTO social_comments
    (id, task_id, post_title, post_url, comment_content, comment_author, comment_likes, comment_time, post_author, post_body, post_likes, post_comments_count, raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const insertMany = db.transaction((cmts) => {
    for (const c of cmts) {
      insertCmt.run(crypto.randomUUID(), taskId,
        c.post_title, c.post_url, c.comment_content, c.comment_author,
        c.comment_likes, c.comment_time, c.post_author, c.post_body,
        c.post_likes, c.post_comments_count, c.raw_json);
    }
  });

  if (comments.length > 0) {
    insertMany(comments);
  }

  // 更新任务状态
  db.prepare(`UPDATE social_tasks SET status='done', total_posts=?, total_comments=?, updated_at=datetime('now','localtime') WHERE id=?`)
    .run(result.results?.length || 0, comments.length, taskId);
}

// GET /tasks — 任务列表
router.get('/tasks', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM social_tasks ORDER BY created_at DESC LIMIT 50').all();
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// GET /tasks/:id — 任务详情
router.get('/tasks/:id', (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM social_tasks WHERE id=?').get(req.params.id);
    if (!task) return res.status(404).json({ code: 404, message: '任务不存在' });
    const commentCount = db.prepare('SELECT COUNT(*) as c FROM social_comments WHERE task_id=?').get(req.params.id);
    res.json({ code: 200, data: { ...task, total_comments: commentCount?.c || task.total_comments } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// GET /tasks/:id/comments — 分页评论（支持 location 后过滤）
router.get('/tasks/:id/comments', (req, res) => {
  try {
    const { page = 1, pageSize = 30, sort = 'comment_likes', location } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    const limit = Number(pageSize);
    const orderBy = sort === 'time' ? 'comment_time DESC' : 'comment_likes DESC';

    let sql, params;
    if (location) {
      // 从 raw_json 中 LIKE 匹配 ip_location
      sql = `SELECT * FROM social_comments WHERE task_id=? AND raw_json LIKE ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      params = [req.params.id, `%"ip_location":"%${location}%"%`, limit, offset];
    } else {
      sql = `SELECT * FROM social_comments WHERE task_id=? ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
      params = [req.params.id, limit, offset];
    }
    const comments = db.prepare(sql).all(...params);

    let total;
    if (location) {
      total = db.prepare('SELECT COUNT(*) as c FROM social_comments WHERE task_id=? AND raw_json LIKE ?').get(req.params.id, `%"ip_location":"%${location}%"%`);
    } else {
      total = db.prepare('SELECT COUNT(*) as c FROM social_comments WHERE task_id=?').get(req.params.id);
    }
    res.json({ code: 200, data: { list: comments, total: total?.c || 0 } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// GET /tasks/:id/wordcloud — 词云数据
router.get('/tasks/:id/wordcloud', (req, res) => {
  try {
    const comments = db.prepare('SELECT comment_content FROM social_comments WHERE task_id=?').all(req.params.id);
    const texts = comments.map(c => c.comment_content).filter(Boolean);
    const freq = wordFreq(texts);
    res.json({ code: 200, data: freq });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// DELETE /tasks/:id — 删除任务及关联评论
router.delete('/tasks/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM social_comments WHERE task_id=?').run(req.params.id);
    db.prepare('DELETE FROM social_replies WHERE comment_id IN (SELECT id FROM social_comments WHERE task_id=?)').run(req.params.id);
    db.prepare('DELETE FROM social_tasks WHERE id=?').run(req.params.id);
    res.json({ code: 200, message: '已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// DELETE /comments/:id — 删除单条评论及关联回复
router.delete('/comments/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM social_replies WHERE comment_id=?').run(req.params.id);
    db.prepare('DELETE FROM social_comments WHERE id=?').run(req.params.id);
    res.json({ code: 200, message: '已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// POST /replies/generate — AI 生成回复草稿
router.post('/replies/generate', async (req, res) => {
  try {
    const { comment_ids, max = 20 } = req.body;
    if (!comment_ids || !comment_ids.length) {
      return res.status(400).json({ code: 400, message: '请选择评论' });
    }

    const selected = comment_ids.slice(0, max);
    const comments = db.prepare(`SELECT * FROM social_comments WHERE id IN (${selected.map(() => '?').join(',')})`).all(...selected);
    if (comments.length === 0) {
      return res.status(404).json({ code: 404, message: '无匹配评论' });
    }

    // 调用活跃模型生成回复
    const { getActiveConfig } = require('../routes/model-configs');
    const modelConfig = getActiveConfig();
    if (!modelConfig) {
      return res.status(500).json({ code: 500, message: '未配置活跃模型' });
    }

    const replies = [];
    const insertReply = db.prepare('INSERT INTO social_replies (id, comment_id, content) VALUES (?,?,?)');

    for (const c of comments) {
      try {
        const prompt = `你是一个专业的社交媒体运营专家。以下是一条${c.post_author ? '来自用户"' + c.post_author + '"的' : ''}帖子下的评论，你需要生成一条专业、有亲和力的回复。

帖子标题：${c.post_title || '无'}
帖子内容：${c.post_body?.slice(0, 300) || '无'}

评论者：${c.comment_author || '匿名'}
评论内容：${c.comment_content}

请根据评论内容生成一条回复，要求：
1. 语气友好专业，不要像广告
2. 如果评论表达了需求或疑问，提供有价值的信息
3. 自然引导对方了解我们的服务或产品
4. 不超过150字
5. 只输出回复内容，不要加"回复："等前缀`;

        const apiUrl = modelConfig.api_base?.replace(/\/+$/, '') + '/chat/completions';
        const apiRes = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${modelConfig.api_key}` },
          body: JSON.stringify({
            model: modelConfig.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.8,
          }),
        });

        if (!apiRes.ok) throw new Error(`LLM API ${apiRes.status}`);
        const json = await apiRes.json();
        const replyContent = json.choices?.[0]?.message?.content?.trim() || '';

        if (replyContent) {
          const replyId = crypto.randomUUID();
          insertReply.run(replyId, c.id, replyContent);
          replies.push({
            id: replyId,
            comment_id: c.id,
            comment_content: c.comment_content?.slice(0, 100),
            comment_author: c.comment_author,
            post_title: c.post_title,
            content: replyContent,
            status: 'draft',
          });
        }
      } catch (inner) {
        console.error('[social-acquisition] AI generate error for comment', c.id, inner.message);
      }
    }

    res.json({ code: 200, data: { generated: replies.length, replies } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// PUT /replies/:id — 更新草稿
router.put('/replies/:id', (req, res) => {
  try {
    const { content, status } = req.body;
    const existing = db.prepare('SELECT * FROM social_replies WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ code: 404, message: '草稿不存在' });

    const updates = [];
    const params = [];
    if (content !== undefined) { updates.push('content=?'); params.push(content); }
    if (status) { updates.push('status=?'); params.push(status); }
    if (status === 'approved' || status === 'rejected') {
      updates.push("reviewed_at=datetime('now','localtime')");
    }
    params.push(req.params.id);
    if (updates.length > 0) {
      db.prepare(`UPDATE social_replies SET ${updates.join(',')} WHERE id=?`).run(...params);
    }
    res.json({ code: 200, message: '已更新' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// POST /replies/:id/send — 发布已批准的回复到平台（多平台支持）
router.post('/replies/:id/send', async (req, res) => {
  try {
    const reply = db.prepare(`
      SELECT r.*, c.raw_json, c.post_url, c.comment_content, t.platform
      FROM social_replies r
      JOIN social_comments c ON r.comment_id = c.id
      LEFT JOIN social_tasks t ON c.task_id = t.id
      WHERE r.id = ?
    `).get(req.params.id);
    if (!reply) return res.status(404).json({ code: 404, message: '回复不存在' });

    if (reply.status !== 'approved') {
      return res.status(400).json({ code: 400, message: '只有已批准的回复才能发布' });
    }

    // 优先从 task 表取 platform，监控评论则从 URL 推断
    const platform = reply.platform || inferPlatformFromUrl(reply.post_url) || 'douyin';

    // 从 raw_json / post_url 中提取帖子 ID
    let postId = '';
    try {
      const raw = JSON.parse(reply.raw_json || '{}');
      postId = raw.aweme_id || raw.note_id || raw.photo_id || raw.video_id || '';
    } catch {}
    if (!postId && reply.post_url) {
      postId = extractPostIdFromUrl(reply.post_url, platform);
    }

    if (!postId) {
      return res.status(400).json({ code: 400, message: `无法从帖子链接中提取 ${platform} 内容 ID` });
    }

    // 异步发布
    res.json({ code: 200, message: `正在发布回复到 ${platform}...` });

    try {
      const { postComment } = require('../services/media-crawler');
      const result = await postComment(platform, postId, reply.content);
      console.log('[send-reply] 发布结果:', JSON.stringify(result).slice(0, 300));
      db.prepare(`UPDATE social_replies SET status='sent', reviewed_at=datetime('now','localtime') WHERE id=?`).run(reply.id);
    } catch (e) {
      console.error('[send-reply] 发布失败:', e.message);
      db.prepare(`UPDATE social_replies SET status='send_failed' WHERE id=?`).run(reply.id);
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ code: 500, message: err.message });
    }
  }
});

// 从平台帖子 URL 中提取内容 ID
function extractPostIdFromUrl(url, platform) {
  switch (platform) {
    case 'douyin': case 'dy':
      return url.match(/video\/(\d+)/)?.[1] || '';
    case 'xiaohongshu': case 'xhs':
      return url.match(/explore\/([a-zA-Z0-9]+)/)?.[1] || '';
    case 'kuaishou': case 'ks':
      return url.match(/short-video\/(\w+)/)?.[1] || url.match(/photo\/(\w+)/)?.[1] || '';
    case 'bilibili': case 'bili':
      return url.match(/video\/(BV\w+)/)?.[1] || '';
    case 'weibo': case 'wb':
      return url.match(/\/(\d{16})/)?.[1] || '';
    default:
      return '';
  }
}

// 从 URL 域名推断平台
function inferPlatformFromUrl(url) {
  if (!url) return '';
  const domainMap = {
    'douyin.com': 'douyin',
    'xiaohongshu.com': 'xiaohongshu',
    'xhs.com': 'xiaohongshu',
    'kuaishou.com': 'kuaishou',
    'bilibili.com': 'bilibili',
    'weibo.com': 'weibo',
    'zhihu.com': 'zhihu',
    'tieba.baidu.com': 'tieba',
  };
  for (const [domain, platform] of Object.entries(domainMap)) {
    if (url.includes(domain)) return platform;
  }
  return '';
}

// DELETE /replies/:id — 删除回复草稿
router.delete('/replies/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM social_replies WHERE id=?').run(req.params.id);
    res.json({ code: 200, message: '已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// GET /replies — 草稿列表
router.get('/replies', (req, res) => {
  try {
    const { status, page = 1, pageSize = 20 } = req.query;
    let sql = `SELECT r.*, c.comment_content, c.comment_author, c.post_title, c.post_url
               FROM social_replies r LEFT JOIN social_comments c ON r.comment_id = c.id`;
    const params = [];
    if (status) {
      sql += ' WHERE r.status=?';
      params.push(status);
    }
    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    const offset = (Number(page) - 1) * Number(pageSize);
    params.push(Number(pageSize), offset);
    const list = db.prepare(sql).all(...params);
    const countRow = db.prepare(`SELECT COUNT(*) as c FROM social_replies${status ? ' WHERE status=?' : ''}`).get(...(status ? [status] : []));
    res.json({ code: 200, data: { list, total: countRow?.c || 0 } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// POST /switch-account — 清除平台登录状态
router.post('/switch-account', (req, res) => {
  try {
    const { platform } = req.body;
    if (!platform) return res.status(400).json({ code: 400, message: 'platform 必填' });

    const dirName = PLATFORM_DIR_MAP[platform] || `${platform}_user_data_dir`;
    const targetDir = path.join(BROWSER_DATA_DIR, dirName);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    res.json({ code: 200, message: `已清除 ${platform} 登录状态，下次搜索将需要重新扫码` });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// GET /account-status — 检查平台是否有缓存的登录态
router.get('/account-status', (req, res) => {
  try {
    const status = {};
    for (const [platform, dirName] of Object.entries(PLATFORM_DIR_MAP)) {
      const targetDir = path.join(BROWSER_DATA_DIR, dirName);
      status[platform] = fs.existsSync(targetDir);
    }
    res.json({ code: 200, data: status });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// ── 自动回复：监控自己帖子 ──

// POST /monitors — 添加要监控的帖子
router.post('/monitors', (req, res) => {
  try {
    const { platform, post_url, name, reply_prompt, trigger_keywords, check_interval } = req.body;
    if (!platform || !post_url) {
      return res.status(400).json({ code: 400, message: 'platform 和 post_url 必填' });
    }
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO social_monitors (id, platform, post_url, name, reply_prompt, trigger_keywords, check_interval)
      VALUES (?,?,?,?,?,?,?)`).run(id, platform, post_url, name || post_url.slice(0, 50), reply_prompt || '', trigger_keywords || '', check_interval || 900);
    res.json({ code: 200, data: { id } });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// GET /monitors — 监控列表
router.get('/monitors', (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM social_monitors ORDER BY created_at DESC').all();
    res.json({ code: 200, data: list });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// PUT /monitors/:id — 更新监控（启用/禁用/修改关键词等）
router.put('/monitors/:id', (req, res) => {
  try {
    const { name, reply_prompt, trigger_keywords, enabled, check_interval } = req.body;
    const existing = db.prepare('SELECT * FROM social_monitors WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ code: 404, message: '不存在' });

    const fields = []; const params = [];
    if (name !== undefined) { fields.push('name=?'); params.push(name); }
    if (reply_prompt !== undefined) { fields.push('reply_prompt=?'); params.push(reply_prompt); }
    if (trigger_keywords !== undefined) { fields.push('trigger_keywords=?'); params.push(trigger_keywords); }
    if (enabled !== undefined) { fields.push('enabled=?'); params.push(enabled ? 1 : 0); }
    if (check_interval !== undefined) { fields.push('check_interval=?'); params.push(check_interval); }
    if (fields.length) {
      params.push(req.params.id);
      db.prepare(`UPDATE social_monitors SET ${fields.join(',')} WHERE id=?`).run(...params);
    }
    res.json({ code: 200, message: '已更新' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// DELETE /monitors/:id — 删除监控
router.delete('/monitors/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM social_monitors WHERE id=?').run(req.params.id);
    res.json({ code: 200, message: '已删除' });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// POST /monitors/:id/check — 手动检查单个帖子的新评论
router.post('/monitors/:id/check', async (req, res) => {
  try {
    const monitor = db.prepare('SELECT * FROM social_monitors WHERE id=?').get(req.params.id);
    if (!monitor) return res.status(404).json({ code: 404, message: '监控不存在' });

    res.json({ code: 200, message: '检查已触发' });
    await checkMonitor(monitor);
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// POST /monitors/check-all — 检查所有启用的监控
router.post('/monitors/check-all', async (req, res) => {
  try {
    const monitors = db.prepare('SELECT * FROM social_monitors WHERE enabled=1').all();
    res.json({ code: 200, message: `已触发 ${monitors.length} 个监控检查` });
    for (const m of monitors) {
      try { await checkMonitor(m); } catch (e) { console.error('[auto-reply] check error:', m.id, e.message); }
    }
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 检查单个监控帖子的新评论并自动生成回复
async function checkMonitor(monitor) {
  console.log('[auto-reply] ===== checkMonitor 开始 =====');
  console.log('[auto-reply] monitor:', JSON.stringify({ platform: monitor.platform, post_url: monitor.post_url, trigger_keywords: monitor.trigger_keywords }));
  const { getActiveConfig } = require('../routes/model-configs');
  const modelConfig = getActiveConfig();
  if (!modelConfig) { console.error('[auto-reply] 无活跃模型配置'); return; }
  console.log('[auto-reply] 模型:', modelConfig.model);

  // 1. 爬取帖子的最新评论（使用 detail 模式）
  let newComments = [];
  try {
    const mcResult = await detailExtractFromUrl({
      url: monitor.post_url,
      platform: monitor.platform,
      loginType: 'qrcode',
    });
    console.log('[auto-reply] detailExtractFromUrl 完成, results:', mcResult?.results?.length || 0);
    if (mcResult?.results?.[0]) {
      console.log('[auto-reply] results preview:', JSON.stringify(mcResult.results[0]).slice(0, 300));
    }

    newComments = extractCommentsFromRaw(monitor.platform);
    console.log('[auto-reply] extractCommentsFromRaw 提取到评论数:', newComments.length);
    if (newComments.length > 0) {
      console.log('[auto-reply] 第一条评论:', JSON.stringify(newComments[0]).slice(0, 300));
    }
  } catch (e) {
    console.error('[auto-reply] crawl error:', e.message);
    return;
  }

  if (!newComments.length) {
    console.log('[auto-reply] 没有提取到任何评论，结束');
    db.prepare(`UPDATE social_monitors SET last_checked_at=datetime('now','localtime') WHERE id=?`).run(monitor.id);
    return;
  }

  // 2. 筛选新评论（对比已有记录，包含搜索任务和监控产生的评论）
  const existingContents = new Set(
    db.prepare(`SELECT comment_content FROM social_comments WHERE post_url=? AND (
      task_id IN (SELECT id FROM social_tasks) OR task_id LIKE 'monitor-%'
    )`).all(monitor.post_url).map(r => r.comment_content?.slice(0, 50))
  );
  console.log('[auto-reply] 已有评论数:', existingContents.size);
  const fresh = newComments.filter(c => !existingContents.has(c.comment_content?.slice(0, 50)));
  console.log('[auto-reply] 新评论数:', fresh.length);

  if (!fresh.length) {
    console.log('[auto-reply] 无新评论，结束');
    db.prepare(`UPDATE social_monitors SET last_checked_at=datetime('now','localtime') WHERE id=?`).run(monitor.id);
    return;
  }

  // 3. 关键词过滤
  const keywords = monitor.trigger_keywords ? monitor.trigger_keywords.split(',').map(k => k.trim()).filter(Boolean) : [];
  const matched = keywords.length
    ? fresh.filter(c => keywords.some(k => c.comment_content.includes(k)))
    : fresh;

  if (!matched.length) {
    db.prepare(`UPDATE social_monitors SET last_checked_at=datetime('now','localtime') WHERE id=?`).run(monitor.id);
    return;
  }

  // 4. AI 生成回复
  const insertReply = db.prepare('INSERT INTO social_replies (id, comment_id, content, status) VALUES (?,?,?,?)');
  const insertCmt = db.prepare(`INSERT INTO social_comments
    (id, task_id, post_title, post_url, comment_content, comment_author, comment_likes, comment_time, post_author, post_body, post_likes, post_comments_count, raw_json)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  let replied = 0;
  const taskId = 'monitor-' + monitor.id;
  for (const c of matched) {
    try {
      const prompt = `你是品牌社媒运营。${monitor.reply_prompt ? '品牌背景：' + monitor.reply_prompt : ''}

帖子内容：${c.post_body?.slice(0, 300) || '无'}
用户评论：${c.comment_content}
评论者：${c.comment_author || '匿名'}

请生成一条自然友好的回复，要求：
1. 像真人互动，不模板化
2. 适当引导用户了解产品或服务
3. 不超过150字
4. 只输出回复文本，不要加前缀`;

      const apiUrl = modelConfig.api_base?.replace(/\/+$/, '') + '/chat/completions';
      const apiRes = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${modelConfig.api_key}` },
        body: JSON.stringify({
          model: modelConfig.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.8,
        }),
      });

      if (!apiRes.ok) throw new Error(`API ${apiRes.status}`);
      const json = await apiRes.json();
      const replyContent = json.choices?.[0]?.message?.content?.trim() || '';

      if (replyContent) {
        const commentId = crypto.randomUUID();
        insertCmt.run(commentId, taskId,
          c.post_title, c.post_url, c.comment_content, c.comment_author,
          c.comment_likes, c.comment_time, c.post_author, c.post_body,
          c.post_likes, c.post_comments_count, c.raw_json || '');
        insertReply.run(crypto.randomUUID(), commentId, replyContent, 'draft');
        replied++;
      }
    } catch (inner) {
      console.error('[auto-reply] gen error:', inner.message);
    }
  }

  db.prepare(`UPDATE social_monitors SET last_checked_at=datetime('now','localtime'), total_replied=total_replied+? WHERE id=?`)
    .run(replied, monitor.id);
}

module.exports = router;
