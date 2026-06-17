const express = require('express');
const router = express.Router();
const wsClient = require('../openclaw/ws-client');
const { getTranslations, translateInBackground, translateBatch } = require('../services/skill-translator');

function openclaw(method, params) {
  return wsClient.request(method, params).catch(err => {
    throw { status: 503, message: 'OpenClaw 服务不可用: ' + err.message };
  });
}

// GET /api/clawhub/search?q=weather&limit=20
router.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q || !q.trim()) return res.json({ code: 200, data: [] });
    const result = await openclaw('skills.search', {
      query: q.trim(),
      limit: parseInt(limit) || 20
    });
    const skills = (result.results || []).map(r => ({
      slug: r.slug,
      name: r.displayName || r.slug,
      description: r.summary || '',
      version: r.version,
      updatedAt: r.updatedAt,
      owner: r.ownerHandle || (r.owner?.displayName)
    }));
    res.json({ code: 200, data: skills });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// GET /api/clawhub/skills/:slug
router.get('/skills/:slug', async (req, res) => {
  try {
    const result = await openclaw('skills.detail', { slug: req.params.slug });
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/clawhub/install — body: { slug }
router.post('/install', async (req, res) => {
  try {
    const { slug } = req.body;
    if (!slug) return res.status(400).json({ code: 400, message: 'slug 为必填项' });
    const result = await openclaw('skills.install', {
      source: 'clawhub',
      slug,
      force: false
    });
    res.json({ code: 200, data: result });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// GET /api/clawhub/status
router.get('/status', async (req, res) => {
  try {
    const result = await openclaw('skills.status');
    const translations = getTranslations();
    const skills = (result.skills || []).map(s => {
      const t = translations[s.skillKey || s.name];
      return {
        ...s,
        nameZh: t?.name_zh || null,
        descZh: t?.desc_zh || null
      };
    });
    // 后台翻译未缓存的技能
    const untranslated = skills.filter(s => !translations[s.skillKey || s.name]);
    if (untranslated.length > 0) {
      translateInBackground(untranslated);
    }
    res.json({ code: 200, data: { ...result, skills } });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

// POST /api/clawhub/translate-batch — 批量翻译所有未缓存技能
router.post('/translate-batch', async (req, res) => {
  try {
    const result = await openclaw('skills.status');
    const skills = (result.skills || []).map(s => ({
      skillKey: s.skillKey || s.name,
      name: s.name,
      description: s.description || s.summary || ''
    }));
    const r = await translateBatch(skills, 3);
    res.json({ code: 200, data: r });
  } catch (e) {
    res.status(e.status || 500).json({ code: e.status || 500, message: e.message });
  }
});

module.exports = router;
