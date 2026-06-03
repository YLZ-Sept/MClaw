// 多平台发布路由 — 代理 auto_douyin API (抖音/小红书/微信视频号)
const { Router } = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { health, getAccountStatus, login, uploadVideo, getPlatformLabel } = require('../services/multi-publish');

const router = Router();
const VIDEOS_DIR = path.join(__dirname, '..', 'videos');

// 检查 auto_douyin 服务状态
router.get('/health', async (req, res) => {
  try {
    const result = await health();
    res.json({ code: 200, data: result });
  } catch (e) {
    res.json({ code: 200, data: { status: 'unreachable', error: e.message } });
  }
});

// 获取账号状态
router.get('/account/:name/status', async (req, res) => {
  try {
    const platform = req.query.platform || 'douyin';
    const result = await getAccountStatus(req.params.name, platform);
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(502).json({ code: 502, message: e.message });
  }
});

// 登录账号（打开浏览器手动扫码）
router.post('/account/:name/login', async (req, res) => {
  try {
    const platform = req.body.platform || 'douyin';
    const result = await login(req.params.name, platform);
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(502).json({ code: 502, message: e.message });
  }
});

// 发布 hot_content 到指定平台
router.post('/contents/:contentId/publish', async (req, res) => {
  const cur = db.prepare('SELECT * FROM hot_contents WHERE id=?').get(req.params.contentId);
  if (!cur) return res.status(404).json({ code: 404, message: '内容不存在' });
  if (cur.status !== 'approved' && cur.status !== 'published') return res.status(400).json({ code: 400, message: '只有已通过审核的内容才能发布' });

  const videoPath = cur.video_url || cur.video_url_landscape;
  if (!videoPath || !fs.existsSync(videoPath)) {
    return res.status(400).json({ code: 400, message: '视频文件不存在，请先生成视频' });
  }

  const platform = req.body.platform || 'douyin';
  const accountName = req.body.account_name || 'default';
  const title = (req.body.title || cur.title || '').trim();
  const tags = req.body.tags
    ? (Array.isArray(req.body.tags) ? req.body.tags : req.body.tags.split(',').map(t => t.trim()).filter(Boolean))
    : (cur.tags ? cur.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
  const description = (req.body.description || cur.body || '').trim();
  const publishDate = req.body.publish_date || null;
  const label = getPlatformLabel(platform);

  try {
    const result = await uploadVideo({
      accountName,
      platform,
      videoPath,
      title,
      tags,
      description,
      publishDate,
      coverOrientation: req.body.cover_orientation || 'portrait',
      location: req.body.location || '',
    });

    if (result.success) {
      // 多平台追加模式
      const currentPlatforms = (cur.platforms || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!currentPlatforms.includes(platform)) {
        currentPlatforms.push(platform);
      }
      const newPlatforms = currentPlatforms.join(',');
      db.prepare(`UPDATE hot_contents SET platforms=?,status='published',published_at=datetime('now','localtime') WHERE id=?`)
        .run(newPlatforms, req.params.contentId);
    }

    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(502).json({ code: 502, message: `${label}发布失败: ${e.message}` });
  }
});

module.exports = router;
