// 爆款视频 — 内容提取 + AI 改写 + 多平台爬虫
const { Router } = require('express');
const { extractFromUrl } = require('../services/content-extractor');
const { rewriteContent } = require('../services/content-rewriter');
const { extract: mcExtract } = require('../services/media-crawler');
const router = Router();

// 通用 URL 提取（原有）
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

// MediaCrawler 多平台搜索提取
router.post('/crawl', async (req, res) => {
  try {
    const { platform, keyword, limit } = req.body;
    if (!platform || !keyword) return res.status(400).json({ code: 400, message: 'platform 和 keyword 必填' });
    const result = await mcExtract({ platform, keyword, limit: limit || 10 });
    res.json({ code: 200, data: result });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// AI 改写
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

// TTS 试听
router.get('/tts-preview', async (req, res) => {
  try {
    const voice = req.query.voice || 'zh-CN-YunxiNeural';
    const text = req.query.text || '你好，这是一个语音试听示例。';
    const { tts, sanitizeText } = require('../services/tts');
    const cleanText = sanitizeText(text);
    console.log('[tts-preview] voice:', voice, 'text:', cleanText.substring(0, 50));
    const audioPath = await tts(cleanText, voice, 1.0);
    const buf = require('fs').readFileSync(audioPath);
    try { require('fs').unlinkSync(audioPath); } catch {}
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

module.exports = router;
