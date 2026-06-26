// 社媒拓客 — 评论监控 + AI回复管理
const { Router } = require('express');
const db = require('../db');
const crypto = require('crypto');

const router = Router();

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
      SELECT r.*, c.raw_json, c.post_url, c.comment_content, c.task_id
      FROM social_replies r
      JOIN social_comments c ON r.comment_id = c.id
      WHERE r.id = ?
    `).get(req.params.id);
    if (!reply) return res.status(404).json({ code: 404, message: '回复不存在' });

    if (reply.status !== 'approved') {
      return res.status(400).json({ code: 400, message: '只有已批准的回复才能发布' });
    }

    // 优先从监控记录取 platform，否则从 URL 推断
    let platform = inferPlatformFromUrl(reply.post_url) || 'douyin';
    if (reply.task_id?.startsWith('monitor-')) {
      const monitorId = reply.task_id.replace('monitor-', '');
      const monitor = db.prepare('SELECT platform FROM social_monitors WHERE id=?').get(monitorId);
      if (monitor) platform = monitor.platform;
    }

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

// ── 自动回复：监控自己帖子 ──

// POST /monitors — 添加要监控的帖子
router.post('/monitors', (req, res) => {
  try {
    const { platform, post_url, name, reply_prompt, trigger_keywords, check_interval, auto_send } = req.body;
    if (!platform || !post_url) {
      return res.status(400).json({ code: 400, message: 'platform 和 post_url 必填' });
    }
    const id = crypto.randomUUID();
    db.prepare(`INSERT INTO social_monitors (id, platform, post_url, name, reply_prompt, trigger_keywords, check_interval, auto_send)
      VALUES (?,?,?,?,?,?,?,?)`).run(id, platform, post_url, name || post_url.slice(0, 50), reply_prompt || '', trigger_keywords || '', check_interval || 900, auto_send ? 1 : 0);
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
    const { name, reply_prompt, trigger_keywords, enabled, check_interval, auto_send } = req.body;
    const existing = db.prepare('SELECT * FROM social_monitors WHERE id=?').get(req.params.id);
    if (!existing) return res.status(404).json({ code: 404, message: '不存在' });

    const fields = []; const params = [];
    if (name !== undefined) { fields.push('name=?'); params.push(name); }
    if (reply_prompt !== undefined) { fields.push('reply_prompt=?'); params.push(reply_prompt); }
    if (trigger_keywords !== undefined) { fields.push('trigger_keywords=?'); params.push(trigger_keywords); }
    if (enabled !== undefined) { fields.push('enabled=?'); params.push(enabled ? 1 : 0); }
    if (check_interval !== undefined) { fields.push('check_interval=?'); params.push(check_interval); }
    if (auto_send !== undefined) { fields.push('auto_send=?'); params.push(auto_send ? 1 : 0); }
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

  // 1. 通过 auto_douyin Playwright 浏览器采集最新评论
  let newComments = [];
  try {
    const { scrapeComments } = require('../services/multi-publish');
    const scrapeResult = await scrapeComments(monitor.platform, monitor.post_url);
    console.log('[auto-reply] scrapeComments 返回:', JSON.stringify({ count: scrapeResult.count, platform: scrapeResult.platform }));

    // 补齐字段以兼容后续流程
    newComments = (scrapeResult.comments || []).map(c => ({
      ...c,
      post_author: c.post_author || '',
      post_body: c.post_body || '',
      post_likes: c.post_likes || 0,
      post_comments_count: c.post_comments_count || 0,
      raw_json: c.raw_json || '{}',
    }));
    console.log('[auto-reply] 采集到评论数:', newComments.length);
  } catch (e) {
    console.error('[auto-reply] crawl error:', e.message);
    return;
  }

  if (!newComments.length) {
    console.log('[auto-reply] 没有提取到任何评论，结束');
    db.prepare(`UPDATE social_monitors SET last_checked_at=datetime('now','localtime') WHERE id=?`).run(monitor.id);
    return;
  }

  // 2. 筛选新评论（按 monitor task_id 去重，避免短链接/直链 URL 不匹配）
  const taskId = 'monitor-' + monitor.id;
  const existingContents = new Set(
    db.prepare(`SELECT comment_content FROM social_comments WHERE task_id=?`)
      .all(taskId).map(r => r.comment_content?.slice(0, 50))
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
