// 爆款视频 — 内容提取 + AI 改写
const { Router } = require('express');
const { extractFromUrl } = require('../services/content-extractor');
const { rewriteContent } = require('../services/content-rewriter');
const router = Router();

router.post('/content', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ code: 400, message: 'url 必填' });
    const result = await extractFromUrl(url);
    res.json({ code: 200, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.post('/rewrite', async (req, res) => {
  try {
    const { source_title, source_body, source_tags, source_url, source_platform, user_prompt } = req.body;
    if (!source_title && !source_body) return res.status(400).json({ code: 400, message: '缺少原文内容' });
    const result = await rewriteContent({
      title: source_title, body: source_body, tags: source_tags, platform: source_platform || 'other'
    }, user_prompt);
    res.json({ code: 200, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
