// 爆款视频 — AI 改写 + 改写历史 + TTS 试听
const { Router } = require('express');
const crypto = require('crypto');
const { rewriteContent } = require('../services/content-rewriter');
const router = Router();

function getDB() {
  return require('../db');
}

// AI 改写
router.post('/rewrite', async (req, res) => {
  try {
    const { source_body, versions, remove_ai_trace, word_limit, user_prompt } = req.body;
    if (!source_body) return res.status(400).json({ code: 400, message: '缺少原文内容' });
    const result = await rewriteContent({ source_body, versions, remove_ai_trace, word_limit, user_prompt });
    console.log('[rewrite] result keys:', Object.keys(result));

    // Auto-save to history
    try {
      const db = getDB();
      const id = crypto.randomUUID();
      const v = versions && versions.length ? versions : ['口播版', '种草版', '促单版'];
      db.prepare('INSERT INTO rewrite_history (id, source_body, result_json, versions) VALUES (?, ?, ?, ?)').run(
        id, source_body, JSON.stringify(result), v.join(',')
      );
      res.json({ code: 200, data: result, history_id: id });
    } catch (e) {
      console.error('[rewrite] save history failed:', e.message);
      res.json({ code: 200, data: result });
    }
  } catch (err) {
    console.error('[rewrite] error:', err.message);
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 改写历史
router.get('/history', async (req, res) => {
  try {
    const db = getDB();
    const rows = db.prepare('SELECT id, source_body, versions, created_at FROM rewrite_history ORDER BY created_at DESC LIMIT 50').all();
    res.json({ code: 200, data: rows });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

router.get('/history/:id', async (req, res) => {
  try {
    const db = getDB();
    const row = db.prepare('SELECT * FROM rewrite_history WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '记录不存在' });
    row.result = JSON.parse(row.result_json);
    res.json({ code: 200, data: row });
  } catch (err) {
    res.status(500).json({ code: 500, message: err.message });
  }
});

// 删除改写历史
router.delete('/history/:id', async (req, res) => {
  try {
    const db = getDB();
    const row = db.prepare('SELECT id FROM rewrite_history WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ code: 404, message: '记录不存在' });
    db.prepare('DELETE FROM rewrite_history WHERE id = ?').run(req.params.id);
    res.json({ code: 200, data: { status: 'deleted' } });
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
